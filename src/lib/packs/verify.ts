import publicKey from "./packs-public.json"

/** Checks that a pack file or manifest is what the publisher signed, and that a pack file is the one its manifest named. */

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** True only when the signature (base64url) is a valid ECDSA P-256 signature of exactly these bytes */
export async function verifySignature(bytes: Uint8Array<ArrayBuffer>, signature: string, jwk: JsonWebKey = publicKey as JsonWebKey): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64url(signature.trim()), bytes)
  } catch {
    return false
  }
}
