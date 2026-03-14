import json
import struct
import zlib
from pathlib import Path

out = Path(__file__).resolve().parents[1] / "public"
out.mkdir(exist_ok=True)


def rgba_for_size(size: int):
    bg = (15, 23, 42, 255)
    cyan = (56, 189, 248, 255)
    white = (255, 255, 255, 245)
    cx = cy = (size - 1) / 2
    outer = size * 0.36
    inner = size * 0.20
    data = []

    for y in range(size):
        row = []
        for x in range(size):
            dx = abs(x - cx)
            dy = abs(y - cy)
            color = bg
            if dx + dy <= outer:
                color = cyan
            if dx + dy <= inner:
                color = white
            row.append(color)
        data.append(row)

    return data


def write_png(path: Path, size: int):
    px = rgba_for_size(size)
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(px[y][x])
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def dib_image(size: int):
    px = rgba_for_size(size)
    xor = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            r, g, b, a = px[y][x]
            xor.extend([b, g, r, a])

    mask_row_bytes = ((size + 31) // 32) * 4
    and_mask = bytes(mask_row_bytes * size)

    header = struct.pack(
        "<IIIHHIIIIII",
        40,
        size,
        size * 2,
        1,
        32,
        0,
        len(xor) + len(and_mask),
        0,
        0,
        0,
        0,
    )

    return header + xor + and_mask


def write_ico(path: Path):
    img16 = dib_image(16)
    img32 = dib_image(32)
    icon_dir = struct.pack("<HHH", 0, 1, 2)
    offset1 = 6 + 16 * 2
    offset2 = offset1 + len(img16)
    entry1 = struct.pack("<BBBBHHII", 16, 16, 0, 0, 1, 32, len(img16), offset1)
    entry2 = struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(img32), offset2)
    path.write_bytes(icon_dir + entry1 + entry2 + img16 + img32)


def main():
    write_png(out / "favicon-16x16.png", 16)
    write_png(out / "favicon-32x32.png", 32)
    write_png(out / "apple-touch-icon.png", 180)
    write_png(out / "android-chrome-192x192.png", 192)
    write_png(out / "android-chrome-512x512.png", 512)
    write_ico(out / "favicon.ico")

    manifest = {
        "name": "Todo App",
        "short_name": "Todo",
        "icons": [
            {"src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"},
        ],
        "theme_color": "#0f172a",
        "background_color": "#ffffff",
        "display": "standalone",
    }
    (out / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
