export interface FalRunResult {
  imageUrls: string[]
  videoUrl?: string
  audioUrl?: string
  raw: unknown
}

interface FalQueueSubmit {
  request_id: string
  status_url: string
  response_url: string
}

interface FalStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"
  queue_position?: number
}

interface FalOutput {
  images?: Array<{ url?: string }>
  image?: { url?: string }
  video?: { url?: string }
  audio?: { url?: string }
  audio_file?: { url?: string }
}

export class FalRunError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = "FalRunError"
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })

/**
 * Runs any fal endpoint through the queue API: submit, poll status, fetch result.
 * The endpoint comes from the model registry, so every model the user picks is the model that runs.
 */
export async function runFalEndpoint(opts: {
  endpoint: string
  apiKey: string
  input: Record<string, unknown>
  signal?: AbortSignal
  timeoutMs?: number
  onStatus?: (message: string) => void
}): Promise<FalRunResult> {
  const { endpoint, apiKey, input, signal, onStatus } = opts
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000
  const headers = { Authorization: `Key ${apiKey.trim()}`, "Content-Type": "application/json" }

  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal,
  })
  if (!submit.ok) {
    const err = await submit.text().catch(() => "")
    throw new FalRunError(`fal submit failed (HTTP ${submit.status}): ${err.slice(0, 200)}`, submit.status)
  }
  const job = (await submit.json()) as FalQueueSubmit
  onStatus?.(`Queued ${job.request_id.slice(0, 8)}`)

  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (Date.now() > deadline) throw new FalRunError("fal run timed out")
    const st = await fetch(job.status_url, { headers, signal })
    if (!st.ok) throw new FalRunError(`fal status failed (HTTP ${st.status})`, st.status)
    const status = (await st.json()) as FalStatus
    if (status.status === "COMPLETED") break
    onStatus?.(status.status === "IN_QUEUE" ? `In queue${status.queue_position != null ? ` (#${status.queue_position})` : ""}` : "Generating")
    await sleep(1500, signal)
  }

  const res = await fetch(job.response_url, { headers, signal })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new FalRunError(`fal result failed (HTTP ${res.status}): ${err.slice(0, 200)}`, res.status)
  }
  const out = (await res.json()) as FalOutput
  const imageUrls = [...(out.images ?? []).map((i) => i.url), out.image?.url].filter((u): u is string => Boolean(u))
  return {
    imageUrls,
    videoUrl: out.video?.url,
    audioUrl: out.audio?.url ?? out.audio_file?.url,
    raw: out,
  }
}
