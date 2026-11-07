# Builds the sample files used to test "import a file as an article". Run: python3 tests/fixtures/make_articles.py
import io, datetime, os
from docx import Document
from docx.shared import Pt
from docx.enum.style import WD_STYLE_TYPE
import openpyxl
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image
here = os.path.dirname(__file__)

# --- Word: title, headings, bold/italic/link, bullets, nested, numbered, table, code, quote, picture
d = Document()
d.add_paragraph("Caching Guide", style="Title")
d.add_heading("Why cache", 1)
p = d.add_paragraph("Caching keeps ")
r = p.add_run("hot data"); r.bold = True
p.add_run(" close to the app, and it is ")
r = p.add_run("not free"); r.italic = True
p.add_run(". See ")
d.add_paragraph("Second paragraph with a * star and a [bracket].")
d.add_heading("Kinds", 2)
d.add_paragraph("In-memory", style="List Bullet")
d.add_paragraph("Distributed", style="List Bullet")
d.add_paragraph("Redis", style="List Bullet 2")
d.add_heading("Steps", 1)
d.add_paragraph("Measure first", style="List Number")
d.add_paragraph("Pick a key", style="List Number")
d.add_paragraph("Set an expiry", style="List Number")
t = d.add_table(rows=3, cols=2)
for i, row in enumerate([["Layer", "Latency"], ["L1", "1 ns"], ["Redis", "1 ms"]]):
    for j, v in enumerate(row): t.cell(i, j).text = v
code = d.styles.add_style("Code", WD_STYLE_TYPE.PARAGRAPH); code.font.name = "Consolas"
d.add_paragraph("var x = cache.Get(key);\nif (x == null) Load();", style="Code")
d.add_paragraph("Cache invalidation is hard.", style="Quote")
buf = io.BytesIO(); Image.new("RGB", (60, 30), (200, 40, 40)).save(buf, "PNG"); buf.seek(0)
d.add_picture(buf)
d.save(os.path.join(here, "article.docx"))

# --- Excel: two sheets, a date column, percent, a hidden sheet
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Plan"
ws.append(["Task", "Due", "Done"]); ws.append(["Write", datetime.date(2026, 3, 14), 0.5]); ws.append(["Review", datetime.date(2026, 4, 1), 1])
for c in ws["B"][1:]: c.number_format = "yyyy-mm-dd"
for c in ws["C"][1:]: c.number_format = "0%"
w2 = wb.create_sheet("Notes"); w2.append(["Topic", "Note"]); w2.append(["REST", "Use nouns, not verbs"])
w3 = wb.create_sheet("Secret"); w3.append(["x"]); w3.sheet_state = "hidden"
wb.save(os.path.join(here, "article.xlsx"))

# --- PDF: heading sizes, paragraph, bullets, numbered heading
c = canvas.Canvas(os.path.join(here, "article.pdf"), pagesize=A4)
y = 800
c.setFont("Helvetica-Bold", 24); c.drawString(60, y, "Message Queues"); y -= 40
c.setFont("Helvetica-Bold", 16); c.drawString(60, y, "1. Why queues"); y -= 24
c.setFont("Helvetica", 11)
for ln in ["A queue decouples the producer from the consumer so spikes are absorbed", "and work can be retried without the caller waiting."]:
    c.drawString(60, y, ln); y -= 15
y -= 8
for b in ["At least once delivery", "Dead letter queues", "Backpressure"]:
    c.drawString(70, y, "•"); c.drawString(86, y, b); y -= 16
y -= 10; c.setFont("Helvetica-Bold", 16); c.drawString(60, y, "2. Ordering"); y -= 24
c.setFont("Helvetica", 11); c.drawString(60, y, "Ordering is only guaranteed inside one partition."); c.showPage()
c.setFont("Helvetica", 11); c.drawString(60, 800, "A second page paragraph about partitions."); c.save()

open(os.path.join(here, "article.md"), "w").write("""# Git Notes

## Basics
Use `git status` often. **Commit small**, *commit often*, see [the book](https://git-scm.com/book).

- init
- clone
  - shallow
  - mirror

1. fetch
2. merge

> Never rewrite shared history.

```bash
git log --oneline
```

| Command | Use |
|---|---|
| add | stage |
| a\\|b | pipe |

---
Last line.
""")
open(os.path.join(here, "article.txt"), "w").write("""THREADING NOTES

A thread is the smallest unit of execution the scheduler can run.
Every process starts with one.

KEY IDEAS
- Shared state needs locks
- Prefer immutability

1. Race conditions
Two threads write the same field without a lock.

2. Deadlocks
Two locks taken in opposite order.
""")
open(os.path.join(here, "article.csv"), "w").write('Name,Role\n"Smith, Ann",Dev\nBo,"QA\nlead"\n')
print("ok")
