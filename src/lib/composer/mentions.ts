/**
 * What the composer does with @mentions and with undo, kept apart from the screen so it can be tested.
 *
 *  - A picked mention is one thing: with the caret just after it, one Backspace removes all of it.
 *  - Undo and redo are the composer's own, so they work after the app changes the text itself (picking a mention, removing one,
 *    clearing after a send), which the browser's undo cannot follow.
 */

/**
 * The mention that ends right at the caret, as the start and end of the text to remove. It is "@Name", or "@Name " with the space
 * that follows a picked mention. The longest known name wins ("@Anna Lee" over "@Anna"). It must start the text or follow a space.
 */
export function mentionBeforeCaret(text: string, caret: number, names: string[]): { start: number; end: number } | null {
  const before = text.slice(0, caret)
  const withSpace = before.endsWith(" ")
  const core = withSpace ? before.slice(0, -1) : before
  const lower = core.toLowerCase()
  for (const name of [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const token = `@${name}`.toLowerCase()
    if (!lower.endsWith(token)) continue
    const start = core.length - token.length
    if (start > 0 && !/\s/.test(core[start - 1]!)) continue
    return { start, end: caret }
  }
  return null
}

export interface PromptSnapshot {
  value: string
  caret: number
}

/**
 * The prompt's undo history. Typing is grouped (a run of single letters is one step), anything else the app does is its own step.
 * Writing something new after an undo drops what could have been redone.
 */
export class PromptHistory {
  private stack: PromptSnapshot[]
  private index = 0
  private lastAt = 0
  private typing = false

  constructor(initial = "", private readonly limit = 200) {
    this.stack = [{ value: initial, caret: initial.length }]
  }

  record(value: string, caret: number, now = Date.now()): void {
    const top = this.stack[this.index]!
    if (value === top.value) {
      top.caret = caret
      return
    }
    const oneLetter = Math.abs(value.length - top.value.length) <= 1
    if (this.typing && oneLetter && now - this.lastAt < 800) {
      // Still the same run of typing: the step is updated, not added to
      this.stack[this.index] = { value, caret }
    } else {
      this.stack.length = this.index + 1
      this.stack.push({ value, caret })
      this.index++
      if (this.stack.length > this.limit) {
        this.stack.shift()
        this.index--
      }
    }
    this.typing = oneLetter
    this.lastAt = now
  }

  undo(): PromptSnapshot | null {
    if (this.index === 0) return null
    this.index--
    this.typing = false
    return this.stack[this.index]!
  }

  redo(): PromptSnapshot | null {
    if (this.index >= this.stack.length - 1) return null
    this.index++
    this.typing = false
    return this.stack[this.index]!
  }
}
