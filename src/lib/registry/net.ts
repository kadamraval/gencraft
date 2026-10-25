/**
 * Network access for reading official provider pages.
 *
 * Provider documentation sites do not allow requests from a web page, so inside the desktop app these reads
 * go through Tauri's HTTP plugin, which is not subject to that browser rule. In a plain browser (development)
 * they fall back to normal fetch and fail with a clear message for the sites that refuse it.
 */

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function appFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isDesktopApp()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http")
    return tauriFetch(url, init)
  }
  return fetch(url, init)
}

export async function fetchText(url: string): Promise<string> {
  const res = await appFetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** Reads a replicate.com model page: straight from the desktop app, through the dev proxy in a browser. */
export function replicatePageFetch(url: string, init?: RequestInit): Promise<Response> {
  if (isDesktopApp()) return appFetch(url, init)
  return fetch(url.replace("https://replicate.com", "/api/proxy/rweb"), init)
}

/** Calls Composio with the user's own key. Same rule as the other providers: straight from the desktop app, through the dev proxy in a browser. */
export function composioCall(key: string): (path: string, init?: RequestInit) => Promise<Response> {
  return (path, init = {}) => {
    const headers = { "x-api-key": key.trim(), "Content-Type": "application/json", ...((init.headers as Record<string, string> | undefined) ?? {}) }
    return isDesktopApp() ? appFetch(`https://backend.composio.dev${path}`, { ...init, headers }) : fetch(`/api/proxy/composio${path}`, { ...init, headers })
  }
}

/** Calls OpenAI or Google Gemini with the person's key: straight from the desktop app, through the dev proxy in a browser. */
export function providerFetch(provider: "openai" | "gemini", path: string, init?: RequestInit): Promise<Response> {
  const host = provider === "openai" ? "https://api.openai.com" : "https://generativelanguage.googleapis.com"
  return isDesktopApp() ? appFetch(`${host}${path}`, init) : fetch(`/api/proxy/${provider}${path}`, init)
}

/** Calls fal's run host (its OpenAI-compatible chat endpoint): straight from the desktop app, through the dev proxy in a browser. */
export function falRunFetch(url: string, init?: RequestInit): Promise<Response> {
  return isDesktopApp() ? appFetch(url, init) : fetch(url.replace("https://fal.run", "/api/proxy/runfal"), init)
}

/** Opens a page in the system browser (the desktop app) or a new tab. Returns false when nothing could be opened. */
export async function openExternal(url: string): Promise<boolean> {
  try {
    if (isDesktopApp()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener")
      await openUrl(url)
      return true
    }
    return Boolean(window.open(url, "_blank", "noopener"))
  } catch {
    return false
  }
}

/**
 * Calls the Replicate API with the user's token. The desktop app goes straight to Replicate through Tauri's
 * HTTP. In the browser, Replicate refuses cross-origin requests, so development goes through the dev proxy.
 */
export function replicateCall(token: string): (path: string, init?: RequestInit) => Promise<Response> {
  return (path, init = {}) => {
    const headers = { Authorization: `Bearer ${token.trim()}`, ...((init.headers as Record<string, string> | undefined) ?? {}) }
    return isDesktopApp() ? appFetch(`https://api.replicate.com${path}`, { ...init, headers }) : fetch(`/api/proxy/replicate${path}`, { ...init, headers })
  }
}
