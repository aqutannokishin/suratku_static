"""Struktur tabel database."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)


class Golongan(Base):
    __tablename__ = "golongan"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)       # "III/a"
    pangkat: Mapped[str] = mapped_column(String(80), default="")     # "Penata Muda"
    sort: Mapped[int] = mapped_column(default=0)


class Jabatan(Base):
    __tablename__ = "jabatan"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    name_norm: Mapped[str] = mapped_column(String(150), unique=True)


class PersonRole(Base):
    __tablename__ = "person_roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)


class Person(Base):
    __tablename__ = "persons"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    name_norm: Mapped[str] = mapped_column(String(150), index=True)
    nip: Mapped[str | None] = mapped_column(String(18), unique=True)
    golongan_id: Mapped[int | None] = mapped_column(ForeignKey("golongan.id"))
    jabatan_id: Mapped[int | None] = mapped_column(ForeignKey("jabatan.id"))
    role_id: Mapped[int] = mapped_column(ForeignKey("person_roles.id"))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    golongan: Mapped[Golongan | None] = relationship()
    jabatan: Mapped[Jabatan | None] = relationship()
    role: Mapped[PersonRole] = relationship()


class NumberSeries(Base):
    __tablename__ = "number_series"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)       # "ST"
    name: Mapped[str] = mapped_column(String(100))
    # Contoh pola: "{seq:03d}/{kode}/{romawi}/{tahun}"  ->  "045/ST/X/2026"
    pattern: Mapped[str] = mapped_column(String(200))
    reset: Mapped[str] = mapped_column(String(10), default="yearly")  # yearly | monthly | never


class NumberReservation(Base):
    __tablename__ = "number_reservations"
    __table_args__ = (UniqueConstraint("series_id", "period_key", "seq"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(ForeignKey("number_series.id"))
    period_key: Mapped[str] = mapped_column(String(10))
    seq: Mapped[int]
    formatted: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), default="reserved")  # reserved | used | void
    reserved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reserved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    void_reason: Mapped[str | None] = mapped_column(Text)
    series: Mapped[NumberSeries] = relationship()
    user: Mapped[User | None] = relationship()


class TemplateVersion(Base):
    __tablename__ = "template_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    doctype_code: Mapped[str] = mapped_column(String(50), index=True)
    version: Mapped[int]
    file_path: Mapped[str] = mapped_column(String(300))              # relatif terhadap folder doctemplates
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    is_active: Mapped[bool] = mapped_column(default=False)
    note: Mapped[str | None] = mapped_column(String(200))


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    doctype_code: Mapped[str] = mapped_column(String(50), index=True)
    nomor: Mapped[str | None] = mapped_column(String(200), index=True)
    doc_date: Mapped[date | None] = mapped_column(Date)
    reservation_id: Mapped[int | None] = mapped_column(
        ForeignKey("number_reservations.id"), unique=True)
    payload: Mapped[dict] = mapped_column(JSON)                      # salinan isian saat dibuat
    template_version_id: Mapped[int | None] = mapped_column(ForeignKey("template_versions.id"))
    docx_path: Mapped[str] = mapped_column(String(400))              # relatif terhadap folder storage
    pdf_path: Mapped[str | None] = mapped_column(String(400))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    cancelled: Mapped[bool] = mapped_column(default=False)
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    user: Mapped[User] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))
    entity: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int | None]
    detail: Mapped[dict | None] = mapped_column(JSON)
    user: Mapped[User | None] = relationship()
