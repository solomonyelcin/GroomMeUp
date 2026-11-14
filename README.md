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

## FAQs: adding a topic
The FAQs page reads `js/data/faqs.js`. To add a topic, append one object to `FAQS`:
`{ id, n, companies, title, sub, diagram, tip, qa: [[question, answer], ...] }`. Answers can use `` `code` `` and `**bold**`, and `\n` for line breaks.
`diagram` names an illustration in `js/views/faq-diagrams.js` (add a function there, or leave it unset for none). List any new source guides in `FAQ_SOURCES`. The page, the tabs and "Add to my questions" pick the new topic up automatically.

## Extending

- Questions: `js/data/questions-*.js` use `mk(id, category, difficulty, question, answer, keyPoints, followUps)`.
  Each key point is `[label, keyword, keyword...]`, and keywords are what the offline scorer matches.
- Coding tests: add to `js/data/coding-*.js`. `npm test` proves every reference solution passes its own tests.
- Always add real questions from your interviews through the Interview log.

## Content notes

Question content was assembled from public 2026 interview-prep and hiring write-ups (listed in the app under
Market and resume) and rewritten with original answers. Salary figures come from a single training-provider
blog and are indicative only: verify on AmbitionBox, Glassdoor, Levels.fyi and with recruiters.

## Import from pictures (OCR)

`Add my questions` → **Import from pictures** reads photos or screenshots of notes in the browser with Tesseract.js
(loaded once from the jsDelivr CDN, then cached; pictures never leave the device). Pages can be dragged into order;
`js/import/ocrlayout.js` turns word boxes into an article (two-column reading order, title, numbered sections, bullets,
tables, sentences and numbering that continue across pages). Results are saved on the **Articles** page.
Unit tests use recorded OCR output (`tests/fixtures/`), and the smoke test swaps the CDN engine for it.

**Keep as pictures:** instead of reading the text, pages can be saved as images (IndexedDB, on the device only) and read in
Articles with `js/views/imgviewer.js`: zoom, pan, rotate, grayscale / black & white / dark views, brightness and contrast.

**Share pictures across devices:** *Settings → GitHub* takes a fine-grained token (this repository only, Contents: Read and write). With it,
*Keep as pictures → Also publish to GitHub* commits the pages to `content/<id>/NN.jpg` and lists them in `content/articles.json`
(see `js/github.js`); every device then shows them in Articles. The token lives only in that browser and is never exported.
The repository is public, so published pictures are public too.

## Backups and recovery

All progress lives in the browser, so clearing the browser's site data erases it. Protection, in order of importance:

- **Back up now** (Settings, top card, and the reminder bar that appears when the last backup is over 7 days old): saves `groommeup-backup-DATE.json`
  to the device and, optionally, an AES-256-GCM encrypted copy to `backup/progress.enc.json` in the repo (passphrase of 10+ characters, never stored;
  the repo is public, so that passphrase is the only lock). The plain file never contains the AI key or GitHub token; the encrypted copy can include them if you tick the box.
- **Restore** is offered on first launch of an empty browser (file, `GMU1.` code, encrypted GitHub copy, encrypted library) and in Settings → Your data → Restore from file.
- **Persistent storage** (`navigator.storage.persist()`) is requested after first launch. It stops the browser evicting data when space is low; it does not stop a manual "clear site data".
- Pictures kept only on a device (not published to GitHub) are not part of a backup file.

Tests: `npm run test:backup` (needs `PW_PATH`, like the smoke test) wipes a browser and restores it every supported way.

## Library: questions, articles, FAQs and adding material in one place

The menu has one **Library** entry with four tabs: Questions, Articles, FAQs and Add material. Old links such as `#/bank`, `#/faq` and `#/import` still work and open the matching tab.

**Add material** takes PDF, Word (.docx), Excel (.xlsx), CSV, text and markdown. Each file is read in the browser (nothing is uploaded) both ways, then the page recommends what to do, with its numbers (how many questions were found, how much of the text they cover):

- **Keep as an article**: the exact content, with headings, lists, tables, code, bold/italic/links and pictures from Word files. Long articles get a contents list. The original file can be kept on the device and opened or downloaded from the article ("Original").
- **Extract questions**: questions written as headings ("Question 3: ..." with the answer under them) are taken exactly; other files go through the existing question reader with its review step.
- **Both**, which is suggested for documents that are mostly Q&A but also contain tables, code or explanation.

How each format is read: `js/import/article.js` (entry point), `pdfnative.js` (text PDFs: real font bold/italic/monospace, sizes and positions give headings, lists, tables and code), `blocks.js` (the block model, markdown round trip, questions from headings). Limits: scanned PDFs have no text (use Import from pictures); pictures inside PDFs are not extracted; a two-column PDF is read line by line and gets a warning; code that the PDF stores as one long line stays one line; very large files keep the first ~1.5 MB of text (the original is still kept).

**Where your library lives.** With GitHub connected (Settings), everything you add (files, pictures, pasted text, web pages) is saved in *your own repository*, under `content/<id>/` (article.json, original file, pictures) with a list in `content/articles.json`, and nothing is kept in the browser. Use a **private** repository (for example `GroomMeUp-data`) with a fine-grained token limited to it: only you can read it, it is free, and every device with the token shows the same library. Files are read back through the GitHub API with the token, so private repositories work. Without GitHub the library stays on that device and the Add page says so. `content/dotnet-guide/` in this public repository is a shared sample, readable by everyone; **Ready to add** puts the questions of any article that has them into practice.

