# StudyMate — student learning chatbot

StudyMate is a mobile-first educational chatbot built with **React/Vite + FastAPI + Supabase PostgreSQL + Groq**. Student class and board remain locked after registration. The app includes responsive sign-in/signup, voice question entry on supported browsers, chat history, confirmation modals, markdown/LaTeX answers, and streaming responses.

**For single-service Render Docker deployment, start with [`DEPLOY_ON_RENDER.md`](DEPLOY_ON_RENDER.md).**

- Root `Dockerfile`: builds frontend and serves it from the Python API container.
- `render.yaml`: optional one-service Render Blueprint.
- `backend/app/serve.py`: production entrypoint mounting the compiled frontend after existing API routes.
- `backend/app/main.py`: existing API implementation unchanged by this Docker packaging.
- `frontend/`: React mobile UI.

No live secrets are included. See `backend/.env.example` for configuration names, and put real settings into Render Environment. The existing Supabase database continues to hold student accounts and chat history.
