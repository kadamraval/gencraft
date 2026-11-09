"""
Writes the standard model database as the Knowledge Book workbook (docs/knowledge-book.xlsx) so it can be read as sheets.
The workbook is made from the pack (src/lib/knowledge/pack.json) when it exists; before that it is the empty structure plus the task and
tool lists. The app never reads the workbook; it reads the pack. The two always say the same thing because one is made from the other.
The words are defined in docs/terms.md.

    python scripts/export-knowledge-xlsx.py
"""
import json
import os
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "src", "lib", "knowledge", "pack.json")
TASKS = os.path.join(ROOT, "src", "lib", "knowledge", "tasks.json")
TOOLS = os.path.join(ROOT, "src", "lib", "knowledge", "tools.json")
OUT = os.path.join(ROOT, "docs", "knowledge-book.xlsx")

SRC = [("source_url", "Page or API address the value was read from"), ("read_on", "Date it was read (YYYY-MM-DD)")]
LIST_COLS = [
    ("name", "Name shown to the user"), ("category", "image / video / audio / text / embedding"),
    ("provider_task", "The name providers file such models under"), ("takes_in", "What must go in"), ("may_take", "What may also go in"),
    ("gives", "What comes out"), ("also_known_as", "Other names people search for"), ("used_in", "create / audio / edit / story / agent / library"),
]

TABS = [
    ("makers", "1 Makers", "Who builds models?", [
        ("maker_id", "Short unique id, lower case"), ("maker", "Name as the maker writes it"), ("country", "Country of the company"),
        ("docs_url", "Official docs address"), ("own_api", "yes / no"), ("weights", "open / closed / mixed"),
    ]),
    ("models", "2 Models", "Which models exist, and what do they make?", [
        ("model_id", "maker/model: the same on every provider"), ("maker_id", "Link to tab 1"), ("model", "Model name"),
        ("version", "Version as the maker writes it"), ("category", "image / video / audio / text / embedding"),
        ("tasks", "Task ids this model does (tab 3)"), ("tools", "Tool ids this model does (tab 4)"), ("released_on", "YYYY-MM-DD"),
        ("status", "active / preview / deprecated"), ("latest_in_family", "yes if it is the newest stable version of its family"),
        ("replaces", "model_id it replaces"), ("retires_on", "YYYY-MM-DD if announced"),
    ]),
    ("tasks", "3 Tasks", "What can be made (text to video, image to video ...)", [("task_id", "Id the code uses")] + LIST_COLS),
    ("tools", "4 Tools", "What can be done to a file you have (upscale, remove background ...)", [("tool_id", "Id the code uses")] + LIST_COLS),
    ("capabilities", "5 Capabilities", "What can each model take in? (one row per model and capability)", [
        ("model_id", "Link to tab 2"),
        ("capability", "start-image / end-image / reference-images / reference-videos / reference-audio / elements / source-video / source-audio"),
        ("max", "How many files, when a provider states it"), ("provider_fields", "What each provider calls it"),
    ]),
    ("parameters", "6 Parameters", "Which settings can I change? (one row per provider line and setting)", [
        ("model_id", "Link to tab 2"), ("provider", "Link to tab 7"), ("serves", "Task or tool of the line"), ("standard_name", "The app's own name, if there is one"),
        ("provider_field", "Exact field the provider expects"), ("type", "string / integer / number / boolean / array"), ("allowed_values", "List, blank if free"),
        ("default", "Default"), ("min", "Lowest"), ("max", "Highest"), ("required", "yes / no"), ("tier", "common / unique / advanced / technical"),
    ]),
    ("providers", "7 Providers", "How does each provider work?", [
        ("provider", "fal / replicate / openrouter / openai / gemini"), ("auth", "How a key is sent"), ("run_style", "sync / async-poll / webhook"),
        ("file_upload", "How input files are sent"), ("rate_limits", "Requests per minute / concurrency"), ("list_read_by", "How its model list is read"),
        ("price_read_by", "How its prices are read"),
    ] + SRC),
    ("lines", "8 Provider lines", "Where does each model run, for which task or tool, at what price?", [
        ("model_id", "Link to tab 2"), ("provider", "Link to tab 7"), ("endpoint", "Exact model address on that provider"), ("serves", "Task or tool id this line is for"),
        ("rank", "1 = first choice for this task or tool on this provider, 2 and up = backups"), ("role", "model / substitute / alternative"),
        ("price_unit", "per_image / per_second / per_run / per_1m_tokens / per_megapixel / per_1k_chars"), ("price_amount", "USD"),
        ("price_rules", "One price per tier (resolution, audio, quality)"), ("price_from", "standard / litellm / api / page / maker"),
        ("conflict", "yes if two sources differ by more than 10%"), ("status", "active / preview / deprecated"),
    ] + SRC),
    ("safety", "9 Safety (later)", "Content filters per model (agreed to come later)", [
        ("model_id", "Link to tab 2"), ("provider", "Link to tab 7"), ("filter_control", "none / fixed / switchable"), ("can_disable", "yes / no / unknown"),
    ] + SRC),
    ("sources", "10 Sources", "How each fact was read, and when", [
        ("provider", "Provider, litellm or maker"), ("method", "standard / litellm / api / page / maker"), ("url", "Address read"), ("read_on", "Date"),
        ("pinned_to", "For LiteLLM: the commit"),
    ]),
    ("gaps", "11 Gaps", "Everything NOT FOUND, with the reason (the work list)", [
        ("model_id", "Model"), ("provider", "Provider"), ("field", "serves / parameters / price / endpoint / backups"), ("reason", "Why it is missing"),
    ]),
    ("completeness", "12 Completeness", "How complete is this?", [
        ("scope", "Sheet, maker or provider"), ("total", "Fields that exist"), ("filled", "Fields read from a source"), ("score", "filled / total"),
    ]),
]

