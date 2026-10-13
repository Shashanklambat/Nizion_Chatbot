"""Single-service production entrypoint: FastAPI API + compiled React frontend."""
from pathlib import Path

from .main import app  # Keeps every existing API route and middleware unchanged.
from .spa import SPAStaticFiles

frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if not (frontend_dist / "index.html").is_file():
    raise RuntimeError(
        f"Built frontend missing at {frontend_dist}. "
        "Build the Vite frontend before running app.serve."
    )

# This mount MUST be last so the existing /api endpoints take precedence.
app.mount("/", SPAStaticFiles(directory=str(frontend_dist), html=True), name="studymate")
