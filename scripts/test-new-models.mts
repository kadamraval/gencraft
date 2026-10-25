import { markDecided, newTopModels } from "../src/lib/registry/new-models"
import type { ModelRecord } from "../src/lib/registry/types"

let fails = 0
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : extra}`)
  if (!ok) fails++
}
const rec = (id: string) => ({ id }) as ModelRecord
const listed = ["a", "b", "c", "d", "e"].map(rec)
const top = ["a", "b", "c"]

check("no saved choices: nothing to add, the defaults apply", newTopModels(listed, undefined, top).length === 0 && newTopModels(listed, [], top).length === 0)

// First run: the person chose only "a" and "d". "b" and "c" are top models they never chose; "e" is not top.
const first = newTopModels(listed, ["a", "d"], top)
check("a top model the person never chose is switched on", first.join() === "b,c", first.join())
check("a model that is not top is left as it was", !first.includes("e"))
check("a model the person chose is not repeated", !first.includes("a"))

// The person opens Settings and switches "c" off: the list is saved without it and the top models count as decided
markDecided(top)
check("a model the person has been shown stays off once switched off", newTopModels(listed, ["a", "b", "d"], top).length === 0)

// Later a new model climbs the board
const later = ["a", "b", "c", "d", "e", "f"].map(rec)
check("a model that newly reaches the top switches on", newTopModels(later, ["a", "b", "d"], [...top, "f"]).join() === "f")
markDecided(["f"])
check("and then it is decided like the others", newTopModels(later, ["a", "b", "d"], [...top, "f"]).length === 0)

console.log(fails ? `${fails} FAILED` : "ALL PASS")
process.exit(fails ? 1 : 0)
