"""Generate the small, dependency-free Bruma app icon used by desktop bundles."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / "icons"
ROOT.mkdir(exist_ok=True)

def png(size):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px = (x + .5) / size * 2 - 1
            py = (y + .5) / size * 2 - 1
            corner = math.hypot(max(abs(px) - .55, 0), max(abs(py) - .55, 0))
            alpha = max(0, min(1, (.43 - corner) * size))
            base = 234 + 11 * (1 - (py + 1) / 2)
            rgb = [base + 1, base, base - 3]
            radius = math.hypot(px, py)
            if radius < .59:
                z = math.sqrt(max(0, 1 - (radius / .59) ** 2))
                light = max(0, (-px * .38 - py * .48 + z * .64))
                highlight = math.exp(-((px + .20) ** 2 + (py + .24) ** 2) / .022)
                edge = (1 - z) ** 3
                rgb = [170 + 63 * light + 32 * highlight + 17 * edge,
                       104 + 93 * light + 58 * highlight + 42 * edge,
                       79 + 103 * light + 70 * highlight + 53 * edge]
            rows.extend([*(max(0, min(255, round(c))) for c in rgb), round(alpha * 255)])
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")

images = {size: png(size) for size in (32, 128, 256, 512)}
(ROOT / "icon.png").write_bytes(images[128])
(ROOT / "32x32.png").write_bytes(images[32])
(ROOT / "128x128.png").write_bytes(images[128])
image = images[256]
(ROOT / "icon.ico").write_bytes(struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(image), 22) + image)
chunks = b"".join(kind + struct.pack(">I", len(images[size]) + 8) + images[size] for kind, size in ((b"ic07", 128), (b"ic08", 256), (b"ic09", 512)))
(ROOT / "icon.icns").write_bytes(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)
print("Generated PNG, ICO and ICNS icon files.")
