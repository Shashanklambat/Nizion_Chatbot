"""Serve a built React/Vite SPA while reserving /api for FastAPI routes."""
from pathlib import PurePosixPath

from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            # Allow client-side routes to reload without making API typos look like a web page.
            # Also never return HTML for missing JS/CSS/favicon paths.
            if (error.status_code == 404
                    and scope.get("method") in {"GET", "HEAD"}
                    and not path.lstrip("/").startswith("api/")
                    and PurePosixPath(path).suffix == ""):
                return await super().get_response("index.html", scope)
            raise
