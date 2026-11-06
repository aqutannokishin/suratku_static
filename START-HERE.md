# SuratKu: Start Here

A web app that runs on **one PC in your office** (the "server"). Everyone else opens it in their browser at an address like `http://192.168.1.50:8000`. Nothing to install on the other PCs.

Staff pick the document type, **pick or calculate the nomor surat**, **pick names from a list or type new ones** (NIP, golongan, jabatan and peran fill themselves in), and press one button. They get the Word file and (optionally) the PDF.

This guide assumes **no programming knowledge**. Do the steps in order. Every step says what you should see when it worked.

---

## Contents

1. [What you have, and what has / hasn't been tested](#1-what-you-have)
2. [What you need](#2-what-you-need)
3. [Install on the server PC (step by step)](#3-install-on-the-server-pc)
4. [First-time setup inside the app](#4-first-time-setup-inside-the-app)
5. [Make your real Word templates](#5-make-your-real-word-templates)
6. [Daily use](#6-daily-use)
7. [Let the whole office use it](#7-let-the-whole-office-use-it)
8. [Backups, restore, forgotten password](#8-backups-restore-forgotten-password)
9. [Changing things: numbering, new document types](#9-changing-things)
10. [Security notes](#10-security-notes)
11. [Troubleshooting](#11-troubleshooting)
12. [Limitations: read before presenting to your supervisor](#12-limitations)
13. [Project map and developer commands](#13-project-map)

---

## 1. What you have

**Features**
- Login with username and password. Admins and regular staff.
- **Nomor surat** with three ways to choose:
  1. *Otomatis*: the next number, calculated for you.
  2. *Pilih dari nomor tersedia*: numbers that were cancelled, skipped, or taken by you but never used.
  3. *Ketik nomor urut sendiri*: type a sequence number. Skipping ahead needs a confirmation tick.
  - Plus *Ambil nomor saja*: reserve a number now, write the letter later.
  - Two people pressing the button at the same time **cannot** get the same number. The database enforces this.
- **People:** search by name or NIP and the row fills in. Or type a new person: they are saved to the master list automatically. NIP is optional (for mitra). Similar names trigger a warning to avoid duplicates.
- **Golongan:** pick from the list (I/a to IV/e preloaded) or type your own (PPPK, etc.).
- **Jabatan and Peran:** pick from the list or type a new one. It is remembered next time.
- Word (.docx) output, and PDF too if LibreOffice is installed on the server.
- History of every document, who made it, and downloads. Admins can cancel a document (its number becomes reusable).
- Admin area: users, people (with Excel import and duplicate merge), golongan/jabatan lists, numbering patterns, Word templates (with versions), activity log.
- A backup tool (one click, or automatic daily after `install_autostart.bat`) and a restore tool.

**What was actually tested (in my workspace, not in your office)**

| Tested | How |
|---|---|
| Numbering: uniqueness under 12 simultaneous users, reuse of cancelled numbers, year rollover | 53 automated tests, all passing |
| Login, permissions, document creation, cancel, template upload | automated tests through the web layer |
| Real Word to PDF conversion with LibreOffice | automated test, real PDF produced |
| Dropdowns, adding people rows, typing custom values, number picker, phone-width layout | real Chromium browser, 29 checks, all passing, plus I looked at the screenshots |
| Backup, damage the data, restore, verify it came back | automated test |
| Adding a new document type exactly as described in section 9 | followed literally on a copy; worked |

**NOT tested; please check on your side**
- The `.bat` files (`setup.bat`, `run.bat`, ...). I cannot run Windows here. They are short and simple and every one has a manual-command equivalent in this guide, but treat the first run as the test.
- Windows Firewall, Task Scheduler auto-start, and running as a service on your office network.
- **Your real letters.** I made two sample templates (Surat Tugas, Surat Keterangan) with a placeholder letterhead. Your official formats must be put in as templates (section 5).
- PDF layout compared with Microsoft Word. PDFs come from LibreOffice, which can differ slightly in spacing or fonts. Always compare one real PDF with Word's own "Save as PDF" before going live.

---

## 2. What you need

| Item | Details |
|---|---|
| Server PC | Windows 10 or 11, always on during office hours, connected by **cable** if possible. It can be an ordinary office PC. |
| Python 3.10 or newer | Free. Installed in step 3.1. Python 3.12 or 3.13 recommended. |
| LibreOffice | Free. Only for PDF. Without it everything works except PDF. |
| Internet | Only during installation (to download Python packages). **After that the app works with no internet at all.** |
| Rights | Permission to install programs on the server PC (ask IT if needed). |
| Other PCs | Just a web browser (Chrome, Edge, Firefox). |

---

## 3. Install on the server PC

### 3.1 Install Python
1. Open <https://www.python.org/downloads/> and click the big yellow **Download Python 3.x** button.
2. Run the downloaded file.
3. **On the very first screen, tick "Add python.exe to PATH"** (bottom of the window). This is the step people forget.
4. Click **Install Now**, wait, click **Close**.

*Check:* press the Windows key, type `cmd`, press Enter. In the black window type `python --version` and press Enter. You should see something like `Python 3.12.4`. If you see "not recognized", re-run the installer, choose **Modify**, and make sure "Add to PATH" is ticked. (The `py` launcher also works: `py --version`.)

### 3.2 Install LibreOffice (for PDF)
1. Open <https://www.libreoffice.org/download/download-libreoffice/> and download the Windows installer.
2. Run it with the default options (**Typical**).

*Check:* the folder `C:\Program Files\LibreOffice\program` exists and contains `soffice.exe`.

### 3.3 Put the SuratKu folder on the server PC
1. Copy `suratku.zip` to the server PC.
2. Right-click it and choose **Extract All...**.
3. In the box **"Files will be extracted to this folder"**, **delete what's there and type `C:\suratku`**, then click **Extract**.
   - Use a short path with **no spaces**. Do **not** use the Desktop, Documents, or OneDrive (synced folders can lock the database file).
4. Open `C:\suratku`. You should see files like `setup.bat`, `run.bat`, `START-HERE.md` directly inside it (not another `suratku` folder inside), and a folder named `app`.

### 3.4 Run the one-time setup
1. Double-click **`setup.bat`**. A black window opens.
2. It does four things and prints `[1/4]` to `[4/4]`:
   - finds Python,
   - creates a private Python environment in a hidden folder `.venv`,
   - downloads the needed libraries (**needs internet; takes 1 to 3 minutes; lots of text scrolls by, which is normal**),
   - checks for LibreOffice.
3. At the end it says **SELESAI** ("done"). Press any key to close.

*If it says GAGAL ("failed"):* read the message. The two usual causes are Python not installed or not on PATH (go back to 3.1), or no internet / a proxy blocking `pip` (try again on a normal connection, or ask IT to allow `pypi.org` and `files.pythonhosted.org`).

*Manual equivalent*, if the `.bat` misbehaves. Open `cmd`, then:
```
cd C:\suratku
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

### 3.5 Start the app
1. Double-click **`run.bat`**.
2. A window opens and shows something like:
   ```
   SuratKu sedang berjalan - JANGAN TUTUP JENDELA INI
   Alamat untuk dibuka di browser:
     Di komputer ini      : http://localhost:8000
     Dari komputer lain   : http://192.168.1.50:8000
   ```
3. **Windows Firewall may pop up** asking whether to allow Python. Tick **Private networks** and click **Allow access**. (Without this, other PCs cannot connect.)
4. **Leave this window open.** Closing it stops the app. (Section 7 makes it start by itself, so nobody has to remember.)

*Manual equivalent:*
```
cd C:\suratku
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

### 3.6 Create the first admin
1. On the server PC, open Chrome or Edge and go to **`http://localhost:8000`**.
2. You land on **"Buat admin pertama"** (this appears only once, while there are no users).
3. Fill in your full name, a username (lowercase, e.g. `budi`), a password of at least 8 characters, and repeat it. Click **"Buat admin & masuk"**.
4. You arrive at the home page with the tiles **Surat Tugas** and **Surat Keterangan**. **The app is running.**

*Quick test:* click **Surat Tugas**, type a name in "Nama", fill the other boxes, click **"Buat dokumen"**. You should get a page with a number like `001/ST/X/2026` and an **"Unduh Word"** button. (That first test number is real and consumed. You can cancel the test document later from **Riwayat**, as admin.)

---

## 4. First-time setup inside the app

Do these as admin, in this order. All are under the **Admin** menu at the top.

### 4.1 Load your people (Admin > Data orang > "Impor dari Excel")
1. Click **"Impor dari Excel"**, then **template-data-orang.xlsx** to download the template.
2. Open it in Excel. Columns: **Nama, NIP, Golongan, Jabatan, Role**. Delete the two example rows. Paste in your staff. Leave NIP empty for mitra.
   - Golongan like `III/b`. Role like `Pegawai`, `PPL`, `PML`, `Mitra`.
   - NIP is 18 digits. Spaces and dashes are removed for you.
3. Save as **.xlsx**. Click **Choose file**, then **Impor**.
4. You get a summary: how many added, updated, skipped, and any problem rows with the reason. Fix those rows in Excel and upload again; rows that already succeeded are **not duplicated**.

If you skip this, nothing breaks: people are added one by one as staff type them into forms.

### 4.2 Check golongan and jabatan (Admin > Golongan & jabatan)
Golongan I/a to IV/e are preloaded. Add others (e.g. `PPPK`) here, or just type them into a form later. You can fix spelling of jabatan here.

### 4.3 Set your numbering (Admin > Seri nomor)
Each document type has a *series* with a **pattern** and a **reset rule**. Edit the pattern to match your office's real numbers. Building blocks:

| Write | Produces |
|---|---|
| `{seq:03d}` | running number with 3 digits: `007` |
| `{seq}` | running number with no leading zeros: `7` |
| `{kode}` | the series code, e.g. `ST` |
| `{romawi}` | month in roman numerals: `X` |
| `{bulan}` | month as a number: `10` |
| `{tahun}` | year: `2026` |

Everything else is typed literally. Examples:

| You type | Result |
|---|---|
| `{seq:03d}/{kode}/{romawi}/{tahun}` | `045/ST/X/2026` |
| `B-{seq:03d}/KPA/{bulan}/{tahun}` | `B-045/KPA/10/2026` |
| `{seq}/BPS/{romawi}/{tahun}` | `45/BPS/X/2026` |

The page shows a live example ("Contoh hasil sekarang") once saved. **Reset rule:** every year, every month, or never. Changing a pattern affects **new** numbers only. Existing numbers never change.

The number's year and month come from the **"Tanggal surat"** on the form, not from today's date. A letter dated in January gets a January number.

### 4.4 Add the real Word templates (Admin > Template Word)
Read section 5 first, then upload your templates here.

### 4.5 Add staff (Admin > Pengguna)
Fill the form: full name, username, starting password (min. 8), tick **"Jadikan admin"** only for admins. Staff can change their own password by clicking their name at the top right. Users are never deleted, only deactivated (untick **Aktif**), so the history stays accurate.

---

## 5. Make your real Word templates

This is the most important part to get right. A template is an ordinary Word file where you type placeholders in double curly braces `{{ like_this }}`. SuratKu replaces them with the data.

### 5.1 The fastest way
1. **Admin > Template Word**, under *Surat Tugas*, click **Unduh** on the active version. Open it in Word. This is a working example.
2. Copy your office's real letter into a new Word file, or edit the example, and replace the data with placeholders.
3. Save as **.docx** (not .doc).
4. Upload it under the matching document type, click **"Unggah versi baru"**.
5. If something is wrong, the upload is **rejected with the exact reason**. Nothing breaks and the old template stays active.

### 5.2 Which placeholders exist
Click **"Daftar variabel yang boleh dipakai"** under each document type. For *Surat Tugas*:

| Type this in Word | What appears |
|---|---|
| `{{ nomor }}` | the nomor surat |
| `{{ tanggal }}` | letter date, written like `6 Oktober 2026` |
| `{{ kegiatan }}`, `{{ tempat }}` | the typed text. Line breaks are kept. |
| `{{ tgl_mulai }}`, `{{ tgl_selesai }}` | dates, written like `12 Oktober 2026` |
| `{{ penandatangan.nama }}` | the signer's name |
| `{{ penandatangan.nip }}` | NIP |
| `{{ penandatangan.golongan }}` | golongan, e.g. `IV/a` |
| `{{ penandatangan.pangkat }}` | rank name, e.g. `Pembina` (looked up from golongan) |
| `{{ penandatangan.jabatan }}` | jabatan |
| `{{ penandatangan.role }}` | peran |
| `{{ pegawai\|length }}` | how many people were picked |

Placeholders are spelled exactly as on that list. A misspelling is caught when you upload.

### 5.3 A table with one row per person (the usual case)
For "Yang ditugaskan" (several people) build a Word table with **three rows** like this:

| | | |
|---|---|---|
| `{%tr for p in pegawai %}` | | ← **marker row** (start). Disappears in the output. |
| `{{ loop.index }}` | `{{ p.nama }}` | `{{ p.nip }}` · `{{ p.golongan }}` · `{{ p.jabatan }}` ← **the real row**, repeated once per person |
| `{%tr endfor %}` | | ← **marker row** (end). Disappears in the output. |

Rules: the two marker tags each sit **alone in the first cell of their own row**. Inside the repeating row, use `p.` (`p.nama`, `p.nip`, `p.golongan`, `p.pangkat`, `p.jabatan`, `p.role`) and `{{ loop.index }}` for 1, 2, 3. The downloaded sample template shows exactly this.

For a **numbered list instead of a table**, put `{%p for p in pegawai %}` alone in one paragraph, your line in the next (`{{ loop.index }}. {{ p.nama }}`), and `{%p endfor %}` alone in the paragraph after.

### 5.4 Handy extras (all tested)
- **Only show NIP if there is one** (mitra have none): `{% if p.nip %}NIP. {{ p.nip }}{% else %}-{% endif %}`
- **UPPERCASE**: `{{ penandatangan.nama|upper }}`
- **Singular/plural**: `{% if pegawai|length > 1 %}Para pegawai tersebut{% else %}Pegawai tersebut{% endif %}`
- **Placeholders in the header or footer** (for example a nomor in the header) work too.
- **Logos, letterhead images, borders, fonts and page setup** are kept exactly as they are in your file.

### 5.5 Things that go wrong in Word
- **Type each placeholder in one go.** Don't stop in the middle, change bold or italic halfway through, or fix a typo inside it. If a placeholder misbehaves, delete it and retype it in one piece.
- **Safest trick:** type the placeholder in Notepad, copy it, and in Word use *Paste > Keep Text Only*.
- Use plain straight characters `{ }` and `%`. Don't let Word turn anything into a fancy symbol.
- A placeholder that is **not** on the list (a typo) causes the message *"Variabel tidak dikenal"* and shows the wrong name. A template with no `{{ nomor }}` is rejected for numbered document types.
- **Upload a test first**: create a document, open the Word file, and compare it to your real letter.

### 5.6 Versions
Every upload becomes a new version. The newest is active. You can **Aktifkan** (re-activate) an older version any time. Each created document remembers which version produced it.

---

## 6. Daily use

1. Log in. Click the document type on the home page.
2. **Nomor surat box** (top):
   - Leave on **Otomatis** and the next number is used.
   - **Pilih dari nomor tersedia**: choose a skipped, cancelled, or earlier-reserved number.
   - **Ketik nomor urut sendiri**: type e.g. `45`. If it skips ahead, a warning shows ("melompati nomor 12–44") and you must tick the confirmation.
   - **Ambil nomor saja**: reserves the number without making a letter. Later choose it via *Pilih dari nomor tersedia*.
3. **Isi dokumen**:
   - *Tanggal surat* decides the number's year and month.
   - For each person, click the top search box, type part of a **name or NIP**, click the match, and Nama, NIP, Golongan, Jabatan and Peran fill in. Everything stays editable.
   - **New person?** Skip the search. Just type the name (and anything else). They are saved to the master list automatically.
   - **Golongan / Jabatan / Peran:** open the box and click an item, or **type your own and press Enter**. It is added to the list for next time.
   - **"+ Tambah orang"** adds another row. **"Hapus"** removes a row.
   - Untick/tick **"Simpan perubahan NIP / golongan / jabatan ... ke data master"**: unticked (default) means your edits only affect *this* document. Ticked means the master list is updated too (use for promotions).
4. **Hasil**: keep **"Buat juga file PDF"** ticked if you want PDF (adds ~3 to 10 seconds). Click **"Buat dokumen"**. Don't close the page while it says "Membuat…".
5. The result page shows the nomor, **"Salin nomor"**, and the download buttons.
6. If something is wrong the form comes back **with your typing kept** and a red list of what to fix. A rejected form never consumes a number.

**Menu "Riwayat":** all documents with search by nomor or name, and download links. **Admins** can **Batalkan** (cancel) a document: its number is marked *batal* and can be reused if your policy allows (`ALLOW_REUSE_VOID`).

**Menu "Nomor Surat":** every number of a series for a year: used, reserved-but-unused, or cancelled, and by whom. Admins can cancel a reserved number.

---

## 7. Let the whole office use it

### 7.1 Test from another PC
On any other PC on the same network, open a browser and type the **"Dari komputer lain"** address shown in the `run.bat` window, e.g. `http://192.168.1.50:8000`. You should see the login page.

If it doesn't load:
1. Is `run.bat` still running on the server? Is the server PC on and awake?
2. Both PCs on the same office network (not guest Wi-Fi vs. wired VLAN)?
3. Firewall: on the server, open **Windows Security > Firewall & network protection > Allow an app through firewall**, and allow Python on **Private**. Or run `install_autostart.bat` (7.3), which opens port 8000.
4. If the office network is classed as **Public** in Windows, the Private rule doesn't apply. Ask IT, or switch the network profile to Private.

### 7.2 Give it a stable address
The server PC's IP can change after a restart, which would break everyone's bookmark. Ask IT either to:
- **reserve a fixed IP** for this PC (best: a "DHCP reservation" on the router), and optionally
- create a **friendly name** such as `http://suratku` or `http://suratku.kantor:8000`.

Without IT: set the fixed IP yourself on the server PC (Settings > Network > Properties > IP assignment), and tell everyone to bookmark the address.

### 7.3 Start by itself when the PC turns on (recommended)
So nobody has to double-click `run.bat` after a power cut or Windows update:
1. In `C:\suratku`, **right-click `install_autostart.bat` > Run as administrator**.
2. It creates two Windows scheduled tasks and opens port 8000:
   - **SuratKu**: starts the app at every boot (no login needed), logging to `data\server.log`.
   - **SuratKu Backup**: backs up every day at 18:00.
3. Wait 10 seconds, then open `http://localhost:8000`.

To undo it: right-click `remove_autostart.bat` > Run as administrator.

*Caveat:* the scheduled task runs as the SYSTEM account. If PDFs fail only in this mode, stop the task (`remove_autostart.bat`) and keep using `run.bat` under a normal logged-in user instead. Then ask IT to configure the PC to auto-login.

### 7.4 Keep the server PC healthy
- Disable sleep: **Settings > System > Power > Screen and sleep > Never** (when plugged in).
- Windows Update will restart it sometimes. With auto-start (7.3) the app returns by itself. Set "active hours" to avoid restarts during the working day.
- A cheap UPS is worth it. SQLite survives power cuts well, but nothing beats a clean shutdown.

---

## 8. Backups, restore, forgotten password

### 8.1 Back up
- **Double-click `backup.bat`** (safe while the app runs). It creates `backup\suratku_DATE_TIME.zip` containing the database, your templates and all generated documents. It keeps the 30 newest.
- With `install_autostart.bat` this happens daily at 18:00.
- **Copy the `backup` folder to somewhere else** regularly (another PC, a NAS, a USB drive). A backup on the same disk doesn't help if the disk dies.

### 8.2 Restore
1. **Stop the app** (close the `run.bat` window, or run `remove_autostart.bat` and restart the PC).
2. Open `cmd` and run (using your real file name):
   ```
   cd C:\suratku
   .venv\Scripts\python.exe scripts\restore.py backup\suratku_20261006_180000.zip
   ```
3. It first saves the current state to `backup\sebelum_restore_...` (in case you restored the wrong file), then restores. Start the app again.

**Do one test restore before real use.** That is the only way to know your backups work.

### 8.3 Forgot the admin password
On the server PC, double-click **`reset_password.bat`**, type the username, then type a new password twice. (Or: `.venv\Scripts\python.exe scripts\reset_password.py username`.) This also re-activates the account if it was disabled.

Other staff: any admin can set a new password in **Admin > Pengguna**.

---

## 9. Changing things

First stop the app, edit, then start it again.

### 9.1 App name, office name, other settings: file `.env`
Open `C:\suratku\.env` in Notepad:
```
APP_NAME=SuratKu
ORG_NAME=BPS Kabupaten Contoh
SOFFICE_PATH=
ALLOW_REUSE_VOID=true
SESSION_HOURS=10
```
- `ALLOW_REUSE_VOID=false` means cancelled numbers can **never** be reused. Ask your admin staff which your office wants.
- `SOFFICE_PATH`: only needed if LibreOffice is in an unusual place.

### 9.2 Change the port (default 8000)
Replace `8000` with the new number in: `run.bat` (two places: the `show_address.py 8000` line and `--port 8000`), `run_service.bat` (`--port 8000`), and `install_autostart.bat` (`localport=8000`). Then re-run `install_autostart.bat` (as administrator) so the firewall rule matches, and tell everyone the new address.

### 9.3 Add a new document type (tested)
Example: *Surat Undangan*.

**Step 1.** Open `app\doctypes.py` in Notepad (or VS Code). Find the last entry, ending with `),` followed by `]}` on its own line. Insert this **before** the `]}` line:
```python
    DocTypeSpec(
        code="surat_undangan",
        name="Surat Undangan",
        description="Mengundang peserta ke suatu acara.",
        series="UND",
        fields=(
            Field("tanggal", "Tanggal surat", "date"),
            Field("perihal", "Perihal", "text"),
            Field("acara", "Nama acara", "text"),
            Field("tgl_acara", "Tanggal acara", "date"),
            Field("tempat", "Tempat", "text"),
            Field("undangan", "Yang diundang", "person_multi"),
            Field("penandatangan", "Penandatangan", "person"),
        ),
    ),
```
Field kinds: `text`, `textarea` (multi-line), `date`, `number`, `choice` (add `choices=("A", "B")`), `person` (one person), `person_multi` (several people). Add `required=False` to make an input optional. The first date field named exactly `tanggal` decides the number's year and month. Use `series=None` for a document without a nomor.

**Step 2.** Open `app\seed.py`. In the `SERIES = [ ... ]` list add:
```python
    ("UND", "Surat Undangan", "{seq:03d}/{kode}/{romawi}/{tahun}", "yearly"),
```
(Skip this if the new type has `series=None`, or shares an existing series, e.g. `series="ST"`.)

**Step 3.** Start the app. A new tile appears on the home page.

**Step 4.** Build the Word template (section 5) using the variable names you chose (`{{ perihal }}`, `{{ acara }}`, `{%p for u in undangan %}`...), and upload it under **Admin > Template Word > Surat Undangan**. Until a template is uploaded, creating that document says *"Template Word untuk jenis dokumen ini belum ada"*.

### 9.4 Updating the app later
Replace the contents of `app\` and the `.bat`/`scripts\` files with the new version. **Never delete**: `data\`, `storage\`, `doctemplates\`, `backup\`, `.env`. Take a backup first.

---

## 10. Security notes

- The address is **only reachable on your office network**. Do **not** forward port 8000 on the router or expose it to the internet. For access from home, use your office VPN.
- It uses plain **HTTP**. Passwords cross the office network unencrypted, like most small internal tools. Acceptable for many offices, but tell IT. HTTPS would need an internal certificate in front of the app.
- Passwords are stored hashed (argon2). After 5 wrong attempts for a username, login is blocked for 10 minutes. Forms are checked against cross-site posting. Generated files can only be downloaded after login, never via a public folder.
- **Everyone who is logged in can see and download every document** in Riwayat. If you need per-person or per-unit visibility, that is a change to make.
- **NIP is personal data.** Limit who is admin, keep the server PC in a safe place, don't copy `backup` folders to personal drives or messaging apps, and follow your office's data policy.
- The activity log (Admin > Log aktivitas) records logins, numbers, documents, cancels and admin changes.

---

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `setup.bat`: "Python belum terpasang" | Python not installed, or "Add to PATH" was not ticked. Redo 3.1. |
| `pip` errors, "could not find a version" | No internet / proxy. Retry on a normal connection; ask IT to allow `pypi.org`. |
| `run.bat` closes at once | Open `cmd`, `cd C:\suratku`, run the manual command from 3.5 and read the error. |
| "address already in use" / port 8000 busy | Another copy is running (check Task Manager > python.exe), or another program uses 8000. Change the port (9.2). |
| Works on the server, other PCs can't connect | Firewall (7.1), different network, or `run.bat` isn't running. Check each in that order. |
| Page says login again and again | Browser blocks cookies for that address, or the server was restarted with a new `data` folder. Clear cookies for the site. |
| "Buat juga file PDF" is greyed out, with a note that LibreOffice was not found | LibreOffice not found. Install it (3.2) or set `SOFFICE_PATH` in `.env`, then restart. |
| "Konversi PDF gagal" | LibreOffice crashed or is slow. Try again; make sure no LibreOffice window is stuck open on the server. Word file is still produced. |
| PDF looks different from Word | LibreOffice vs Word differences. Install the same fonts used by the template on the server PC (e.g. Bookman Old Style, Arial Narrow). |
| Upload says "Variabel tidak dikenal: x" | A placeholder is misspelled, or was typed in several pieces. See 5.5. |
| Upload says "Template gagal diisi saat uji coba" | A syntax error in a `{% %}` tag (missing `endfor`, etc.). Compare with the downloaded sample. |
| Number not what I expected | Check the date: the number follows the **Tanggal surat**'s year/month. Check the series pattern and reset rule (4.3). |
| "Nomor ... sudah dipakai" | That number belongs to another document. Use *Otomatis* or another from the list. |
| Name is flagged "mirip dengan ..." | A similar person exists. If it's the same person, use the search box to pick them instead of typing again. |
| The message shows "database is locked" | Very rare. Wait a few seconds and retry; make sure the project isn't inside OneDrive/Dropbox. |
| Everything is gone after moving the folder | Only `data\`, `storage\`, `doctemplates\` hold your data. Copy all three together. |

Server log: `data\server.log` (when started by the scheduled task). When started by `run.bat`, the log is the black window itself.

---

## 12. Limitations

State these plainly to your supervisor:

1. **One document per submit.** SuratKu is built for the form-driven workflow you described. It does **not** do SIOMAY-style mass generation (hundreds of documents from one Excel). Excel import exists only for loading the **people list**. Mass generation can be added later (some design notes are in `docs\ORIGINAL-DESIGN-NOTES.md`; that early draft differs from what was built in details such as: no htmx, no Alembic).
2. **No Google Drive photo evidence** (BAPP/BAST evidence grids). Not built.
3. **Only two sample document types**, with placeholder letterheads. Your real formats need templates (section 5), and any document with different fields needs the small edit in 9.3. I haven't seen your real letters.
4. **PDF fidelity** depends on LibreOffice (see section 1).
5. **No automatic database upgrades.** If a future version of the code adds a new column to an existing table, the old database won't change by itself. A small migration script would be supplied with that update. Always take a backup before updating.
6. **Single server, SQLite.** Comfortable for a small or medium office (dozens of users). If the server PC is off, nobody can work.
7. **HTTP only**, and everyone sees all documents (section 10).
8. The `.bat` launchers and Windows scheduling are untested on a real Windows machine (section 1).

---

## 13. Project map

```
suratku/
  START-HERE.md          this guide
  setup.bat / run.bat    install once / start the app
  run_service.bat        used by auto-start
  install_autostart.bat  start at boot + daily backup + firewall (run as admin)
  remove_autostart.bat   undo the above
  backup.bat / reset_password.bat
  requirements.txt       exact tested library versions
  .env.example           settings template  ->  .env
  app/
    main.py              app entry point
    doctypes.py          document types and their form fields   <- edit to add types
    seed.py              initial lists and number series         <- edit to add series
    models.py            database tables
    services/            numbering, people, rendering, PDF, generate pipeline
    routers/             pages, API for the dropdowns, admin
    templates/           HTML pages
    static/              CSS, JavaScript, Tom Select (bundled, works offline)
    seed_templates/      sample Word templates
  scripts/               backup, restore, reset password, show address
  docs/                  early design notes (reference only)
  tests/                 53 automated tests
  data/  storage/  doctemplates/  backup/    <- YOUR DATA (created on first run)
```

**Run the tests** (optional, for a developer):
```
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m pytest
```
Expected: `53 passed`. PDF tests are skipped automatically if LibreOffice is missing.

**Third-party:** the dropdown widget Tom Select (Apache-2.0) is bundled; its licence is `app\static\LICENSE-tom-select.txt`.
