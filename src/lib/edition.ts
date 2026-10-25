import pkg from "../../package.json"

declare const __GENCRAFT_EDITION__: string | undefined

/**
 * Which build this is. The official app has the paid code (src/pro); a community build made from the public source has stand-ins instead. Set
 * by the build (see vite.config.ts); anything that runs outside the build, such as a test, counts as the official one.
 */
export const EDITION: "pro" | "community" = typeof __GENCRAFT_EDITION__ !== "undefined" && __GENCRAFT_EDITION__ === "community" ? "community" : "pro"

/** Whether this build has the paid features at all (a licence key can only unlock what is in the build) */
export const HAS_PAID_CODE = EDITION === "pro"

/** Whether this version is still a beta (its number carries -beta, -alpha or -rc, like 0.1.0-beta.1) */
export const IS_BETA: boolean = /-(alpha|beta|rc)/i.test(pkg.version)
