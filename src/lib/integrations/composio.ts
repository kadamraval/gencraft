import { composioCall, openExternal } from "@/lib/registry/net"

/**
 * Composio, used with the person's own key. Composio signs in to apps (Pinterest and later others) with its
 * managed OAuth and runs their actions. The app never sees the app's password or token: it holds a connected
 * account id and asks Composio to run a tool for it.
 */

const API = "/api/v3.1"
const STORE_KEY = "gencraft_composio_v1"

export interface ComposioState {
  /** Names this install to Composio. Random, kept on this device. */
  userId: string
  /** The managed auth config found or created for each app */
  authConfigs: Record<string, string>
  /** The connected account for each app */
  accounts: Record<string, { id: string; status: string }>
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return `gencraft-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

export function readComposioState(): ComposioState {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw) as ComposioState
  } catch {
    // unreadable: a fresh state is made below
  }
  const fresh: ComposioState = { userId: randomId(), authConfigs: {}, accounts: {} }
  writeComposioState(fresh)
  return fresh
}

export function writeComposioState(state: ComposioState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: the connection lasts until the app closes
  }
}

export class ComposioError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

async function request<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await composioCall(key)(`${API}${path}`, init)
  } catch {
    throw new ComposioError("Could not reach Composio. Check your connection.")
  }
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message
    if (res.status === 401 || res.status === 403) throw new ComposioError("Composio did not accept this key. Check it and try again.", res.status)
    if (res.status === 429) throw new ComposioError("Composio says too many requests. Wait a minute and try again.", res.status)
    throw new ComposioError(message ?? `Composio answered HTTP ${res.status}`, res.status)
  }
  return body as T
}

/** Checks the key by asking for one page of the account's auth configs. */
export async function testComposioKey(key: string): Promise<void> {
  try {
    await request(key, "/auth_configs?limit=1")
  } catch (e) {
    // The Connect page of the dashboard also shows a key (ck_...). It is for MCP clients and does not open this API.
    if (e instanceof ComposioError && e.status === 401 && key.trim().startsWith("ck_")) {
      throw new ComposioError("This is the Connect key (it starts with ck_). The app needs a project API key: open your project in the Composio dashboard, then Settings, then API Keys.", 401)
    }
    throw e
  }
}

/** The Composio-managed auth config for an app: an existing one, or a new one. */
async function authConfigFor(key: string, toolkit: string, state: ComposioState): Promise<string> {
  const known = state.authConfigs[toolkit]
  if (known) return known
  const list = await request<{ items?: Array<{ id: string; status?: string }> }>(key, `/auth_configs?toolkit_slug=${toolkit}&is_composio_managed=true&limit=10`)
  let id = list.items?.find((c) => c.status !== "DISABLED")?.id
  if (!id) {
    const made = await request<{ auth_config?: { id?: string } }>(key, "/auth_configs", {
      method: "POST",
      body: JSON.stringify({ toolkit: { slug: toolkit }, auth_config: { type: "use_composio_managed_auth" } }),
    })
    id = made.auth_config?.id
  }
  if (!id) throw new ComposioError(`Composio did not return a sign-in setup for ${toolkit}.`)
  state.authConfigs[toolkit] = id
  writeComposioState(state)
  return id
}

export interface ConnectStart {
  /** Where the person signs in */
  url: string
  accountId: string
}

/** Starts the sign-in: returns the page to open. The connection is not active until the person finishes there. */
export async function startConnect(key: string, toolkit: string): Promise<ConnectStart> {
  const state = readComposioState()
  const authConfigId = await authConfigFor(key, toolkit, state)
  const link = await request<{ redirect_url?: string; connected_account_id?: string }>(key, "/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({ auth_config_id: authConfigId, user_id: state.userId }),
  })
  if (!link.redirect_url || !link.connected_account_id) throw new ComposioError("Composio did not return a sign-in page.")
  state.accounts[toolkit] = { id: link.connected_account_id, status: "INITIATED" }
  writeComposioState(state)
  return { url: link.redirect_url, accountId: link.connected_account_id }
}

export async function openSignIn(url: string): Promise<boolean> {
  return openExternal(url)
}

/** Reads one connected account's status: ACTIVE once the person has signed in. */
export async function accountStatus(key: string, accountId: string): Promise<string> {
  const a = await request<{ status?: string }>(key, `/connected_accounts/${accountId}`)
  return a.status ?? "UNKNOWN"
}

/** Waits until the sign-in finishes (or fails, or the time runs out). */
export async function waitForConnection(key: string, toolkit: string, accountId: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<"ACTIVE"> {
  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60 * 1000)
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new ComposioError("Cancelled.")
    const status = await accountStatus(key, accountId)
    const state = readComposioState()
    state.accounts[toolkit] = { id: accountId, status }
    writeComposioState(state)
    if (status === "ACTIVE") return "ACTIVE"
    if (status === "FAILED" || status === "EXPIRED" || status === "INACTIVE") throw new ComposioError("The sign-in did not finish. Start it again.")
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new ComposioError("The sign-in took too long. Start it again.")
}

/** Removes the connection here and at Composio, and revokes the app's access. */
export async function disconnect(key: string, toolkit: string): Promise<void> {
  const state = readComposioState()
  const account = state.accounts[toolkit]
  if (account) {
    try {
      await request(key, `/connected_accounts/${account.id}?revoke_on_delete=true`, { method: "DELETE" })
    } catch (e) {
      // Already gone at Composio: the local record is still removed
      if (!(e instanceof ComposioError && e.status === 404)) throw e
    }
  }
  delete state.accounts[toolkit]
  writeComposioState(state)
}

export function isConnected(toolkit: string): boolean {
  return readComposioState().accounts[toolkit]?.status === "ACTIVE"
}

/** Runs one tool for the connected account and returns its data. Composio's own failure text is passed on. */
export async function executeTool(key: string, toolkit: string, slug: string, args: Record<string, unknown>): Promise<unknown> {
  const state = readComposioState()
  const account = state.accounts[toolkit]
  if (!account || account.status !== "ACTIVE") throw new ComposioError(`${toolkit} is not connected. Connect it in Settings, Integrations.`)
  const res = await request<{ successful?: boolean; data?: unknown; error?: string | null }>(key, `/tools/execute/${slug}`, {
    method: "POST",
    body: JSON.stringify({ user_id: state.userId, connected_account_id: account.id, arguments: args }),
  })
  if (res.successful === false) throw new ComposioError(res.error || "The app returned an error.")
  const data = res.data
  if (typeof data === "string") {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
  return data
}
