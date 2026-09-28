"""Check references and render the compiled paper for visual inspection."""
from pathlib import Path
import re
import sys
import pymupdf as fitz
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parent
stem = sys.argv[1] if len(sys.argv) > 1 else 'main'
tex = (root / f'{stem}.tex').read_text(encoding='utf-8')
bibname = re.search(r'\\bibliography\{([^}]+)\}', tex).group(1)
bib = (root / f'{bibname}.bib').read_text(encoding='utf-8')
keys = set(re.findall(r'@\w+\{([^,]+),', bib))
cited = {key.strip() for group in re.findall(r'\\cite\{([^}]+)\}', tex) for key in group.split(',')}
assert len(keys) == 25, len(keys)
assert keys == cited, (keys - cited, cited - keys)
doc = fitz.open(root / f'{stem}.pdf')
if stem == 'main-5page':
    assert len(doc) <= 5
    assert '\\IEEEauthorrefmark' not in tex
out = root / f'layout-check-{stem}'
out.mkdir(exist_ok=True)
thumbs = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    pix.save(out / f'page-{i+1}.png')
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    img.thumbnail((420, 594))
    tile = Image.new('RGB', (440, 630), '#e8ebef')
    tile.paste(img, ((440-img.width)//2, 20))
    ImageDraw.Draw(tile).text((16, 610), f'Page {i+1}', fill='black')
    thumbs.append(tile)
    for word in page.get_text('words'):
        assert word[0] >= 0 and word[1] >= 0 and word[2] <= page.rect.width + 1 and word[3] <= page.rect.height + 1, (i+1, word)
sheet = Image.new('RGB', (440*3, 630*((len(thumbs)+2)//3)), 'white')
for i, tile in enumerate(thumbs):
    sheet.paste(tile, ((i%3)*440, (i//3)*630))
sheet.save(out / 'contact-sheet.png')
text = '\n'.join(page.get_text() for page in doc)
for name in ['Pratyush Manas', 'Rajeev Kumar', 'Sachin Yash Raj', 'Sanaa Kumari']:
    assert name in text, name
assert '[25]' in text
print(f'PASS: {len(doc)} pages, {len(keys)} cited references, all four authors, no off-page text.')
