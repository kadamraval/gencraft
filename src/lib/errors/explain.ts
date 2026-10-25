/**
 * Turns what a provider or the network said into something a person can act on.
 *
 * Provider errors are written for developers ("BadRequestError: Error code: 400 - {'error': ...}"). Every failure
 * is sorted into one of a few kinds, each with a plain title, what happened, what to do, and whether trying again
 * can help. The original text is always kept, for the Log.
 */

export type ErrorKind = "no-key" | "auth" | "rate-limit" | "credit" | "safety" | "bad-input" | "not-found" | "provider-fault" | "timeout" | "network" | "file" | "unknown"

export interface FriendlyError {
  kind: ErrorKind
  title: string
  message: string
  hint?: string
  /** Trying the same thing again can work */
  retryable: boolean
  /** A button the card can offer */
  action?: "settings" | "retry"
  /** The original text, unchanged */
  raw: string
}

export interface ErrorContext {
  provider?: string
  model?: string
  /** The model has a safety switch the user can change */
  hasSafetySwitch?: boolean
}

const PROVIDER_NAME: Record<string, string> = { fal: "fal.ai", replicate: "Replicate", openrouter: "OpenRouter", gemini: "Google Gemini", openai: "OpenAI" }

/** The model-router prefix and similar wrappers add nothing for a person. */
function strip(raw: string): string {
  return raw
    .replace(/^Fallback sequence exhausted for \w+\. Attempted \d+ models? \([^)]*\):\s*/i, "")
    .replace(/^Live API fetch exception:\s*/i, "")
    .trim()
}

function statusOf(text: string): number | undefined {
  const m = text.match(/\bHTTP (\d{3})\b/i) ?? text.match(/\b(?:status|code)[:= ]+(\d{3})\b/i) ?? text.match(/\b(400|401|402|403|404|408|409|413|422|429|500|502|503|504)\b/)
  return m ? Number(m[1]) : undefined
}

