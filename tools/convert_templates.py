"""Ubah dua docx asli menjadi template docxtemplater ({tag}). Jalankan: python3 -I convert.py <in_dir> <out_dir>
CATATAN: bast() di bawah menghasilkan BAST versi LAMA (khusus pemetaan). Untuk BAST umum, lanjutkan dengan:
  python3 -I tools/generalize_bast.py <out_dir>/bast.docx <out_dir>/bast.docx
"""
import sys, zipfile, re
from lxml import etree
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML='http://www.w3.org/XML/1998/namespace'
q=lambda t:'{%s}%s'%(W,t)

def runs(p): return p.findall(q('r'))
def rtext(r): return ''.join(t.text or '' for t in r.findall(q('t')))
def unred(r):
    pr=r.find(q('rPr'))
    if pr is None: return
    for c in pr.findall(q('color')):
        if (c.get(q('val')) or '').upper() in ('FF0000','C00000','E36C0A'): pr.remove(c)
    for h in pr.findall(q('highlight')): pr.remove(h)
def setrun(p,i,new,expect=None):
    r=runs(p)[i]; old=rtext(r)
    if expect is not None: assert expect in old, (i,expect,old)
    ts=r.findall(q('t'))
    if not ts:
        t=etree.SubElement(r,q('t')); ts=[t]
    ts[0].text=new; ts[0].set('{%s}space'%XML,'preserve')
    for t in ts[1:]: r.remove(t)
    unred(r)
def find(p,sub):
    for i,r in enumerate(runs(p)):
        if sub in rtext(r): return i
    raise AssertionError(sub)
def after_tab(p,i,new,expect=None):
    r=runs(p)[i]
    if expect is not None: assert expect in rtext(r),(expect,rtext(r))
    t=etree.SubElement(r,q('t')); t.text=new; t.set('{%s}space'%XML,'preserve')
    unred(r)

def process(src,dst,edits,strip_comments):
    zin=zipfile.ZipFile(src)
    doc=etree.fromstring(zin.read('word/document.xml'))
    ps=list(doc.iter(q('p')))
    edits(ps)
    if strip_comments:
        for tag in ('commentRangeStart','commentRangeEnd'):
            for e in list(doc.iter(q(tag))): e.getparent().remove(e)
        for r in list(doc.iter(q('r'))):
            if r.find(q('commentReference')) is not None: r.getparent().remove(r)
    drop=set()
    if strip_comments:
        drop={n for n in zin.namelist() if re.match(r'word/(comments\w*|people)\.xml$',n)}
    out=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
    for n in zin.namelist():
        if n in drop: continue
        data=zin.read(n)
        if n=='word/document.xml':
            data=etree.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True)
        elif n=='[Content_Types].xml' and drop:
            s=data.decode('utf8')
            for d in drop: s=re.sub(r'<Override[^>]*PartName="/%s"[^>]*/>'%re.escape(d),'',s)
            data=s.encode('utf8')
        elif n=='word/_rels/document.xml.rels' and drop:
            s=data.decode('utf8')
            for d in drop: s=re.sub(r'<Relationship [^>]*Target="%s"[^>]*/>'%re.escape(d[5:]),'',s)
            data=s.encode('utf8')
        elif n=='docProps/core.xml':
            s=data.decode('utf8')
            s=re.sub(r'(<dc:creator>)[^<]*',r'\1',s); s=re.sub(r'(<cp:lastModifiedBy>)[^<]*',r'\1',s)
            data=s.encode('utf8')
        out.writestr(n,data)
    out.close()

def bast(p):
    setrun(p[6],1,': {nomor}','BAST')
    for i in range(2,7): setrun(p[6],i,'')
    setrun(p[8],1,' {hari}, tanggal {tgl_kata}, bulan {bulan}, ','tanggal')
    setrun(p[8],2,'tahun {tahun_kata}, bertempat di {tempat}, kami yang bertanda tangan di bawah ini:','tahun dua ribu')
    setrun(p[9],2,':  {ppk_nama}','....')
    setrun(p[10],2,':  {ppk_nip}','....')
    setrun(p[11],3,'{ppk_jabatan}','....')
    setrun(p[12],3,':  BPS {wilayah} ','BPS Kabupaten')
    setrun(p[13],6,'{ppk_alamat}','....'); setrun(p[13],7,'')
    setrun(p[14],1,'ertindak untuk dan atas nama BPS {wilayah}, selanjutnya disebut sebagai ','BPS Kabupaten')
    after_tab(p[15],2,'{pihak2_nama}',': ')
    after_tab(p[16],1,'{pihak2_nik}',': ')
    setrun(p[17],1,': ',':'); setrun(p[17],2,'{pihak2_alamat}')
    setrun(p[21],5,'Penetapan Kerangka Geospasial dan Muatan Wilkerstat pada Badan Pusat Statistik {wilayah} ','Kabupaten/Kota')
    setrun(p[21],7,'Nomor: {spk_nomor}.','Nomor')
    setrun(p[23],find(p[23],'......'),' {jumlah_sls} ','......')
    setrun(p[30],0,'({pihak2_nama})','....')
    setrun(p[34],0,'({ppk_nama})','....')
    setrun(p[41],0,'PADA BADAN PUSAT STATISTIK {wilayah_upper}','PROVINSI')
    setrun(p[42],0,'NOMOR: {nomor}','NOMOR')
    setrun(p[58],0,'{uraian1}','Mengolah'); setrun(p[58],1,'','to be changed')
    import copy
    src=runs(p[60])[0].find(q('rPr')); dst=runs(p[59])[0]
    old=dst.find(q('rPr'))
    if old is not None: dst.remove(old)
    if src is not None: dst.insert(0,copy.deepcopy(src))
    setrun(p[59],0,'{rentang}'); 
    for i in range(1,5): setrun(p[59],i,'')
    setrun(p[60],0,'{jumlah_sls}','…')
    setrun(p[62],0,'{uraian2}','Melakukan'); setrun(p[62],1,'','to be changed')
    setrun(p[66],0,'{uraian3}','Melaksanakan'); setrun(p[66],1,''); setrun(p[66],2,'','to be changed')

def surtug(p):
    setrun(p[7],5,'{nomor}','B-070'); setrun(p[7],7,'','to be changed')
    setrun(p[13],3,'{menimbang}','Untuk kelancaran'); setrun(p[13],7,'','to be changed')
    setrun(p[29],3,'{kepada}','Suwarna'); setrun(p[29],5,'','to be changed')
    setrun(p[32],3,'{untuk}','Melakukan'); setrun(p[32],13,'{rentang}','Januari'); setrun(p[32],16,'','to be changed')
    setrun(p[35],0,'{kota}, ','Kurun'); setrun(p[35],4,'{tanggal_surat}','2025'); setrun(p[35],6,'','to be changed')
    setrun(p[43],0,'{kepala_nama}','Mulya'); setrun(p[51],0,'{kepala_nama}','Mulya')
    setrun(p[52],0,'NIP. {kepala_nip}','NIP'); setrun(p[52],1,'')

a,b=sys.argv[1],sys.argv[2]
process(a+'/4901fda9-BAST_to_feed_AI.docx',b+'/bast.docx',bast,True)
process(a+'/9d2f0746-Format_Surat_Tugas_2025_to_feed_AI.docx',b+'/surat_tugas.docx',surtug,False)
print('ok')
