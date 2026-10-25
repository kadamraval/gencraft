import * as React from "react"
import type { ModelPrice } from "@/lib/registry/types"

/**
 * Prices are stored in US dollars, which is what providers charge. The user can pick a country and the
 * currency to show them in. Conversion uses published daily rates, cached on the machine, so the app works
 * offline with the last known rates and falls back to dollars if it has never had any.
 */

export interface Country {
  code: string
  name: string
  currency: string
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", currency: "USD" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "ES", name: "Spain", currency: "EUR" },
  { code: "IT", name: "Italy", currency: "EUR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "NZ", name: "New Zealand", currency: "NZD" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "KR", name: "South Korea", currency: "KRW" },
  { code: "CN", name: "China", currency: "CNY" },
  { code: "HK", name: "Hong Kong", currency: "HKD" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "IL", name: "Israel", currency: "ILS" },
  { code: "TR", name: "Turkey", currency: "TRY" },
  { code: "BR", name: "Brazil", currency: "BRL" },
  { code: "MX", name: "Mexico", currency: "MXN" },
  { code: "AR", name: "Argentina", currency: "ARS" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "EG", name: "Egypt", currency: "EGP" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "SE", name: "Sweden", currency: "SEK" },
  { code: "NO", name: "Norway", currency: "NOK" },
  { code: "DK", name: "Denmark", currency: "DKK" },
  { code: "PL", name: "Poland", currency: "PLN" },
  { code: "CZ", name: "Czechia", currency: "CZK" },
  { code: "UA", name: "Ukraine", currency: "UAH" },
  { code: "ID", name: "Indonesia", currency: "IDR" },
  { code: "PH", name: "Philippines", currency: "PHP" },
  { code: "TH", name: "Thailand", currency: "THB" },
  { code: "VN", name: "Vietnam", currency: "VND" },
  { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "PK", name: "Pakistan", currency: "PKR" },
  { code: "BD", name: "Bangladesh", currency: "BDT" },
  { code: "LK", name: "Sri Lanka", currency: "LKR" },
  { code: "NP", name: "Nepal", currency: "NPR" },
]

const PREF_KEY = "gencraft_currency_pref"
const RATES_KEY = "gencraft_currency_rates"
const RATES_MAX_AGE_MS = 24 * 3600 * 1000

interface Pref {
  country: string
  currency: string
}

interface RatesCache {
  fetchedAt: number
  rates: Record<string, number>
}

const DEFAULT_PREF: Pref = { country: "US", currency: "USD" }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: the choice just will not persist
  }
}

let pref: Pref = read<Pref>(PREF_KEY) ?? DEFAULT_PREF
let rates: RatesCache | null = read<RatesCache>(RATES_KEY)
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

export function getCurrencyPref(): Pref {
  return pref
}

export function setCountry(code: string) {
  const country = COUNTRIES.find((c) => c.code === code)
  if (!country) return
  pref = { country: country.code, currency: country.currency }
  write(PREF_KEY, pref)
  void refreshRates()
  emit()
}

/** Lets the user show a currency that differs from their country's, for example USD in India. */
export function setCurrency(currency: string) {
  pref = { ...pref, currency }
  write(PREF_KEY, pref)
  void refreshRates()
  emit()
}

const SOURCES = [
  async (): Promise<Record<string, number>> => {
    const res = await fetch("https://open.er-api.com/v6/latest/USD")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return ((await res.json()) as { rates: Record<string, number> }).rates
  },
  async (): Promise<Record<string, number>> => {
    const res = await fetch("https://latest.currency-api.pages.dev/v1/currencies/usd.json")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { usd: Record<string, number> }
    return Object.fromEntries(Object.entries(json.usd).map(([k, v]) => [k.toUpperCase(), v]))
  },
]

/** Refreshes the daily rates when the cached copy is old. Never throws: the last known rates keep working. */
export async function refreshRates(force = false): Promise<void> {
  if (pref.currency === "USD") return
  if (!force && rates && Date.now() - rates.fetchedAt < RATES_MAX_AGE_MS && rates.rates[pref.currency]) return
  for (const source of SOURCES) {
    try {
      const fetched = await source()
      if (fetched[pref.currency]) {
        rates = { fetchedAt: Date.now(), rates: fetched }
        write(RATES_KEY, rates)
        emit()
        return
      }
    } catch {
      // try the next source
    }
  }
}

/** Dollars to the chosen currency. Falls back to dollars when no rate is known. */
export function convert(usd: number): { amount: number; currency: string } {
  if (pref.currency === "USD") return { amount: usd, currency: "USD" }
  const rate = rates?.rates[pref.currency]
  return rate ? { amount: usd * rate, currency: pref.currency } : { amount: usd, currency: "USD" }
}

/** What a person typed in their own currency, back to the dollars the app stores. Dollars when no rate is known. */
export function toUsd(local: number): number {
  if (pref.currency === "USD") return local
  const rate = rates?.rates[pref.currency]
  return rate ? local / rate : local
}

/** The symbol of the chosen currency ("$", "₹", "€"), or the dollar sign while no rate is known. */
export function currencySymbol(): string {
  const { currency } = convert(1)
  return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "$"
}

function digitsFor(amount: number): number {
  return amount < 0.1 ? 4 : amount < 10 ? 2 : amount < 100 ? 1 : 0
}

export function formatMoney(usd: number): string {
  const { amount, currency } = convert(usd)
  const digits = digitsFor(amount)
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits }).format(amount)
}

/** Token prices always show two decimals (more for tiny ones) so a column of them lines up; zero reads as free. */
export function formatTokenMoney(usd: number): string {
  if (usd === 0) return "free"
  const { amount, currency } = convert(usd)
  const digits = amount < 0.01 ? 4 : 2
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: digits }).format(amount)
}

const SUFFIX: Partial<Record<ModelPrice["unit"], string>> = {
  per_image: "/img",
  per_second: "/s",
  per_megapixel: "/MP",
  per_1m_tokens: "/1M",
  per_1k_chars: "/1K",
  per_minute: "/min",
}

/** A compact price for list rows in the chosen currency, for example "₹5.85/s". Null when there is no price. */
export function formatShortPrice(price: ModelPrice): string | null {
  if (price.amount === null) return null
  if (price.amount === 0 && !price.outputAmount) return "free"
  // Token prices are quoted as input / output per million tokens, exactly as the provider lists them
  if (price.unit === "per_1m_tokens" && price.outputAmount !== undefined) return `${formatMoney(price.amount)} / ${formatMoney(price.outputAmount)} /1M`
  return `${formatMoney(price.amount)}${SUFFIX[price.unit] ?? ""}`
}

export function useMoney() {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    void refreshRates()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return React.useMemo(
    () => ({ format: formatMoney, token: formatTokenMoney, short: formatShortPrice, currency: pref.currency, country: pref.country }),
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  )
}
