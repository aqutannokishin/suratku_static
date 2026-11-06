"""Pintu masuk aplikasi.  Dijalankan dengan:  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"""
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .deps import Forbidden, NeedLogin
from .routers import admin, api, auth, pages
from .seed import init_db
from .web import render


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, same_site="lax",
                   https_only=False, max_age=settings.session_hours * 3600, session_cookie="suratku_session")


@app.middleware("http")
async def same_origin_only(request: Request, call_next):
    """Tolak form yang dikirim dari situs lain (perlindungan CSRF tambahan)."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("origin")
        if origin and origin != "null" and urlparse(origin).netloc != request.headers.get("host"):
            return PlainTextResponse("Permintaan ditolak (asal tidak cocok).", status_code=403)
    return await call_next(request)


app.mount("/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")
for r in (auth.router, pages.router, api.router, admin.router):
    app.include_router(r)


@app.exception_handler(NeedLogin)
async def _need_login(request: Request, exc: NeedLogin):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"error": "Silakan login ulang."}, status_code=401)
    return RedirectResponse("/login", status_code=303)


@app.exception_handler(Forbidden)
async def _forbidden(request: Request, exc: Forbidden):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"error": "Tidak punya akses."}, status_code=403)
    return render(request, "error.html", status_code=403, title="Tidak punya akses",
                  message="Halaman ini khusus admin.")


@app.exception_handler(404)
async def _not_found(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"error": "Tidak ditemukan."}, status_code=404)
    return render(request, "error.html", status_code=404, title="Halaman tidak ditemukan",
                  message="Alamat yang dibuka tidak ada atau datanya sudah dihapus.")
