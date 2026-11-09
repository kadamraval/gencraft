/** Checks for the sign-up screens. Plain and strict enough to catch typos; the server has the final say once it exists. */

export const isEmail = (text: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text.trim())

/** A password: at least 8 characters */
export const isPassword = (text: string): boolean => text.length >= 8

/** The code from the verification email: 6 digits */
export const isCode = (text: string): boolean => /^\d{6}$/.test(text.trim())

/** The app PIN: exactly 6 digits */
export const isPin = (text: string): boolean => /^\d{6}$/.test(text)
