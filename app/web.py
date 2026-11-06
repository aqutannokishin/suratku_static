"""Bantuan untuk menampilkan halaman HTML."""
from pathlib import Path

from fastapi import Request
from fastapi.templating import Jinja2Templates

from .config import settings
from .doctypes import REGISTRY
from .services.pdf import pdf_available

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
templates.env.filters["dt"] = lambda v: v.strftime("%d/%m/%Y %H:%M") if v else ""
templates.env.filters["d"] = lambda v: v.strftime("%d/%m/%Y") if v else ""
templates.env.globals["REGISTRY"] = REGISTRY


def flash(request: Request, message: str, kind: str = "ok") -> None:
    """Pesan singkat yang tampil sekali di halaman berikutnya. kind: ok | error | warn"""
    request.session["flash"] = request.session.get("flash", []) + [[kind, message]]


def render(request: Request, name: str, status_code: int = 200, **ctx):
    ctx["flashes"] = request.session.pop("flash", [])
    ctx.setdefault("user", None)
    ctx["settings"] = settings
    ctx["pdf_ok"] = pdf_available()
    return templates.TemplateResponse(request, name, ctx, status_code=status_code)
