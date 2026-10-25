/**
 * A small, safe calculator for the model's `calculate` tool. It reads numbers, + - * / ^ %, brackets, a few functions
 * and the constants pi and e. Nothing is evaluated as code: the text is parsed by hand.
 */

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  log: (x, base) => (base ? Math.log(x) / Math.log(base) : Math.log10(x)),
  ln: Math.log,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  const text = src.replace(/,(?=\d{3}\b)/g, "").replace(/(?<=[\d)])\s*[×x]\s*(?=[\d(])/gi, "*").replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, " ")
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === " ") {
      i++
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(i))
      if (!m) throw new Error(`Cannot read a number at "${text.slice(i, i + 6)}"`)
      out.push({ t: "num", v: Number(m[0]) })
      i += m[0].length
    } else if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(text.slice(i))!
      out.push({ t: "id", v: m[0].toLowerCase() })
      i += m[0].length
    } else if ("+-*/^%(),".includes(c)) {
      out.push({ t: "op", v: c })
      i++
    } else {
      throw new Error(`Unexpected "${c}"`)
    }
  }
  return out
}

export function calculate(expression: string): number {
  const tokens = tokenize(expression)
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v
  const eat = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`)
    pos++
  }

  // expr := term (('+'|'-') term)*   term := power (('*'|'/') power)*   power := unary ('^' power)?
  const expr = (): number => {
    let x = term()
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { v: string }).v
      const y = term()
      x = op === "+" ? x + y : x - y
    }
    return x
  }
  const term = (): number => {
    let x = power()
    while (isOp("*") || isOp("/")) {
      const op = (tokens[pos++] as { v: string }).v
      const y = power()
      if (op === "/" && y === 0) throw new Error("Division by zero")
      x = op === "*" ? x * y : x / y
    }
    return x
  }
  const power = (): number => {
    const base = unary()
    if (isOp("^")) {
      pos++
      return base ** power()
    }
    return base
  }
  const unary = (): number => {
    if (isOp("-")) {
      pos++
      return -unary()
    }
    if (isOp("+")) {
      pos++
      return unary()
    }
    return postfix()
  }
  const postfix = (): number => {
    let x = primary()
    while (isOp("%")) {
      pos++
      x /= 100
    }
    return x
  }
  const primary = (): number => {
    const tok = peek()
    if (!tok) throw new Error("The expression ends too early")
    if (tok.t === "num") {
      pos++
      return tok.v
    }
    if (tok.t === "id") {
      pos++
      if (isOp("(")) {
        const fn = FUNCTIONS[tok.v]
        if (!fn) throw new Error(`Unknown function ${tok.v}`)
        pos++
        const args: number[] = []
        if (!isOp(")")) {
          args.push(expr())
          while (isOp(",")) {
            pos++
            args.push(expr())
          }
        }
        eat(")")
        return fn(...args)
      }
      if (tok.v in CONSTANTS) return CONSTANTS[tok.v]!
      throw new Error(`Unknown word ${tok.v}`)
    }
    if (tok.v === "(") {
      pos++
      const x = expr()
      eat(")")
      return x
    }
    throw new Error(`Unexpected "${tok.v}"`)
  }

  if (tokens.length === 0) throw new Error("Nothing to calculate")
  const result = expr()
  if (pos < tokens.length) throw new Error(`Unexpected "${(tokens[pos] as { v: string | number }).v}"`)
  if (!Number.isFinite(result)) throw new Error("The result is not a finite number")
  return result
}
