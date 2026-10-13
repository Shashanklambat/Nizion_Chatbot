# Stage 1: compile the React/Vite frontend.
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
# The complete archive works by itself; when a lockfile exists, use deterministic npm ci.
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
# One host serves the UI and /api; no public backend URL needed in frontend assets.
ENV VITE_API_URL=/api
RUN npm run build

# Stage 2: lightweight Python runtime; Node/npm not included in the final image.
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000
WORKDIR /srv
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && useradd --create-home --uid 10001 studymate
COPY --chown=studymate:studymate backend/app ./backend/app
COPY --from=frontend-build --chown=studymate:studymate /build/frontend/dist ./frontend/dist
USER studymate
EXPOSE 10000
# Shell form expands the PORT Render assigns to the web service.
CMD ["sh", "-c", "exec uvicorn app.serve:app --app-dir backend --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers"]
