# StudyMate — temporary WhatsApp OTP off + white answer cards

## Changes made
- Saved AI answers, in-progress streamed answers, and the "Preparing an explanation" status now have a white card background, a fine blue-grey border, and dark, readable text.
- `backend/.env.example` now shows `WHATSAPP_OTP_ENABLED=false` **for temporary testing only**.
- The existing API, database, WhatsApp integration, and chat history logic are unchanged.

## CRITICAL: turn off OTP in your deployed Render service
`backend/.env.example` is **only a template**, and `render.yaml` applies only when that Blueprint is used. Changing either file does not automatically change an already deployed Render service.

1. In the Render dashboard, open the **StudyMate web service** (not a static site).
2. Select **Environment**.
3. Create or edit `WHATSAPP_OTP_ENABLED`, set its value to **`false`** (without quotes; all lower-case).
4. Click **Save, rebuild, and deploy** (or save the variables and redeploy if prompted).
5. When the service is Live, open `https://YOUR-SERVICE.onrender.com/api/config`.
6. Confirm you see `{ "whatsapp_otp_enabled": false }`.
7. Refresh the registration page. The WhatsApp verification section should be hidden.

If `/api/config` still says `true`, the setting was not applied to the running service. Verify the service, variable spelling, value, and deployment status. Do not put the flag in the frontend's `VITE_` variables: the backend controls the flag.

**Do not leave this setting disabled for public/student use.** Anyone can sign up using an unverified number. Before a public launch, set the flag to `true`, configure an approved WhatsApp OTP provider, and redeploy. Existing test accounts remain unverified.

## Apply the code changes

For the small patch archive, copy the included files to the same paths in your existing GitHub project:

- `frontend/src/App.jsx`
- `frontend/src/styles.css`
- `backend/.env.example`

Push your updates to the **branch deployed by Render**, currently `main` in the logs you shared. Render > **Manual Deploy** > **Deploy latest commit** if it does not deploy automatically.

The full-project archive includes the same changes plus all existing project files, Dockerfile, and Render Blueprint. Do not commit real `.env` files or secrets.

## Verification
- Tested: 21 backend automated tests passed.
- CSS stylesheet parsed without errors.
- Frontend source change is limited to adding card classes, but the full frontend npm build could not be verified here because package installation timed out.
- Live Supabase, Groq, and Render services cannot be validated without your running deployment.
