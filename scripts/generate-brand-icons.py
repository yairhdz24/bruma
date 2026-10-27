"""Package the user's original icon without redrawing or changing its artwork.

Run from the repository with npm dependencies installed:
  python3 scripts/generate-brand-icons.py
"""
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
source = root / 'public' / 'bruma-icon.png'
with tempfile.TemporaryDirectory(prefix='bruma-icons-') as temporary:
    output = Path(temporary)
    subprocess.run([str(root / 'node_modules' / '.bin' / 'tauri'), 'icon', str(source), '--output', str(output)], cwd=root, check=True)
    for name in ['32x32.png', '128x128.png', 'icon.png', 'icon.ico', 'icon.icns']:
        shutil.copyfile(output / name, root / 'src-tauri' / 'icons' / name)
    shutil.copyfile(output / '128x128@2x.png', root / 'public' / 'bruma-icon-256.png')
    shutil.copyfile(output / '32x32.png', root / 'public' / 'bruma-icon-32.png')
