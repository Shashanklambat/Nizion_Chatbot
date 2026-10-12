# ClassWise — Study at your level

A class-aware school tutor built with **React + Tailwind CSS, FastAPI, Groq, and Supabase PostgreSQL**. Student class and school board are chosen once and cannot be edited later. The registration flow uses a **real WhatsApp OTP** via the Meta WhatsApp Cloud API when enabled. A backend `.env` switch can temporarily turn it off for development testing.

Design inspiration: the *academic blue* palette and typography guidelines in [mobile-app-classX / DESIGN_SYSTEM.md](https://github.com/CANESSMON/mobile-app-classX/blob/main/DESIGN_SYSTEM.md). This project has its own UI and code; it does not copy the reference application's screens or business logic.

## Included features

- Student signup: name, username, email, password, Class 1–12, board, answer language, and WhatsApp number.
- **Server-side WhatsApp verification**: Send OTP → check OTP → short-lived, one-time registration ticket → create account. Code is never returned by the API; only its HMAC digest is stored. **Optional test-only bypass via `WHATSAPP_OTP_ENABLED=false`.**
- Unique-email/phone enforcement; verification status accurately recorded; 60-second resend cooldown, max 5 sends/day per number, max 5 incorrect code attempts; OTP expires after 10 minutes; ticket expires after 15 minutes.
- Class and board are **immutable** after account creation. FastAPI PATCH rejects these fields; a PostgreSQL trigger automatically enforces the rule even when another SQL client attempts to change them.
- Student account login with Argon2 password hash, JWT, and owner-isolated conversations.
- Groq class-specific prompts with Markdown structure, example-driven teaching, fenced code, lists, tables, and LaTeX notation.
- Chat interface renders GitHub Flavored Markdown and mathematical notation using react-markdown, remark-gfm, remark-math, rehype-katex, KaTeX. Copy-answer control included.
- Supabase Postgres for accounts, OTP challenges, conversations, and messages; no SQLite in the deployed backend.

## Backend setup

Requires Python 3.11+.

1. Create a **new Supabase project** at <https://supabase.com/dashboard>.
2. Go to **Connect** → copy the project's Postgres **Session pooler** URI (port 5432) for ordinary Render deployments; append `?sslmode=require` if it is not already present. Alternatively, transaction pooler port 6543 works with SQLAlchemy's `NullPool` and is usually best in autoscaling/serverless environments. Supabase gives the exact hostname and username — **do not invent them**.
3. Inside `backend`, run:

   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   # source .venv/bin/activate
   pip install -r requirements.txt
   ```
4. Copy `backend/.env.example` to `backend/.env`. Configure **DATABASE_URL**, **JWT_SECRET_KEY** (generate a long random secret), **GROQ_API_KEY**, and set the OTP switch below. Meta credentials are only required when OTP is enabled.
5. Start the backend:

   ```bash
   uvicorn app.main:app --reload
   ```

   The first startup creates `users`, `phone_challenges`, `conversations`, `messages` in PostgreSQL and installs database guards. This is an MVP convenience; introduce Alembic migrations before production schema changes.
6. **Database security is installed automatically on PostgreSQL startup.** The backend enables RLS without public client policies on all private tables, revokes `anon`/`authenticated` direct access, and installs a PostgreSQL trigger that prevents changing class, board, or verified WhatsApp number. The backend must have permission to run this DDL; otherwise it fails startup rather than serving insecurely. `backend/schema_immutability.sql` is supplied for manual re-application in the Supabase SQL Editor.
7. Check `http://localhost:8000/api/health` and API docs at `http://localhost:8000/docs`.

### Temporarily disable WhatsApp OTP for testing

In `backend/.env` (or the Render backend environment variables):

```dotenv
WHATSAPP_OTP_ENABLED=false
```

**Restart/redeploy the backend**, and refresh the frontend. Signup will now collect the WhatsApp number **without sending or checking a code**. Students do not need a verification ticket. The number is stored with `whatsapp_verified=false`, and the profile clearly displays **not verified**. You can leave the `META_WA_*` settings unset in this mode.

To re-enable mandatory real verification later:

```dotenv
WHATSAPP_OTP_ENABLED=true
```

Restart/redeploy the backend and refresh the frontend. New registrations now require a real OTP and one-time ticket again. **Existing test accounts remain unverified** and do not automatically become verified; use a future re-verification flow or remove them before a real launch. `true` is the default if the variable is absent or unset. Typos cause configuration failure rather than silently bypassing verification.

**Security note:** This switch is for isolated development/testing only. When disabled, anyone can claim an unverified number; avoid real student data and do not treat those phone numbers as evidence of account ownership. Keep `WHATSAPP_OTP_ENABLED=true` in public/production deployments.

The signup page reads this switch from `GET /api/config`, so the frontend automatically shows or hides OTP controls, without needing a second frontend `.env` setting. If it cannot read the backend config, signup fails closed instead of bypassing verification.

### Meta WhatsApp setup (required when OTP is enabled)

The application uses the **official Meta WhatsApp Cloud API**, not a fake OTP, and not Twilio's channel fallback to SMS. You need your own Meta developer/WhatsApp Business setup:

1. Create/configure a Meta WhatsApp Business sender and production access token. Obtain its **Phone Number ID**.
2. Create an **AUTHENTICATION** message template with **COPY_CODE** one-time-password button. Wait until its status is **approved**. The configured language must match the template's approved language.
3. Add to `backend/.env`:

   ```dotenv
   META_WA_ACCESS_TOKEN=your_permanent_system_user_access_token
   META_WA_PHONE_NUMBER_ID=your_phone_number_id
   META_WA_OTP_TEMPLATE=your_approved_auth_template_name
   META_WA_TEMPLATE_LANG=en_US
   META_GRAPH_VERSION=v23.0
   ```

4. Meta's template accepts one parameter in the body and one in the OTP copy-code button. The backend sends **the same six-digit code to both**, and separately validates the user's entered code against a hashed record in Supabase.
5. Make a real signup attempt using a WhatsApp-enabled number with full country code (e.g. `+919876543210`). API delivery acceptance does not guarantee user delivery; sender approval, recipient eligibility, country support, messaging tier, and template status matter.

**With `WHATSAPP_OTP_ENABLED=true`, missing Meta credentials or an unapproved template prevent verification (`503` when provider settings are missing), and registration is blocked until the phone is verified.** Meta Business onboarding and template messages may have costs and require verification. For a site serving minors, obtain and document appropriate guardian consent and publish a privacy policy before inviting actual students.

### Groq

Set `GROQ_API_KEY` and, if needed, `GROQ_MODEL` in the backend environment. The default is `openai/gpt-oss-20b`. The model does **not** get textbook material in this version; it adapts answers to the registered class and board using the system prompt. Future RAG will be required for answers strictly grounded in approved textbooks.

## Frontend setup

Requires Node 20+.

```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173**. Local Vite automatically proxies `/api` to `http://127.0.0.1:8000`.

- `frontend/.env.example` shows the optional `VITE_API_URL` setting.
- On Vercel/Netlify, set `VITE_API_URL=https://YOUR_RENDER_BACKEND_URL/api` (no trailing slash), then build with `npm run build` and publish `dist`.
- On Render, set the root directory to `backend`, build command `pip install -r requirements.txt`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Configure Render backend environment variables with **the same** values from `backend/.env` and `APP_ENV=production`. Set `CORS_ORIGINS=https://your-frontend-domain` (comma-separated if multiple). Never put JWT, DB, Meta, or Groq secrets in `VITE_` variables.

## API routes

| Route | Purpose |
| --- | --- |
| `GET /api/config` | Public signup feature flags (`whatsapp_otp_enabled` only), no secrets |
| `POST /api/auth/whatsapp/start` | Send WhatsApp 6-digit OTP (when verification enabled) |
| `POST /api/auth/whatsapp/check` | Validate OTP, return short-lived registration ticket |
| `POST /api/auth/register` | Require ticket when OTP is on; skip it during temporary test mode |
| `POST /api/auth/login` | Sign in |
| `GET /api/me` | Load authenticated profile |
| `PATCH /api/me` | Update **only** name and answer language |
| `GET/POST /api/conversations` | List/create chats |
| `GET/DELETE /api/conversations/{id}` | Open/delete student's own chat |
| `POST /api/conversations/{id}/messages` | Generate and save a class-aware AI answer |

### Example OTP request

```json
{"whatsapp_number":"+919876543210"}
```

**The email address is collected but not email-OTP verified** in this version; do not claim it is verified.

## Tests

Run in `backend`:

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

Tests use a temporary **SQLite memory database only within the test process** to avoid touching Supabase or actually sending WhatsApp messages. The shipped application explicitly rejects SQLite unless `APP_ENV=test`. The Meta provider is mocked for send-flow tests, and Groq is mocked for chat tests; these tests do **not** prove a production connection to real Supabase, Meta, or Groq.

## Existing SQLite users

This upgrade initializes new Supabase tables. It **does not silently migrate old SQLite accounts or chat records**, because old accounts are missing the new mandatory verified-WhatsApp and email fields. Existing users must register again or be migrated via an explicit consent-based migration with completed WhatsApp verification; do not assign made-up phone numbers or mark unverified accounts as verified.

## Production notes

- App credentials and secrets live **only on the server**. `CORS_ORIGINS` should list exact frontend origins. Use HTTPS.
- Passwords: Argon2. WhatsApp codes: HMAC digests, short expiration, one-time tickets, replay rejected.
- Add a distributed IP/device-level abuse limiter/CAPTCHA, monitoring, account recovery, email validation, guardian consent procedures, privacy/deletion policies, and proper schema migrations before a public school launch. App-level OTP limits are useful but not sufficient alone against distributed abuse.
- JWT is stored in `localStorage` for the MVP. For a public release, consider secure HttpOnly cookies with appropriate CSRF protection.
- All database connections use server-only credentials. Do not enable broad client access to Supabase tables. The backend enables RLS and revokes browser roles on all app tables; use server-only database credentials.
