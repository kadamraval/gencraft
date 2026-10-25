/**
 * Size limits keep skills cheap. A skill's name and description are all that is read until it is used; its text
 * is read only when chosen, and at most two are used at once.
 */
export const LIMITS = {
  /** One line saying when to use it */
  description: 120,
  /** Added to an image, video or audio prompt: about 40 words, 60 tokens */
  phrase: 240,
  /** Given to chat or the agent as the method: about 100 words, 150 tokens */
  method: 600,
  /** Skills used together in one request */
  active: 2,
} as const
