/**
 * The composer sits outside the conversation. It hands what the person typed to whichever conversation is open here.
 * Text sent before the conversation is on screen waits and is delivered when it registers.
 */

export interface BridgeMessage {
  /** What the model receives */
  text: string
  /** What the person typed, when the model receives more (a skill's method added in front) */
  shown?: string
  /** The model the person picked for this turn */
  modelId?: string
  /** Pictures that go with the message */
  files?: Array<{ url: string; mediaType: string; filename?: string }>
}

type Sender = (message: BridgeMessage) => void

function createBridge() {
  let sender: Sender | null = null
  const waiting: BridgeMessage[] = []
  return {
    register(fn: Sender) {
      sender = fn
      while (waiting.length > 0) fn(waiting.shift()!)
    },
    unregister(fn: Sender) {
      if (sender === fn) sender = null
    },
    send(message: BridgeMessage | string) {
      const m = typeof message === "string" ? { text: message } : message
      if (sender) sender(m)
      else waiting.push(m)
    },
    /** True while a conversation is on screen to receive text */
    get ready() {
      return sender !== null
    },
  }
}

/** The agent's conversation */
export const agentBridge = createBridge()
/** The plain chat's conversation */
export const chatBridge = createBridge()