/** Which service the request really ended up at, when the text says so (Replicate and OpenRouter pass these on). */
function upstreamOf(text: string): string | undefined {
  return text.match(/provider_name['"]?\s*[:=]\s*['"]([^'"]+)['"]/i)?.[1]
}

/** The setting a validation error names, when it names one. */
function fieldOf(text: string): string | undefined {
  return (
    text.match(/['"]loc['"]:\s*\[[^\]]*['"]([a-z_][a-z0-9_]*)['"]\s*\]/i)?.[1] ??
    text.match(/\b([a-z_][a-z0-9_]{2,})\b\s*(?:is required|field required|must be|should be|is not a valid)/i)?.[1] ??
    text.match(/(?:unexpected|unknown|invalid) (?:field|parameter|argument|input)[: ]+['"]?([a-z_][a-z0-9_]*)/i)?.[1]
  )
}

export function explainError(rawInput: string, ctx: ErrorContext = {}): FriendlyError {
  const raw = rawInput
  const text = strip(rawInput)
  const status = statusOf(text)
  // The provider that really refused: the router names the models it tried, and the text often names the service
  const tried = rawInput.match(/Attempted (\d+) models? \(([^)]*)\)/i)
  // The model's own id ("google/gemini-3.5-flash") and the echo of what was sent say nothing about who answered
  const said = text.replace(/Request sent to[\s\S]*$/i, "")
  const named = /replicate/i.test(said)
    ? "replicate"
    : /openrouter/i.test(said)
      ? "openrouter"
      : /\bfal\b|fal\.ai/i.test(said)
        ? "fal"
        : /openai/i.test(said)
          ? "openai"
          : /gemini api|generativelanguage|googleapis|google gemini/i.test(said)
            ? "gemini"
            : undefined
  const provider = named ?? ctx.provider
  const name = (provider && PROVIDER_NAME[provider]) || provider || "The provider"
  const triedNote = tried ? ` Tried: ${tried[2]}.` : ""
  const upstream = upstreamOf(text)
  const make = (kind: ErrorKind, title: string, message: string, extra: Partial<FriendlyError> = {}): FriendlyError => ({ kind, title, message, retryable: false, raw, ...extra })

  if (/cannot run the agent/i.test(text)) {
    return make("bad-input", `${ctx.model ?? "This model"} cannot run the agent`, "The agent needs a chat model that can call tools, from OpenRouter, OpenAI or Google Gemini.", { hint: "Switch on one of those chat models in Settings, Providers, and set it as the Agent model in General." })
  }

  if (/no (chat|text|image|video|audio) model is available/i.test(text)) {
    const what = /no (\w+) model/i.exec(text)?.[1]?.toLowerCase() ?? "chat"
    return make("no-key", `Switch on a ${what === "text" ? "chat" : what} model first`, `Nothing can run yet: no ${what === "text" ? "chat" : what} model is switched on.`, {
      hint: "Open Settings, Providers, add a key for a provider, and switch a model of this kind on.",
      action: "settings",
    })
  }

  if (/no \w+ key is set|add one in settings/i.test(text)) {
    return make("no-key", `Add your ${name} key`, `No key is saved for ${name}, so nothing was sent.`, { hint: "Open Settings, Providers, paste the key and save.", action: "settings" })
  }

  // The run worked but the model said nothing
  if (/returned no text|empty (response|reply)|returned nothing/i.test(text)) {
    return make("provider-fault", `${ctx.model ?? "The model"} answered with nothing`, `${name} ran the model and it finished, but sent back an empty reply. Your key is fine.${triedNote} Usual reasons: the question needs something this model cannot do from here (opening a web page or link, since web search only works on OpenAI, Google Gemini and OpenRouter chat models); the model spent its whole output limit "thinking" before it wrote anything; or its safety filter silently blocked the reply.`, {
      hint: "Try again with a plain question (paste the page text instead of a link), or pick a chat model from OpenAI, Google Gemini or OpenRouter in the composer. For a Replicate model, raise its max tokens in the settings next to the model chip.",
      retryable: true,
      action: "retry",
    })
  }

  // The key is fine but the account or project behind it is blocked, or the service is switched off for it
  if (/project (has been )?denied|denied access|suspended|(account|project) (is |has been )?(disabled|deactivated|banned|blocked)|service_disabled|has not been (used|enabled)|api (has not been|is not) enabled|billing (account )?(is )?(disabled|not (enabled|active))/i.test(text)) {
    return make("auth", `${name} has blocked the account behind your key`, `${name} answered, but refused the request: "${text.slice(0, 160)}". Your key was read correctly. The account or project it belongs to is blocked, suspended, or does not have this service switched on.${triedNote}`, {
      hint:
        provider === "gemini"
          ? "Fix: create a new key at aistudio.google.com under a different Google project (or enable the Generative Language API and billing on this one), then paste it in Settings, Providers. Or use another provider's chat model."
          : `Fix: sign in to your ${name} account and check it is active, has billing or credit, and the service is enabled. Then create a fresh key and paste it in Settings, Providers. Or use another provider's chat model.`,
      action: "settings",
    })
  }

  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid api key|incorrect api key|authentication (is )?required|api key (is )?(not valid|invalid|missing)|forbidden|permission denied|cannot access application/i.test(text)) {
    return make("auth", `${name} did not accept your key`, `The saved key was refused. It may be wrong, expired, or without access to this model.${triedNote}`, { hint: "Open Settings, Providers and paste the key again.", action: "settings" })
  }

  if (status === 402 || /insufficient|out of credit|no credit|balance|billing|payment required|exceeded your current quota|spend limit/i.test(text)) {
    return make("credit", `${name} says your balance is too low`, "Your account has no credit left for this run.", { hint: `Add credit in your ${name} account, then try again.`, retryable: true, action: "retry" })
  }

  if (status === 429 && /less than \$?\d+(\.\d+)? in credit|reduced to \d+ requests per minute/i.test(said)) {
    return make("rate-limit", `${name} is limiting this account because its credit is low`, `${name} allows only a few runs a minute while the account has less than $5 in credit. The app waits and tries again by itself, so answers can be slow.${triedNote}`, {
      hint: `Add at least $5 credit in your ${name} account to lift the limit, or put a model from another provider first in Settings, Models.`,
      retryable: true,
      action: "retry",
    })
  }

  if (status === 429 || /rate.?limit|too many requests|resource_exhausted|quota/i.test(text)) {
    return make("rate-limit", `${name} is asking you to slow down`, "Too many requests were sent in a short time.", { hint: "Wait a minute and try again.", retryable: true, action: "retry" })
  }

  if (/safety|nsfw|content policy|content_policy|flagged|moderation|violat|prohibited|sensitive content|not allowed|blocked/i.test(text)) {
    return make("safety", `${name} blocked this request for safety`, "The prompt or an image was refused by the content filter.", {
      hint: ctx.hasSafetySwitch ? "Change the wording, or turn the Safety filter off in Settings, General. This model has a switch." : "Change the wording or the image. This model always filters and has no switch.",
    })
  }

  if (status === 404 || /not found|does not exist|no longer available|deprecated|model_not_found|unknown model|retired/i.test(text)) {
    return make("not-found", "This model is not available", `${name} no longer serves ${ctx.model ?? "this model"}.`, { hint: "Choose another model. The list in Settings, Providers refreshes weekly." })
  }

  if (status === 413 || /file too large|payload too large|too large|unsupported (media|file|format|image)|mime/i.test(text)) {
    return make("file", "A file could not be used", "An attached image, video or audio is too large or in a format this model does not accept.", { hint: "Use a smaller file, or a common format such as PNG, JPG or MP4." })
  }

  if (/timed out|timeout|aborted|deadline/i.test(text) || status === 408 || status === 504) {
    return make("timeout", `${name} took too long`, "The run did not finish in time.", { hint: "Try again. Long videos can need a second attempt.", retryable: true, action: "retry" })
  }

  if (/failed to fetch|networkerror|load failed|fetch failed|econn|enotfound|network request failed|could not reach/i.test(text)) {
    return make("network", `Could not reach ${name}`, "The request did not get through. Your connection, a firewall or the provider may be down.", { hint: "Check your connection and try again.", retryable: true, action: "retry" })
  }

  // The service answered, but the model behind it failed. Name who really failed when the text says so.
  if ((status && status >= 500) || /upstream|internal server error|bad gateway|service unavailable|prediction failed|run failed|server error|provider_name/i.test(text)) {
    const behind = upstream ? ` (it runs on ${upstream})` : ""
    return make("provider-fault", `${ctx.model ?? "This model"} failed on ${name}'s side${behind}`, "The provider's own service returned an error. Your key and settings are fine.", {
      hint: "Try again, or switch to another model. If you have a second model switched on for this kind of work, it takes over automatically.",
      retryable: true,
      action: "retry",
    })
  }

  if (status === 400 || status === 422 || /invalid|validation|unprocessable|field required|unexpected|not a valid|bad request/i.test(text)) {
    const field = fieldOf(text)
    return make("bad-input", `${name} rejected a setting`, field ? `The model did not accept the "${field.replace(/_/g, " ")}" setting.` : "The model did not accept something in the request.", {
      hint: "Change the settings under the prompt, or try another model. The Log shows exactly what was sent.",
    })
  }

  return make("unknown", "Something went wrong", `${text.length > 200 ? `${text.slice(0, 197)}...` : text || "The run failed without a message."}${triedNote}`, { hint: "This message came from the provider and was not recognised. Read it for the cause, try again, or pick a model from another provider. The Log has the full text.", retryable: true, action: "retry" })
}
