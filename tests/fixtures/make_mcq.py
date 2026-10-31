"""MCQ fixtures: a multi-page PDF (answer lines repeat on most pages, footers say 'Page N'), plus text variants."""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import random
random.seed(7)
FACTS = [("What does ConfigureAwait(false) do?", "It avoids resuming on the captured synchronization context.", ["It cancels the task.", "It forces a new thread.", "It makes the call synchronous."]),
 ("Which HTTP status means Too Many Requests?", "429", ["404", "409", "422"]),
 ("What does a covering index include?", "All columns a query needs, avoiding key lookups.", ["Every column in the table.", "Only the primary key.", "A hash of each row."]),
 ("Which RxJS operator ignores new emissions while an inner observable runs?", "exhaustMap", ["switchMap", "mergeMap", "concatMap"]),
 ("What does the outbox pattern guarantee?", "Events are published at least once alongside the state change.", ["Exactly-once delivery everywhere.", "No broker is needed.", "Messages are never duplicated."]),
 ("Which flow should an SPA use for sign-in today?", "Authorization Code with PKCE", ["Implicit flow", "Password grant", "Basic auth"])]
SECTIONS = [("C# and Advanced .NET", FACTS[:2]), ("Data and Angular", FACTS[2:4]), ("Architecture and Security", FACTS[4:])]
c = canvas.Canvas("mcq-sample.pdf", pagesize=A4); W, H = A4
page = 1; y = H - 60; n = 0
def footer():
    c.setFont("Helvetica", 8); c.drawString(60, 30, f"Sample Prep - 18 MCQs    Page {page}")
def line(t, size=10.5, font="Helvetica", x=60):
    global y
    c.setFont(font, size); c.drawString(x, y, t); y -= size + 7
for sname, facts in SECTIONS:
    c.setFont("Helvetica-Bold", 15); c.drawString(60, y, sname); y -= 26
    for rep in range(3):
        for q, right, wrong in facts:
            n += 1
            if y < 170: footer(); c.showPage(); page += 1; y = H - 60
            opts = wrong[:] ; pos = random.randrange(4); opts.insert(pos, right)
            stem = f"{n}. {q}" if rep == 0 else f"{n}. A team reviewing a design (case {n}) asks: {q} Choose the most precise answer."
            words = stem.split(); ls, cur = [], ""
            for w in words:
                if len(cur) + len(w) > 78: ls.append(cur); cur = w
                else: cur = (cur + " " + w).strip()
            ls.append(cur)
            for k, l in enumerate(ls): line(l, 10.5, "Helvetica-Bold")
            for k, o in enumerate(opts): line(f"{'ABCD'[k]}) {o}", 10, "Helvetica", 76)
            line(f"And : {'ABCD'[pos]}", 10, "Helvetica-Bold", 76); y -= 4
footer(); c.save()

open("mcq-sample.txt", "w").write("""Networking basics

Q1. Which protocol is connectionless?
A. TCP
B. UDP
C. HTTP
D. FTP
Ans: B

Q2. What does DNS resolve?
(A) IP addresses to MAC addresses
(B) Host names to IP addresses
(C) Ports to services
(D) URLs to files
Answer - b
Explanation: DNS maps names to addresses.

3) Which header carries a bearer token?
A Authorization
B Content-Type
C Accept
D Host
Correct Answer: A
""")
open("mcq-phone.txt", "w").write("""What is the default lifetime of a service registered with AddDbContext?
A
Singleton
B
Scoped
C
Transient
D
Pooled
Ans : b

Which keyword prevents inheritance of a class in C#?
A  abstract
B  sealed
C  static
D  partial
Ans : B
""")