HEAD = PatternFill("solid", fgColor="1F3A5F")
NOTE = PatternFill("solid", fgColor="EEF2F7")


def _list_row(t):
    return [t["id"], t["name"], t["category"], t["providerTask"], t["takesIn"], t["mayTake"] or "", t["gives"], ", ".join(t["alsoKnownAs"]), ", ".join(t["usedIn"])]


def _provider_fields(m, cap_id):
    return "; ".join(sorted({"%s: %s" % (l["provider"], l["fields"][cap_id]) for l in m["lines"] if cap_id in l.get("fields", {})}))


def rows_for(key, pack, tasks, tools):
    """The data rows for one tab, from the pack (or the task and tool lists alone before the pack exists)."""
    if key == "tasks":
        return [_list_row(t) for t in tasks]
    if key == "tools":
        return [_list_row(t) for t in tools]
    if not pack:
        return []
    out = []
    if key == "makers":
        out = [[m["id"], m["name"], m.get("country", ""), m.get("docsUrl", ""), _yn(m.get("ownApi")), m.get("weights", "")] for m in pack["makers"]]
    elif key == "models":
        out = [[m["id"], m["makerId"], m["name"], m.get("version", ""), m["category"], ", ".join(m["tasks"]), ", ".join(m["tools"]), m.get("releasedOn", ""), m["status"], _yn(m["latest"]), m.get("replaces", ""), m.get("retiresAt", "")] for m in pack["models"]]
    elif key == "capabilities":
        for m in pack["models"]:
            for c in m["capabilities"]:
                out.append([m["id"], c["id"], _s(c.get("max")), _provider_fields(m, c["id"])])
    elif key == "parameters":
        for m in pack["models"]:
            for l in m["lines"]:
                req = set(l["parameters"].get("required", []))
                for k, p in l["parameters"]["properties"].items():
                    # A file field is a capability (tab 5), not a parameter
                    if p.get("slot") or p.get("format"):
                        continue
                    out.append([m["id"], l["provider"], l["serves"], "", k, p.get("type", ""), ", ".join(str(v) for v in p.get("enum", [])), _s(p.get("default")), _s(p.get("minimum")), _s(p.get("maximum")), _yn(k in req), p.get("tier", "")])
    elif key == "lines":
        for m in pack["models"]:
            for l in m["lines"]:
                pr = l["price"]
                out.append([m["id"], l["provider"], l["endpoint"], l["serves"], l["rank"], l["role"], pr["unit"], _s(pr["amount"]), json.dumps(pr.get("rules", [])) if pr.get("rules") else "", pr["from"], _yn(l.get("conflict")), l["status"], pr.get("sourceUrl", ""), pr["readOn"]])
    elif key == "sources":
        out = [[s["provider"], s["method"], s["url"], s["readOn"], s.get("pinnedTo", "")] for s in pack["sources"]]
    elif key == "gaps":
        out = [[g["modelId"], g["provider"], g["field"], g["reason"]] for g in pack["gaps"]]
    elif key == "completeness":
        out = [[c["scope"], c["total"], c["filled"], c["score"]] for c in pack["completeness"]]
    return out


def _yn(v):
    return "" if v is None else ("yes" if v else "no")


def _s(v):
    return "" if v is None else v


def main():
    tasks = json.load(open(TASKS, encoding="utf8"))["tasks"]
    tools = json.load(open(TOOLS, encoding="utf8"))["tools"]
    pack = json.load(open(PACK, encoding="utf8")) if os.path.exists(PACK) else None
    wb = Workbook()
    ws = wb.active
    ws.title = "0 Read me"
    lines = [
        ("Knowledge Book: the standard model database, as sheets",),
        ("Made from the pack the app reads. The words are defined in docs/terms.md." if pack else "Empty structure plus the task and tool lists. It fills when the build has run.",),
        ("",),
        ("Rules for every cell",),
        ("1. A value is written only if it was read from a source; the address and date are on the same row.",),
        ("2. If it could not be found, it is listed in Gaps. It is never guessed.",),
        ("3. A model is published only when its task or tool, parameters, price and endpoint are found on every provider line.",),
        ("4. Capabilities (files that go in) and Parameters (settings) are kept apart. Tasks and Tools are two separate lists.",),
        ("",),
        ("Tab", "Question it answers"),
    ] + [(n, q) for _k, n, q, _c in TABS]
    for r in lines:
        ws.append(list(r))
    ws["A1"].font = Font(bold=True, size=14)
    ws["A4"].font = Font(bold=True)
    for c in ws[10]:
        c.font = Font(bold=True)
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 90
    for key, name, _q, cols in TABS:
        s = wb.create_sheet(name)
        s.append([c for c, _ in cols])
        s.append([d for _, d in cols])
        for i in range(1, len(cols) + 1):
            h = s.cell(row=1, column=i)
            h.font = Font(bold=True, color="FFFFFF")
            h.fill = HEAD
            d = s.cell(row=2, column=i)
            d.fill = NOTE
            d.font = Font(italic=True, color="555555")
            d.alignment = Alignment(wrap_text=True, vertical="top")
            s.column_dimensions[get_column_letter(i)].width = 24
        s.row_dimensions[2].height = 48
        s.freeze_panes = "A3"
        for r in rows_for(key, pack, tasks, tools):
            s.append(r)
    wb.save(OUT)
    print("saved", OUT, "with" if pack else "without", "pack")


if __name__ == "__main__":
    sys.exit(main())
