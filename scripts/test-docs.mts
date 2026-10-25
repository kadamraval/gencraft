import { strToU8, zipSync } from "fflate"
import { readDocxText, readXlsxText } from "../src/lib/chat/documents"

let failed = 0
let passed = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++
  else {
    failed++
    console.error(`FAIL ${name}`, detail ?? "")
  }
}
const fail = async (fn: () => Promise<unknown>) => {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}
const fileOf = (entries: Record<string, string>, name: string) => new File([zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])))], name)

// Word
const docx = fileOf(
  {
    "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>Blue Peach &amp; Co</w:t></w:r></w:p><w:p><w:r><w:t>Price</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>499</w:t></w:r></w:p><w:p><w:r><w:t>Line one</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Line two</w:t></w:r></w:p></w:body></w:document>`,
  },
  "a.docx",
)
const dt = await readDocxText(docx)
check("docx paragraphs", dt.split("\n")[0] === "Blue Peach & Co", dt)
check("docx tab", dt.includes("Price\t499"), dt)
check("docx line break", dt.includes("Line one\nLine two"), dt)
check("docx rejects other zip", await fail(() => readDocxText(fileOf({ "x.txt": "hi" }, "b.docx"))))
check("docx empty", await fail(() => readDocxText(fileOf({ "word/document.xml": "<w:document><w:body></w:body></w:document>" }, "c.docx"))))

// Excel
const xlsx = fileOf(
  {
    "xl/workbook.xml": `<workbook><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Notes &amp; more" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/sharedStrings.xml": `<sst><si><t>Item</t></si><si><t>Bra</t></si><si><r><t>Panty </t></r><r><t>Set</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Qty</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>12</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="C3"><v>7.5</v></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c></row></sheetData></worksheet>`,
  },
  "a.xlsx",
)
const xt = await readXlsxText(xlsx)
check("xlsx sheet names", xt.includes("[Sheet: Sales]") && xt.includes("[Sheet: Notes & more]"), xt)
check("xlsx header row", xt.includes("Item\tQty"), xt)
check("xlsx number cell", xt.includes("Bra\t12"), xt)
check("xlsx rich shared string", xt.includes("Panty Set"), xt)
check("xlsx gap column kept", xt.includes("Panty Set\t\t7.5"), xt)
check("xlsx second sheet", xt.includes("hello"), xt)
check("xlsx rejects other zip", await fail(() => readXlsxText(fileOf({ "x.txt": "hi" }, "b.xlsx"))))

console.log(failed === 0 ? `all ${passed} checks passed` : `${failed} failed, ${passed} passed`)
process.exit(failed === 0 ? 0 : 1)
