"""Menampilkan alamat yang bisa dibuka dari komputer lain di jaringan kantor."""
import socket
import sys

port = sys.argv[1] if len(sys.argv) > 1 else "8000"


def lan_ips():
    ips = set()
    try:  # trik UDP: tidak mengirim data apa pun, hanya menanyakan rute keluar
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    return sorted(i for i in ips if not i.startswith(("127.", "169.254.")))


print(f"  Di komputer ini      : http://localhost:{port}")
found = lan_ips()
if found:
    for ip in found:
        print(f"  Dari komputer lain   : http://{ip}:{port}")
else:
    print("  (alamat jaringan tidak terdeteksi; jalankan 'ipconfig' dan cari IPv4 Address)")
