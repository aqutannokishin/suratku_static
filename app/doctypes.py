"""Daftar jenis dokumen.

Untuk menambah jenis dokumen baru:
  1. Tambahkan satu `DocTypeSpec(...)` di REGISTRY di bawah.
  2. Tambahkan nomor seri-nya di `app/seed.py` (SERIES) kalau butuh nomor surat.
  3. Buat template Word-nya, lalu unggah lewat menu Admin > Template.
Formulir di web dibuat otomatis dari daftar field di bawah.

Jenis field (kind):
  text, textarea, date, number, choice, person (satu orang), person_multi (banyak orang)
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Field:
    key: str                    # nama variabel di template Word, contoh: kegiatan
    label: str                  # tulisan di formulir
    kind: str = "text"
    required: bool = True
    choices: tuple = ()         # untuk kind="choice"
    help: str = ""              # petunjuk kecil di bawah isian


@dataclass(frozen=True)
class DocTypeSpec:
    code: str                   # kode unik, dipakai juga sebagai nama folder
    name: str                   # nama yang tampil
    description: str
    series: str | None          # kode seri nomor surat (None = tanpa nomor)
    fields: tuple
    pdf_default: bool = True    # centang "buat PDF" secara default


REGISTRY: dict[str, DocTypeSpec] = {s.code: s for s in [
    DocTypeSpec(
        code="surat_tugas",
        name="Surat Tugas",
        description="Menugaskan satu atau beberapa orang untuk suatu kegiatan.",
        series="ST",
        fields=(
            Field("tanggal", "Tanggal surat", "date"),
            Field("pegawai", "Yang ditugaskan", "person_multi"),
            Field("kegiatan", "Kegiatan", "textarea"),
            Field("tempat", "Tempat pelaksanaan", "text"),
            Field("tgl_mulai", "Tanggal mulai", "date"),
            Field("tgl_selesai", "Tanggal selesai", "date"),
            Field("penandatangan", "Penandatangan", "person"),
        ),
    ),
    DocTypeSpec(
        code="surat_keterangan",
        name="Surat Keterangan",
        description="Menerangkan data dan keperluan satu orang.",
        series="SK",
        fields=(
            Field("tanggal", "Tanggal surat", "date"),
            Field("orang", "Yang diterangkan", "person"),
            Field("keperluan", "Keperluan", "textarea"),
            Field("penandatangan", "Penandatangan", "person"),
        ),
    ),
]}

PERSON_PROPS = (
    ("nama", "nama lengkap"),
    ("nip", "NIP (kosong jika tidak ada)"),
    ("golongan", "golongan, contoh III/a"),
    ("pangkat", "nama pangkat, contoh Penata Muda"),
    ("jabatan", "jabatan"),
    ("role", "peran, contoh PPL / PML / Pegawai"),
)


def variable_help(spec: DocTypeSpec) -> list[tuple[str, str]]:
    """Daftar variabel yang boleh dipakai di template Word untuk jenis dokumen ini."""
    rows: list[tuple[str, str]] = []
    if spec.series:
        rows.append(("{{ nomor }}", "nomor surat yang dipilih/dihitung"))
    for f in spec.fields:
        if f.kind == "person":
            for p, desc in PERSON_PROPS:
                rows.append((f"{{{{ {f.key}.{p} }}}}", f"{f.label}: {desc}"))
        elif f.kind == "person_multi":
            rows.append((f"{{%tr for p in {f.key} %}} ... {{%tr endfor %}}",
                         f"{f.label}: mengulang SATU BARIS TABEL untuk tiap orang (lihat contoh template)"))
            rows.append(("{{ loop.index }}", "nomor urut di dalam perulangan"))
            for p, desc in PERSON_PROPS:
                rows.append((f"{{{{ p.{p} }}}}", f"di dalam perulangan: {desc}"))
            rows.append((f"{{{{ {f.key}|length }}}}", f"{f.label}: jumlah orang"))
        elif f.kind == "date":
            rows.append((f"{{{{ {f.key} }}}}", f"{f.label} (format: 5 Oktober 2026)"))
        else:
            rows.append((f"{{{{ {f.key} }}}}", f.label))
    return rows
