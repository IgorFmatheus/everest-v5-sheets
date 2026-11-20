"""Build a small, verified Foundry module archive using Python's standard library."""
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "module.json").read_text(encoding="utf-8"))
version = manifest["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    raise SystemExit("Expected a stable x.y.z version")
if json.loads((root / "package.json").read_text(encoding="utf-8"))["version"] != version:
    raise SystemExit("package.json and module.json versions differ")
tag = f"v{version}"
if (os.environ.get("RELEASE_TAG") or tag) != tag:
    raise SystemExit("Release tag must match module.json")
repo = os.environ.get("GITHUB_REPOSITORY", "IgorFmatheus/everest-v5-sheets")
base = f"https://github.com/{repo}"
for key, expected in {"id":"everest-v5-sheets", "url":base, "manifest":f"{base}/releases/latest/download/module.json", "download":f"{base}/releases/download/{tag}/everest-v5-sheets.zip"}.items():
    if manifest.get(key) != expected:
        raise SystemExit(f"Invalid manifest field: {key}")
files = ["module.json", "README.md", "LICENSE.md"]
for folder, pattern in [("scripts", "*.js"), ("styles", "*.css"), ("templates", "*.hbs")]:
    files.extend(path.relative_to(root).as_posix() for path in sorted((root / folder).glob(pattern)))
for path in [*manifest["esmodules"], *manifest["styles"]]:
    if path not in files:
        raise SystemExit(f"Missing referenced file: {path}")
dist = root / "dist"
dist.mkdir(exist_ok=True)
payload = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
(dist / "module.json").write_bytes(payload)
archive_path = dist / "everest-v5-sheets.zip"
with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.writestr(name, payload if name == "module.json" else (root / name).read_bytes())
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
    assert archive.read("module.json") == payload
(dist / "SHA256SUMS.txt").write_text("".join(f"{hashlib.sha256((dist / name).read_bytes()).hexdigest()}  {name}\n" for name in ["module.json", "everest-v5-sheets.zip"]), encoding="utf-8")
print(f"Validated {tag}; {len(files)} module files packaged")
