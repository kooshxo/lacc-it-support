#!/usr/bin/env python3
"""Build the public, PII-redacted scan used as the PDF background.

The source PDF is supplied locally by LACC and is intentionally not committed.
Only the visible sample date, employee name, and populated laptop values are
covered; the organization artwork, labels, agreement text, and signature lines
are retained. The resulting JPEG contains pixels only, not recoverable PDF text.
"""

from pathlib import Path
import subprocess
import os
import shutil
import sys
import tempfile

from PIL import Image, ImageDraw


if len(sys.argv) != 3:
    raise SystemExit("Usage: build-laptop-letter-background.py SOURCE.pdf OUTPUT.jpg")

source = Path(sys.argv[1]).expanduser().resolve()
output = Path(sys.argv[2]).expanduser().resolve()
if not source.is_file():
    raise SystemExit("Source PDF was not found.")

pdfinfo = Path(os.environ.get("PDFINFO") or shutil.which("pdfinfo") or "")
pdftoppm = Path(os.environ.get("PDFTOPPM") or shutil.which("pdftoppm") or "")
if not str(pdfinfo) or not pdfinfo.exists() or not str(pdftoppm) or not pdftoppm.exists():
    raise SystemExit("Bundled pdfinfo/pdftoppm are required to render the approved letter.")

info = subprocess.run([str(pdfinfo), str(source)], check=True, capture_output=True, text=True).stdout
if "Pages:           1" not in info or "Page size:       612 x 792 pts (letter)" not in info:
    raise SystemExit("Expected the approved one-page US Letter source PDF.")

with tempfile.TemporaryDirectory(prefix="lacc-letter-redact-") as tmp:
    prefix = Path(tmp) / "source"
    subprocess.run([str(pdftoppm), "-f", "1", "-l", "1", "-singlefile", "-png", "-r", "300", str(source), str(prefix)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    image = Image.open(f"{prefix}.png").convert("RGB")

    # Coordinates are in PDF points from the top-left, mapped to the 300 dpi
    # render. These rectangles contain sample values only; printed labels remain.
    scale = 300 / 72
    boxes = [
        (188, 149, 330, 168),  # sample printed date
        (188, 170, 556, 190),  # sample employee name and sentence baseline
        (300, 196, 556, 212),  # Laptop value
        (321, 212, 556, 227),  # Inventory number value
        (299, 227, 556, 242),  # Model value
        (300, 242, 556, 257),  # Serial number value
        (300, 257, 556, 272),  # Service tag value
        (301, 272, 556, 288),  # Cellular number value
    ]
    draw = ImageDraw.Draw(image)
    for x0, y0, x1, y1 in boxes:
        draw.rectangle((round(x0 * scale), round(y0 * scale), round(x1 * scale), round(y1 * scale)), fill="white")

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="JPEG", quality=96, optimize=True, progressive=True)

print(f"Created sanitized one-page template background: {output}")
