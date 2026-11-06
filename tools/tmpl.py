"""Pembantu mengubah .docx asli menjadi template docxtemplater tanpa merusak huruf tebal/miring/ukuran.
Teks sebuah paragraf sering terpecah jadi banyak "run"; sub() mencari teks lintas run, menaruh pengganti di run tempat teks
lama dimulai, dan membuang sisanya dari run berikutnya (format run lain tidak berubah).
Pemakaian: lihat tools/make_templates.py"""
import zipfile, re, io
from lxml import etree
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML = 'http://www.w3.org/XML/1998/namespace'
q = lambda t: '{%s}%s' % (W, t)

def own_p(t):
    a = t.getparent()
    while a is not None and a.tag != q('p'): a = a.getparent()
    return a
def ptexts(p):
    return [t for t in p.iter(q('t')) if own_p(t) is p]
def ptext(p): return ''.join(t.text or '' for t in ptexts(p))
def paragraphs(root): return list(root.iter(q('p')))

def _clean_run(t):
    r = t.getparent()
    pr = r.find(q('rPr')) if r is not None else None
    if pr is None: return
    for h in pr.findall(q('highlight')): pr.remove(h)
    for c in pr.findall(q('color')):
        if (c.get(q('val')) or '').upper() in ('FF0000', 'C00000', 'E36C0A', 'FFFF00'): pr.remove(c)
    for s in pr.findall(q('shd')): pr.remove(s)

def sub(root, old, new, count=None, whole=False):
    """Ganti `old` dengan `new` di paragraf mana pun yang memuatnya. whole=True: hanya bila seluruh teks paragraf == old.
    Mengembalikan jumlah penggantian; gagal (0) dianggap kesalahan oleh pemanggil lewat need()."""
    n = 0
    for p in paragraphs(root):
        while True:
            ts = ptexts(p); full = ''.join(t.text or '' for t in ts)
            if whole and full.strip() != old.strip(): break
            i = full.find(old)
            if i < 0: break
            j = i + len(old); pos = 0; placed = False
            for t in ts:
                s = t.text or ''; a, b = pos, pos + len(s); pos = b
                if b <= i or a >= j:
                    if a >= j: break
                    continue
                lo, hi = max(i, a) - a, min(j, b) - a
                s2 = s[:lo] + (new if not placed else '') + s[hi:]
                placed = True
                t.text = s2; t.set('{%s}space' % XML, 'preserve'); _clean_run(t)
            n += 1
            if whole or (count and n >= count): break
            if new and old in new: break
        if count and n >= count: break
    return n

class Doc:
    """Satu .docx: isi utama + semua header/footer. sub()/need() berlaku di semua bagian itu."""
    def __init__(self, path):
        self.z = zipfile.ZipFile(path); self.parts = {}
        for n in self.z.namelist():
            if re.match(r'word/(document|header\d*|footer\d*)\.xml$', n):
                self.parts[n] = etree.fromstring(self.z.read(n))
        self.doc = self.parts['word/document.xml']
    def roots(self): return list(self.parts.values())
    def sub(self, old, new, count=None, whole=False):
        n = 0
        for r in self.roots(): n += sub(r, old, new, count, whole)
        return n
    def need(self, old, new, count=None, whole=False):
        n = self.sub(old, new, count, whole)
        assert n >= 1, 'tidak ditemukan: %r' % old
        return n
    def append(self, containing, text):
        """tambahkan teks di ujung paragraf yang memuat `containing` (tab/tata letak lain tidak berubah)"""
        n = 0
        for r in self.roots():
            for p in paragraphs(r):
                if containing in ptext(p):
                    ts = ptexts(p); ts[-1].text = (ts[-1].text or '') + text; ts[-1].set('{%s}space' % XML, 'preserve'); n += 1
        assert n, 'tidak ditemukan: %r' % containing
        return n
    def left(self, token):
        """sisa tanda yang bukan tag docxtemplater yang sah: kurung kurawal tak berpasangan atau tag dengan spasi/garis miring"""
        bad = []
        for r in self.roots():
            for p in paragraphs(r):
                t = ptext(p)
                bad += [m for m in re.findall(r'\{[^}]*\}?', t) if not re.fullmatch(r'\{[#/^]?[A-Za-z_][A-Za-z0-9_]*\}', m)]
        return bad
    def save(self, dst, drop_fonts=False):
        zin = self.z
        out = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
        for n in zin.namelist():
            if drop_fonts and n.startswith('word/fonts/'): continue
            data = zin.read(n)
            if n in self.parts:
                data = etree.tostring(self.parts[n], xml_declaration=True, encoding='UTF-8', standalone=True)
            elif drop_fonts and n == 'word/fontTable.xml':
                data = re.sub(rb'<w:embed(Regular|Bold|Italic|BoldItalic)\b[^>]*/>', b'', data)
            elif drop_fonts and n == 'word/_rels/fontTable.xml.rels':
                data = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
            elif drop_fonts and n == 'word/settings.xml':
                data = re.sub(rb'<w:embedTrueTypeFonts[^>]*/>', b'', data); data = re.sub(rb'<w:saveSubsetFonts[^>]*/>', b'', data)
            elif drop_fonts and n == '[Content_Types].xml':
                data = re.sub(rb'<Default Extension="odttf"[^>]*/>', b'', data)
            elif n == 'docProps/core.xml':
                t = data.decode('utf8'); t = re.sub(r'(<dc:creator>)[^<]*', r'\1', t); t = re.sub(r'(<cp:lastModifiedBy>)[^<]*', r'\1', t); data = t.encode('utf8')
            out.writestr(n, data)
        out.close()
