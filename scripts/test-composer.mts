import { PromptHistory, mentionBeforeCaret } from "../src/lib/composer/mentions"
import { endingFor, fileNameFor } from "../src/lib/library/download"
import { plainValue } from "../src/lib/registry/plain-names"
import { ratioOf } from "../src/components/library/layout-classes"

/** What the composer does with @mentions and undo, how a result is named when downloaded, and the words shown for "auto". */

let fails = 0
const check = (name: string, ok: boolean, extra: unknown = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${ok ? "" : JSON.stringify(extra)}`)
  if (!ok) fails++
}

const names = ["Anna", "Anna Lee", "Red coat"]

// one Backspace removes the whole mention
{
  const t = "Put @Anna Lee in a @Red coat "
  const c = mentionBeforeCaret(t, t.length, names)
  check("after a picked mention and its space, one Backspace removes the mention and the space", c !== null && t.slice(0, c.start) + t.slice(c.end) === "Put @Anna Lee in a ", c)
  const t2 = "Put @Anna Lee"
  const c2 = mentionBeforeCaret(t2, t2.length, names)
  check("with the caret right after the name, the whole mention goes", c2 !== null && t2.slice(0, c2.start) === "Put ", c2)
  check("the longest name wins: Anna Lee is removed whole, not just Lee", mentionBeforeCaret("@Anna Lee", 9, names)?.start === 0)
  check("a shorter name is used when the longer one is not there", mentionBeforeCaret("see @Anna", 9, names)?.start === 4)
  check("ordinary text is not a mention", mentionBeforeCaret("Put Anna in a coat", 18, names) === null && mentionBeforeCaret("hello ", 6, names) === null)
  check("a name that is only part of a word is not a mention", mentionBeforeCaret("mail@Anna", 9, names) === null)
  check("a mention in the middle is removed only when the caret is right after it", mentionBeforeCaret("@Anna and more", 5, names)?.start === 0 && mentionBeforeCaret("@Anna and more", 8, names) === null)
  check("names are matched without regard to capitals", mentionBeforeCaret("with @anna lee", 14, names)?.start === 5)
  check("with no known names nothing is a mention", mentionBeforeCaret("@Anna", 5, []) === null)
  check("the space after a mention is only taken together with a mention", mentionBeforeCaret("hello @Anna  ", 13, names) === null)
}

// undo and redo
{
  const h = new PromptHistory("")
  h.record("h", 1, 1000)
  h.record("he", 2, 1100)
  h.record("hel", 3, 1200)
  check("a run of typing is one undo step", h.undo()?.value === "" && h.undo() === null)
  check("redo brings the typing back", h.redo()?.value === "hel" && h.redo() === null)
  const g = new PromptHistory("")
  g.record("hello ", 6, 1000)
  g.record("hello @Anna Lee ", 16, 5000)
  g.record("hello ", 6, 6000)
  const stepsBack = [g.undo()?.value, g.undo()?.value, g.undo()?.value]
  check("an app change (picking a mention, removing it) is its own step", JSON.stringify(stepsBack) === JSON.stringify(["hello @Anna Lee ", "hello ", ""]), stepsBack)
  const u = new PromptHistory("")
  u.record("a", 1, 1000)
  u.record("a @Anna ", 8, 3000)
  const back = u.undo()
  check("undo restores the text and where the caret was", back?.value === "a" && back.caret === 1, back)
  u.record("a b", 3, 9000)
  check("writing after an undo drops what could have been redone", u.redo() === null)
  const p = new PromptHistory("")
  p.record("long prompt", 11, 1000)
  p.record("", 0, 9000)
  check("clearing the prompt (after a send) can be undone", p.undo()?.value === "long prompt")
  const same = new PromptHistory("x")
  same.record("x", 1)
  check("a record that changes nothing adds no step", same.undo() === null)
  const cap = new PromptHistory("", 3)
  for (let i = 1; i <= 6; i++) cap.record("v".repeat(i * 5), 0, i * 10_000)
  let steps = 0
  while (cap.undo()) steps++
  check("the history is capped", steps <= 2, steps)
}

// download file names and endings
check("the ending comes from what was fetched", endingFor("image/png", "https://x/a", "image") === "png" && endingFor("image/jpeg; charset=x", "u", "image") === "jpg" && endingFor("video/mp4", "u", "video") === "mp4" && endingFor("audio/mpeg", "u", "audio") === "mp3")
check("with no type it comes from the address, then from the kind", endingFor("", "https://x/file.webp?token=1", "image") === "webp" && endingFor("", "https://x/blob", "video") === "mp4" && endingFor("application/octet-stream", "u", "audio") === "mp3")
check("the file name is safe, has the ending, and is not doubled", fileNameFor("Image from the agent", "png") === "Image_from_the_agent.png" && fileNameFor("sunset.png", "png") === "sunset.png" && fileNameFor("a/b:c", "jpg").endsWith(".jpg") && !/[\\/:]/.test(fileNameFor("a/b:c", "jpg")))
check("an empty title still gets a name", fileNameFor("", "png") === "Result.png")

// every word for "the model decides" reads as Auto
check("auto, adaptive and match input image all read as Auto", ["auto", "adaptive", "match_input_image", "match_input", "original", "-1"].every((v) => plainValue("aspect_ratio", v) === "Auto" && plainValue("size", v) === "Auto" && plainValue("image_size", v) === "Auto" && plainValue("resolution", v) === "Auto"))
check("a real size is left as it is", plainValue("aspect_ratio", "16:9") === undefined && plainValue("size", "1024x1024") === undefined)

// the shape of a tile
check("a ratio is a width over a height", ratioOf("16:9") === 16 / 9 && ratioOf("4:3") === 4 / 3 && ratioOf("21:9") === 21 / 9 && ratioOf("1:1") === 1 && ratioOf("3/2") === 1.5)
check("auto and the like have no ratio, so the picture itself decides", ratioOf("auto") === undefined && ratioOf("match_input_image") === undefined && ratioOf(undefined) === undefined && ratioOf("0:0") === undefined)

console.log(fails === 0 ? "all passed" : `${fails} failed`)
process.exit(fails === 0 ? 0 : 1)
