# StudyMate: one Docker web service on Render

This archive contains the **entire StudyMate app** (React frontend + FastAPI backend) and the Docker/Render configuration. It merges the prior student/mobile improvements, response streaming, equation rendering, and confirmation dialogs. It runs as **one Render Docker Web Service** backed by your existing Supabase PostgreSQL database and Groq API.

## Step 1: Push to GitHub

Render deploys a Git repo or container image, not a ZIP uploaded to its dashboard. Unzip this archive. Either copy all its contents into the root of the existing `Nizion_Chatbot` repository (the folder that contains `frontend/` and `backend/`) or push the folder to a new repo. **Do not upload the parent folder as an extra nesting level.** Commit and push to branch `kingkhan` (or select the branch you used when deploying):

```bash
git add .
git commit -m "Add single-service Docker deployment for StudyMate"
git push origin kingkhan
```

Never commit actual `.env` files. This ZIP includes `.env.example` templates only. If you copy it into the existing repository, preserve `frontend/package-lock.json` when present for reproducible builds.

## Step 2: Create ONE Render Web Service

1. Open https://dashboard.render.com/ and select **New > Web Service**.
2. Connect your GitHub repo `Shashanklambat/Nizion_Chatbot` and select branch `kingkhan`.
3. **Language: Docker**. **Root Directory: leave blank**.
4. Dockerfile path: `./Dockerfile` (default). Context: repository root.
5. Choose the Free plan for testing if available.
6. Set the health check path to `/api/health`.
7. Configure the environment variables below and press Deploy.

**Alternative:** Render > New > Blueprint, select the same repo. The provided `render.yaml` creates the single service. Render will prompt for `DATABASE_URL` and `GROQ_API_KEY`; it generates a random `JWT_SECRET_KEY` and defaults OTP to `false` for temporary private testing.

## Step 3: Set environment variables (backend only)

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Your complete **Supabase Session pooler URI**, including URL-encoded password and `?sslmode=require` |
| `JWT_SECRET_KEY` | A long random value (Render Blueprint can generate it) |
| `GROQ_API_KEY` | Your actual Groq API key |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `APP_ENV` | `production` |
| `WHATSAPP_OTP_ENABLED` | `false` for **temporary private testing**; `true` for real users |

No `SUPABASE_URL`, Supabase secret key, `VITE_API_URL`, frontend URL, or CORS setting is required for this single-origin deployment. The backend directly connects to Supabase Postgres over the `DATABASE_URL`.

For real WhatsApp OTP (`WHATSAPP_OTP_ENABLED=true`) also set `META_WA_ACCESS_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_OTP_TEMPLATE`, `META_WA_TEMPLATE_LANG`, and `META_GRAPH_VERSION` in Render as backend environment variables. OTP is *not* sent when the switch is false.

**IMPORTANT:** The Supabase API keys are NOT database passwords. Use Supabase Dashboard > Connect > Session pooler for the connection URI. Do not paste any secrets in source files or GitHub. Rotate previously exposed secrets.

## Step 4: Confirm deployment

When Render says Live, check:

- `https://YOUR-RENDER-APP.onrender.com/` → StudyMate sign-in page
- `https://YOUR-RENDER-APP.onrender.com/api/health` → `{"status":"ok",...}`
- `https://YOUR-RENDER-APP.onrender.com/api/config` → public OTP on/off flag

Then register using an **unverified test number only while OTP is disabled**, sign in, ask a question, reopen chat history, test back-navigation and confirmations on an actual phone. Voice typing depends on browser support, HTTPS and microphone permission.

## What Docker does

1. Stage 1: Node 22 installs frontend packages and runs `npm run build`.
2. Stage 2: Python 3.12 installs backend requirements and copies the compiled `frontend/dist` assets.
3. `uvicorn app.serve:app` serves `/api/*` from FastAPI and all other pages/assets from the compiled frontend.
4. The entire app listens on the single Render-assigned `$PORT` (`10000` by default).
5. The backend reads secrets only at runtime. Its database stays in Supabase (not in the container).

## Troubleshooting

- **Dockerfile not found:** leave Render's Root Directory blank; `Dockerfile` must be in repo root.
- **Missing frontend:** check Docker frontend build logs; run `npm install && npm run build` in `frontend/` locally to diagnose.
- **Backend won't start:** confirm `DATABASE_URL` is a working Supabase PostgreSQL URI; check SSL/password and pooler hostname. The app intentionally fails startup rather than silently using SQLite.
- **No response from Groq:** confirm `GROQ_API_KEY` and Groq account/model availability; inspect Render logs.
- **Free service slow initially:** Render's free instances can spin down between visits. This is hosting cold-start time, not necessarily Groq latency.
- **CSS/JS files return 404:** check frontend build completed and `frontend/dist` was copied in Docker.
- **Editing `.env` after deploy did nothing:** set the values in Render > Web Service > Environment; Render does not read your laptop's local `.env`.
- **Updates:** push changes to the linked branch; Render rebuilds and redeploys.

## Local Docker test (if Docker Desktop is installed)

```bash
docker build -t studymate .
docker run --rm -p 10000:10000 --env-file backend/.env -e APP_ENV=production studymate
```

Open `http://localhost:10000/` and `http://localhost:10000/api/health`.

## Notes before a public student launch

- Enable and configure real WhatsApp verification before inviting public students. Never leave `WHATSAPP_OTP_ENABLED=false` on a publicly promoted signup page.
- Add appropriate age/guardian consent verification, rate limiting, abuse prevention, and account recovery before real-world school use.
- Keep JWT secrets stable across redeploys or existing sessions will be invalidated.
- The AI is age-adjusted using Groq prompts; exact textbooks are not yet used as a verified retrieval source.
