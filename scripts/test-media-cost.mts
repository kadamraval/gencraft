import { generateText } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { actualCostOf } from "../src/lib/ledger/actual-cost"
import { reconcileFal } from "../src/lib/ledger/fal-usage"
import type { FalBucket } from "../src/lib/ledger/fal-usage"
import { withUsage } from "../src/lib/ledger/text-usage"
import { usageLedger } from "../src/lib/ledger/usage-store"
import type { UsageLedgerItem } from "../src/lib/ledger/usage-store"
import type { ModelRecord } from "../src/lib/registry/types"

/**
 * What a run really cost, where a provider says so, and how fal's own billing corrects the runs it does not report. The fal data is
 * shaped as fal documents it: line items per endpoint with a unit, a quantity, a unit price and a cost_total, in time buckets.
 */

let fails = 0
const check = (name: string, ok: boolean, extra: unknown = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : JSON.stringify(extra)}`)
  if (!ok) fails++
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

// a provider that reports the cost
check("OpenRouter's own cost is taken as exact", JSON.stringify(actualCostOf({ provider: "openrouter" }, { usage: { cost: 0.0123 } })) === JSON.stringify({ usd: 0.0123, basis: "exact", note: "Cost reported by OpenRouter" }))
check("a cost of zero (a free model) is a real figure", actualCostOf({ provider: "openrouter" }, { usage: { cost: 0 } })?.usd === 0)
check("a response with no cost is not guessed at", actualCostOf({ provider: "openrouter" }, { usage: { prompt_tokens: 5 } }) === null && actualCostOf({ provider: "openrouter" }, undefined) === null)
check("providers that do not report a cost have none", actualCostOf({ provider: "fal" }, { usage: { cost: 1 } }) === null && actualCostOf({ provider: "replicate" }, { metrics: { predict_time: 3 } }) === null)

// OpenRouter text: the cost it reports replaces tokens times price
{
  const rec = { id: "openrouter/x", endpoint: "x", provider: "openrouter", name: "x", modality: "text", inputs: ["text"], params: { type: "object", properties: {} }, price: { unit: "per_1m_tokens", amount: 1, outputAmount: 2, source: "api", fetchedAt: "" }, status: "active" } as unknown as ModelRecord
  const before = usageLedger.getAllItems().length
  const inner = new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: "hi" }], finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: 1000, noCache: 1000 }, outputTokens: { total: 100, text: 100 } }, providerMetadata: { openrouter: { usage: { cost: 0.0042 } } }, warnings: [] }) as never,
  })
  await generateText({ model: withUsage(inner, rec, { label: "Chat" }), prompt: "hi" })
  const added = usageLedger.getAllItems().slice(0, usageLedger.getAllItems().length - before)
  check("an OpenRouter call is recorded at the cost it reported, marked exact", added.length === 1 && near(added[0]!.costUsd, 0.0042) && added[0]?.basis === "exact", added)
}

// fal's billing corrects its runs
const run = (id: string, endpoint: string, at: string, costUsd: number, extra: Partial<UsageLedgerItem> = {}): UsageLedgerItem =>
  ({ id, modelName: endpoint, category: "image", provider: "fal", action: "Deducted", costUsd, date: "", timestamp: Date.parse(at), feature: "x", credits: 0, basis: "estimated", endpoint, ...extra }) as UsageLedgerItem
const line = (endpoint_id: string, cost_total: number) => ({ endpoint_id, unit: "images", quantity: 1, unit_price: cost_total, cost_total, currency: "USD" })
const day = (iso: string, ...results: ReturnType<typeof line>[]): FalBucket => ({ bucket: iso, results })

check("one run that day takes fal's figure and is exact", JSON.stringify(reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04)], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.05))])) === JSON.stringify([{ id: "a", costUsd: 0.05, basis: "exact" }]))
{
  const fixes = reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04), run("b", "fal-ai/flux", "2026-10-14T11:00:00Z", 0.06)], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.12))])
  check("several runs share fal's total in proportion to their estimates, marked computed", fixes.length === 2 && near(fixes[0]!.costUsd, 0.048) && near(fixes[1]!.costUsd, 0.072) && fixes.every((f) => f.basis === "computed") && near(fixes[0]!.costUsd + fixes[1]!.costUsd, 0.12), fixes)
}
check("another endpoint's billing is not used", reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04)], [day("2026-10-14T00:00:00Z", line("fal-ai/other", 0.05))]).length === 0)
check("another day's billing is not used", reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04)], [day("2026-10-13T00:00:00Z", line("fal-ai/flux", 0.05))]).length === 0)
check("a figure far from ours (other usage on the account) is left alone", reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04)], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 5))]).length === 0 && reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.4)], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.01))]).length === 0)
check("two lines for one endpoint that day (two units) are added together", near(reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04)], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.03), line("fal-ai/flux", 0.02))])[0]!.costUsd, 0.05))
check("only fal's media runs are touched", reconcileFal([run("t", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04, { category: "text" }), run("o", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04, { provider: "openai" }), run("r", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.04, { action: "Refunded" })], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.05))]).length === 0)
{
  // a new run on a day that was already corrected: the day's total is shared by what each was estimated at
  const first = run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.05, { basis: "exact", estimateUsd: 0.04 })
  const second = run("b", "fal-ai/flux", "2026-10-14T12:00:00Z", 0.04)
  const fixes = reconcileFal([first, second], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.1))])
  check("a later run the same day shares fal's day total with the corrected one by their estimates", fixes.length === 2 && near(fixes[0]!.costUsd + fixes[1]!.costUsd, 0.1) && near(fixes[0]!.costUsd, 0.05) && near(fixes[1]!.costUsd, 0.05), fixes)
}
check("a day with nothing left to correct is left alone", reconcileFal([run("a", "fal-ai/flux", "2026-10-14T10:00:00Z", 0.05, { basis: "exact", estimateUsd: 0.04 })], [day("2026-10-14T00:00:00Z", line("fal-ai/flux", 0.07))]).length === 0)
check("a run with no endpoint cannot be matched", reconcileFal([run("a", "x", "2026-10-14T10:00:00Z", 0.04, { endpoint: undefined })], [day("2026-10-14T00:00:00Z", line("x", 0.05))]).length === 0)
{
  const before = usageLedger.getAllItems().length
  const rec = usageLedger.addRecord({ category: "image", provider: "fal", costUsd: 0.04, modelName: "m", feature: "m (Image)", endpoint: "fal-ai/flux", basis: "estimated" })
  usageLedger.applyCorrections([{ id: rec.id, costUsd: 0.05, basis: "exact" }])
  const fixed = usageLedger.getAllItems().find((i) => i.id === rec.id)
  check("a correction replaces the cost, keeps the estimate and marks it exact", fixed?.costUsd === 0.05 && fixed.estimateUsd === 0.04 && fixed.basis === "exact" && usageLedger.getAllItems().length === before + 1, fixed)
}

// Replicate: a model billed by the time it runs. The figures are read from a real model page (stability-ai/sdxl), saved as a fixture.
{
  const { readFileSync } = await import("node:fs")
  const { parseHardwarePrice, parseReplicatePrice } = await import("../src/lib/registry/adapters/replicate")
  const { estimateRun } = await import("../src/lib/registry/price")
  const page = readFileSync(new URL("./fixtures-replicate-sdxl.txt", import.meta.url), "utf8")
  const hw = parseHardwarePrice(page)
  check("the hardware rate and the typical run cost are read from the page's own figures", hw?.computeSecond === 0.000975 && hw?.amount === 0.0013 && hw?.unit === "per_run", hw)
  check("a page with no billing tiers falls back to those figures", JSON.stringify(parseReplicatePrice(page)) === JSON.stringify(hw), parseReplicatePrice(page))
  check("a page with no figures at all gives no price", parseHardwarePrice("<html>nothing here</html>") === null && parseReplicatePrice("<html></html>") === null)
  const sdxl = { id: "replicate/stability-ai/sdxl", endpoint: "stability-ai/sdxl", provider: "replicate", name: "sdxl", modality: "image", inputs: ["text"], params: { type: "object", properties: {} }, price: { ...hw!, source: "scraped", fetchedAt: "" }, status: "active" } as unknown as ModelRecord
  const est = estimateRun(sdxl, {})
  check("before the run the price is Replicate's own median for a run, marked approximate", near(est.usd ?? 0, 0.0013) && est.approximate === true && /billed by run time/.test(est.breakdown ?? ""), est)
  check("after the run the cost is the seconds it took times the hardware's rate, marked computed", JSON.stringify(actualCostOf(sdxl, { metrics: { predict_time: 2.4 } })) === JSON.stringify({ usd: 2.4 * 0.000975, basis: "computed", note: "2.4 s on the model's hardware" }), actualCostOf(sdxl, { metrics: { predict_time: 2.4 } }))
  check("a run with no time reported is not guessed at", actualCostOf(sdxl, { metrics: {} }) === null && actualCostOf(sdxl, undefined) === null)
  check("a model billed per output has no run-time rate, so it keeps its price-list cost", actualCostOf({ provider: "replicate", price: {} }, { metrics: { predict_time: 3 } }) === null)
}

// what fal's bills have come to against the price list is learned and applied to the next estimate
{
  const { learnedRatio } = await import("../src/lib/ledger/fal-usage")
  const { setCalibration } = await import("../src/lib/registry/calibration")
  const { estimateRun } = await import("../src/lib/registry/price")
  const billed = (id: string, cost: number, estimate: number, extra: Partial<UsageLedgerItem> = {}): UsageLedgerItem => run(id, "fal-ai/flux", "2026-10-14T10:00:00Z", cost, { basis: "exact", estimateUsd: estimate, ...extra })
  check("with fewer than three billed runs nothing is learned", learnedRatio([billed("a", 0.05, 0.04), billed("b", 0.05, 0.04)], "fal-ai/flux") === null)
  check("the middle of the bill-over-estimate ratios is learned", near(learnedRatio([billed("a", 0.05, 0.04), billed("b", 0.052, 0.04), billed("c", 0.048, 0.04)], "fal-ai/flux") ?? 0, 1.25), learnedRatio([billed("a", 0.05, 0.04), billed("b", 0.052, 0.04), billed("c", 0.048, 0.04)], "fal-ai/flux"))
  check("a ratio within 3% of one is not worth applying", learnedRatio([billed("a", 0.0401, 0.04), billed("b", 0.04, 0.04), billed("c", 0.0399, 0.04)], "fal-ai/flux") === null)
  check("one odd day cannot swing it past double or under half", learnedRatio([billed("a", 0.4, 0.04), billed("b", 0.4, 0.04), billed("c", 0.4, 0.04)], "fal-ai/flux") === 2 && learnedRatio([billed("a", 0.004, 0.04), billed("b", 0.004, 0.04), billed("c", 0.004, 0.04)], "fal-ai/flux") === 0.5)
  check("another endpoint's bills are not used", learnedRatio([billed("a", 0.05, 0.04), billed("b", 0.05, 0.04), billed("c", 0.05, 0.04)], "fal-ai/other") === null)
  check("an earlier correction is taken out so the ratio does not compound", near(learnedRatio([billed("a", 0.05, 0.05, { factor: 1.25 }), billed("b", 0.05, 0.05, { factor: 1.25 }), billed("c", 0.05, 0.05, { factor: 1.25 })], "fal-ai/flux") ?? 0, 1.25))
  const flux = { id: "fal/flux", endpoint: "fal-ai/flux", provider: "fal", name: "flux", modality: "image", inputs: ["text"], params: { type: "object", properties: {} }, price: { unit: "per_image", amount: 0.04, source: "api", fetchedAt: "" }, status: "active" } as unknown as ModelRecord
  setCalibration(() => 1.25)
  const learned = estimateRun(flux, {})
  setCalibration(null)
  const plain = estimateRun(flux, {})
  check("the next estimate carries the learned correction and says so", near(learned.usd ?? 0, 0.05) && learned.calibration === 1.25 && learned.approximate === true && /what your bills came to/.test(learned.breakdown ?? ""), learned)
  check("with nothing learned the estimate is the price list's", near(plain.usd ?? 0, 0.04) && plain.calibration === undefined, plain)
}

// a price "per thousand output images" is read as a thousandth per image (flux-schnell was read as $3 an image)
{
  const { readFileSync } = await import("node:fs")
  const { parseReplicatePrice, priceKindOf } = await import("../src/lib/registry/adapters/replicate")
  const page = readFileSync(new URL("./fixtures-replicate-schnell.txt", import.meta.url), "utf8")
  const p = parseReplicatePrice(page)
  check("black-forest-labs/flux-schnell is $0.003 an image, not $3", p?.unit === "per_image" && near(p.amount, 0.003), p)
  check("per thousand images is a thousandth of the figure", near(priceKindOf({ title: "per thousand output images", metric: "image_output_count" }).scale, 0.001) && priceKindOf({ title: "per output image", metric: "image_output_count" }).scale === 1)
  check("per thousand tokens and per million tokens are still read as before", priceKindOf({ title: "per thousand input tokens" }).scale === 1000 && priceKindOf({ title: "per million output tokens" }).scale === 1)
}

{
  const { parseReplicatePrice } = await import("../src/lib/registry/adapters/replicate")
  const html = '"billingConfig": {"current_description": null, "current_tiers": [{"criteria": [], "description": "You pay OpenAI directly via your API key.", "prices": [], "title": "OpenAI"}]}, "price": "$0.0001 per second", "p50price": "$0.0011"'
  check("a Replicate model that bills on the maker's own key is not priced from its CPU time", parseReplicatePrice(html) === null)
}

console.log(fails === 0 ? "all passed" : `${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
