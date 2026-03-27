from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
script_path = root / 'scripts' / 'generate-icons.mjs'

result = subprocess.run(['node', str(script_path)], cwd=root)
sys.exit(result.returncode)