**Paste text and web addresses.** Pasted text goes through the same advice step as files. A web address is read through a small helper, because browsers stop pages from reading other sites: a public free helper is the default, and `tools/url-helper/worker.js` is a free Cloudflare Worker you can deploy and set in Settings. Pages behind a login do not work; the main text, headings, lists, code, tables and links are kept and menus and footers dropped.

**Quizzes** are always multiple choice. **Quiz me on this** on an article makes questions from its Question/Algorithm headings, or from its headings and the text under them (at least four are needed), and opens a quiz for just that article.

Planned next: sign-in and a separate library, progress and settings per user, each in that user's own private repository.

Tests: `node tests/article.test.mjs` (readers, markdown round trip, PDF structure, questions), `npm run test:library` (storage in a fake private GitHub repo, paste, web address, second device, quiz) and the Library steps in `tests/smoke.mjs`. Rebuild the sample files with `python3 tests/fixtures/make_articles.py`.

## Accounts, sign-in and sync

- **Sign in** (Settings → GitHub): paste a fine-grained token with *Contents: read and write* on your own private repo (default name `GroomMeUp-data`). A static site cannot do OAuth, so the token is the sign-in. It stays in the browser and is never part of a backup.
- **Per-user data**: progress, notes, settings and the library are kept under your GitHub login, so each person on a shared device sees only their own. Existing guest progress is moved into the account at first sign-in.
- **Library files** (articles, original PDFs/Word/Excel, pictures, questions) are written to `content/<id>/` in your repo and read back on any device.
- **Progress sync**: `progress/state.json` in your repo (about 1 MB limit). If two devices diverge, the other copy is saved as `progress/conflict-<time>.json` rather than overwritten.
- **Sign out** wipes that account's local data (it stays in your repo). To switch accounts, sign out first.
- AI keys never leave the browser and are not synced. Use a private repo; the app warns if it is public.

## Live voice interview (Mock interview)

- Pick **Level** (Easy, Medium, Hard, Pro), **Duration** (10 to 30 minutes) and **Programming questions** (Yes/No), then press Start.
- The interviewer **speaks** each question (browser speech synthesis), starting with "Tell me about yourself". Full and HR rounds also ask why you want a change and end with "Do you have questions for us?". You answer **aloud**; your words appear in the box (browser speech recognition, Chrome or Edge) and you can edit them. Browsers without a microphone fall back to typing.
- **Pro** hides the question text (audio only), gives shorter time per answer and moves on after a 6 second pause. Programming questions come from the Coding tests bank: say your approach, then type the code.
- The interview stops when the duration is over. The debrief gives a score, a hire signal, delivery stats (words per answer, pace, filler words), per question feedback with model answers, weak topics with a quiz link, and a **Download transcript** button.
- Nothing is uploaded by the app; speech goes through your browser's own speech service. Test: `npm run test:live`.

## What goes into quizzes

Quizzes only use questions with **clear options and one marked correct answer**:
- hand-written multiple choice, and multiple choice found inside your files (with their own options and answer key);
- multiple choice made from the curated built-in answers, never from imported text, which can be split badly.

Anything else you import (plain Q&A, articles, notes) stays in the Library as reading material and still works in Practice and Mock interview. Items with unclear options (duplicates, no marked answer, an option that is itself a question) are left out, and the Quiz page tells you how many. Test: `node tests/quizgate.test.mjs`.

## Library home, daily picks and reading

- **Library** has six tabs (scrollable on a phone): Home, Daily picks, Questions, Articles, FAQs, Add material.
- **Home**: one search across articles, questions, FAQs and daily picks (filter by kind), counts, Continue reading, Fresh for you, Starred, Recently added.
- **Articles**: star, sort (newest, A to Z, starred first), filter (starred, unread), reading time, text size A−/A+, narrow or wide lines, reading progress that is remembered and marks an article read near the end. On a phone the list and the article are separate screens with a back button. Stars and progress are saved with your progress, so they follow you across devices when signed in.
- **Daily picks**: a free GitHub Action (`.github/workflows/daily.yml`) runs every morning at 6:00 India time, reads public feeds (.NET Blog, Andrew Lock, Code Maze, Angular Blog, Martin Fowler, release notes and more), keeps what matches your skills and writes `content/daily/feed.json`, then redeploys the site. Only the title, a short excerpt and a link are stored. **Add to library** reads the page and keeps your own copy in your private repository.
- Tune it: edit `content/daily/config.json` (topics and keywords, sources, how many picks per day, how long to keep them). Run it now: GitHub → Actions → Daily picks → Run workflow.
- Tests: `npm run test:libui`, `node tests/digest.test.mjs`.

## Roadmap and Corpay prep (Library)

- **Roadmap tab:** the .NET AI Engineer Roadmap 2026-27 as eight steps. Guides live in `content/roadmap/src/*.md`; run `node scripts/build-roadmap.mjs` to turn them into shared articles. Questions: `js/data/questions-e.js`, quiz: `js/data/mcq-roadmap.js`.
- **Corpay prep tab:** guides in `content/corpay/src/*.md` (`node scripts/build-corpay.mjs`), questions `js/data/questions-f.js`, quiz `js/data/mcq-corpay.js`, mock round "Corpay technical round". Information is labelled as reported, from public listings, inferred, or unknown.
