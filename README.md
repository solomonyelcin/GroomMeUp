# GroomMeUp

A free, no-backend interview preparation workbench built around a senior .NET full stack profile
(C#, ASP.NET Core, EF Core, Angular, Snowflake, microservices, Azure/Kubernetes). Open it, practise daily,
get evaluated, and log real interviews so practice follows what companies actually ask.

## What is inside

| Area | What it does |
|---|---|
| Dashboard | Readiness score (answer quality, coverage, quiz accuracy, coding), streak, weakest topics, today's session |
| Question bank | 96 searchable questions in 11 topics with model answers, key points and follow-ups. Add your own or generate more with AI |
| Practice | Write or dictate an answer, get a score and gaps, flashcard mode, spaced repetition (Leitner) |
| Quick quiz | 42 multiple-choice items, shuffled options, optional timer, per-topic results |
| Mock interview | Timed rounds with no hints, then a per-question debrief and hire signal |
| Coding tests | 12 JavaScript (run in a Web Worker against hidden tests), 8 SQL (run in-browser with sql.js), 6 C# (rubric + AI review, optional Piston runner) |
| Interview log | Record real interviews, questions and feedback. Questions become practice items, topics are tracked |
| Market and resume | 2026 skill demand, round formats, pay guidance (with caveats), resume risks to fix, sources |
| Study plan | Four-week plan that reorders itself around your weakest topics |

## AI feedback (free, on by default)

AI evaluation is **on by default using a free, keyless service** (Pollinations), so nothing needs setting up.
Your answer, the question and a short profile are sent to that service, so keep confidential employer details
out of answers. If the service is unavailable the app automatically falls back to offline key-point scoring.

For sharper, more consistent feedback add your own **free** key in Settings:

- Google Gemini: https://aistudio.google.com/apikey
- Groq: https://console.groq.com/keys
- OpenRouter (free models): https://openrouter.ai/keys

Choose **Offline** in Settings to keep everything on your device. Keys stay in your browser's localStorage and
are sent only to the provider you choose. Model names change, so edit the model field if a provider retires one.

## Daily set

Home shows **Today's 5**: a new set every day, chosen from what is due for review, weak, or not yet tried (at most 2 per topic) and frozen for the day. With AI on, one tap adds 5 fresh questions on a topic that rotates through the market's most-wanted skills and your topic list. Nothing runs in the background; the set refreshes whenever you open the app on a new day.

## Import your own material

Open **Import material** and drop in Excel (.xlsx), Word (.docx), PDF, text, markdown or CSV files.

- Excel/CSV: one sheet per topic, with `Question` and `Answer` columns (optional `Sub Topic`, `Learning Status`). Sub topics containing "Scenario" are flagged as scenario questions; rows marked "Confident" can start as already learned.
- Word/PDF/text: `Q:`/`A:` pairs, numbered questions with answers underneath, or question headings. Loose notes can be turned into questions with the AI option.
- Multiple choice: files with `Question / A / B / C / D / Ans : c` blocks (any common layout, including phone-exported PDFs) are read as real MCQs with the correct option and explanation, and used as-is in Practice and Quick quiz.
- Questions only (no answers): they are listed as pending; **Write answers with AI** drafts them in batches of 50. AI-written answers are badged "AI draft", never used as quiz source material, so check them before relying on them.
- Review before importing: suspicious items (very short, look like another question, broken options) start unticked and can be edited. **Skip repeats** (default on) keeps at most 2 questions per identical fact per topic; untick it to import everything.
- Imported topics appear in the Question bank, Practice, Quick quiz (multiple choice is generated from your own answers), Mock interview and Dashboard. Each import can be removed in one click.
- Everything is parsed in your browser and stored in localStorage; nothing is uploaded. Old `.xls`/`.doc` files must be saved as `.xlsx`/`.docx`; scanned PDFs need OCR first.
- Browse questions shows answers inline (toggle **Show answers**) with topic, source and type filters. Quick quiz uses every question, favouring weak topics and ones you missed; choosing topics is optional.
- Tests: `npm test` covers the parsers; set `MCQ_PDF_PATH=/path/to/file.pdf` for the smoke test to check your own MCQ PDF; set `WORKBOOK_PATH=/path/to/your.xlsx` to also check your own file (never commit personal files). PDF reading uses a vendored PDF.js (Apache-2.0).

## Encrypted personal library

For material you may not publish (a licensed question bank, say) the repo can hold an **encrypted** copy at `library/library.enc.json` (AES-256-GCM, key from your passphrase via PBKDF2-SHA256, 600k rounds). On any device open **Add my questions**, enter the passphrase under *My library* and tap *Load library*; it is decrypted in the browser only. Loading again refreshes the earlier copy. Update it with `LIB_PASS='...' node tools/make-library.mjs workbook.xlsx library/library.enc.json "Library name"`. Never commit the Excel file or the passphrase; use a long, unguessable passphrase because the encrypted file is public.

## Motivation

**Progress & badges** tracks a daily streak, XP and levels, three daily challenges, a weekly question goal (adjustable), a 4-week activity map and 21 badges (study milestones, streaks, quizzes, coding, mocks). Everything is derived from your saved activity; new badges pop up as you earn them. Home shows a streak card.

## Browse, study and track

- **Browse questions** opens one question at a time on phones, nearly full screen: the options, filters and view switch sit in one collapsed panel, **Previous / Next** stay fixed at the bottom (also swipe or use the arrow keys), and each tap lands on the question itself. **I know this / Revise again** count as studying (streak, badges, spaced repetition), plus **Star**, **My note** and **Listen** (text to speech).
- **Quick quiz** can be ended early, retried on the questions you missed, or limited to questions you got wrong before.
- **Match a job**: paste a job description and get the questions that match its skills (runs on your device).
- **Progress & badges** adds a topic strength map and a daily reminder (.ics calendar file). **Settings → Move progress** copies a progress code you can merge on another device.

## Install as an app

GroomMeUp is a Progressive Web App. In Chrome/Edge on Android or desktop use **Install app** (menu or browser address bar); on iPhone use Share, then Add to Home Screen. It opens full-screen and keeps working offline after the first visit (AI features need a connection). Updates arrive on the next open.

## Themes

Six themes (Chalk, Midnight, Forest, Graphite, Rose, High contrast) plus "match my device", switchable from the
sidebar or Settings. All colours come from tokens in `css/themes.css`, and every theme is checked for WCAG AA text contrast.

## Run it

It is static files. Any web server works (ES modules need http, not file://):

```bash
npm start            # serves on http://localhost:5173
npm install && npm test   # verifies all data, reference solutions and SQL answers
```

Deploys to GitHub Pages through `.github/workflows/pages.yml` (enable Pages: Settings > Pages > Source: GitHub Actions).

## Data and privacy

Progress, logs and custom questions are stored in your browser (localStorage). Use Settings > Export backup to
move between devices. Nothing is collected by any server of ours: there isn't one.

## Extending

- Questions: `js/data/questions-*.js` use `mk(id, category, difficulty, question, answer, keyPoints, followUps)`.
  Each key point is `[label, keyword, keyword...]`, and keywords are what the offline scorer matches.
- Coding tests: add to `js/data/coding-*.js`. `npm test` proves every reference solution passes its own tests.
- Always add real questions from your interviews through the Interview log.

## Content notes

Question content was assembled from public 2026 interview-prep and hiring write-ups (listed in the app under
Market and resume) and rewritten with original answers. Salary figures come from a single training-provider
blog and are indicative only: verify on AmbitionBox, Glassdoor, Levels.fyi and with recruiters.
