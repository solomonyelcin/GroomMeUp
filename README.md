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

## Free AI (optional)

Evaluation works offline using key-point coverage. For deeper feedback add a **free** key in Settings:

- Google Gemini: https://aistudio.google.com/apikey
- Groq: https://console.groq.com/keys
- OpenRouter (free models): https://openrouter.ai/keys

Keys stay in your browser's localStorage and are sent only to the provider you choose. Model names change,
so edit the model field in Settings if a provider retires one. Do not paste confidential employer data into answers.

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
