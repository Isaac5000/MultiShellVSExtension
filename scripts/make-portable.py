#!/usr/bin/env python3
"""Create a portable, allowlisted source archive plus its ready-to-install VSIX.

Only explicitly named project files and directories are included; no user
settings, terminal sessions, tokens, environment files or local dependencies.
Works with the Python standard library on Windows and Linux.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = (
    ".gitignore", ".vscodeignore", "CHANGELOG.md", "LICENSE", "README.md",
    "eslint.config.mjs", "package-lock.json", "package.json",
    "package.nls.es.json", "package.nls.json", "tsconfig.json",
)
SOURCE_DIRS = ("docs", "media", "src", "scripts", "test")
EXCLUDED = {".git", ".vscode", ".vscode-test", "__pycache__", "node_modules",
            "out", "dist", ".env", ".DS_Store"}
EXCLUDED_SUFFIXES = (".pyc", ".pyo", ".log", ".vsix")


def allowed(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    return not (any(part in EXCLUDED for part in relative.parts)
                or path.suffix.lower() in EXCLUDED_SUFFIXES
                or path.is_symlink())


def build(output: Path) -> tuple[int, str, str]:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    version = package["version"]
    folder = f"MultiShell-MCP-Server-{version}"
    vsix = ROOT / f"multi-shell-mcp-server-{version}.vsix"
    if not vsix.is_file():
        raise FileNotFoundError(
            f"Build the installer first: {vsix.name} (npm run package)")
    if output.resolve() == vsix.resolve():
        raise ValueError("The output archive must not overwrite the VSIX.")

    files = [ROOT / name for name in ROOT_FILES]
    files += [f for name in SOURCE_DIRS for f in (ROOT / name).rglob("*")
              if f.is_file() and allowed(f)]
    files.append(vsix)
    for file in files:
        if not file.is_file() or file.is_symlink():
            raise FileNotFoundError(f"Required source file missing or symlinked: {file}")
    files = sorted(set(files), key=lambda p: p.relative_to(ROOT).as_posix())
    hashes = []
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as z:
        for file in files:
            name = PurePosixPath(folder, *file.relative_to(ROOT).parts).as_posix()
            content = file.read_bytes()
            z.writestr(name, content)
            hashes.append(f"{hashlib.sha256(content).hexdigest()}  "
                          f"{file.relative_to(ROOT).as_posix()}")
        z.writestr(f"{folder}/MANIFIESTO-SHA256.txt",
                   "\n".join(hashes) + "\n")
    with ZipFile(output) as z:
        expected = [PurePosixPath(folder, *f.relative_to(ROOT).parts).as_posix()
                    for f in files]
        if sorted(z.namelist()) != sorted(expected +
                                         [f"{folder}/MANIFIESTO-SHA256.txt"]):
            raise RuntimeError("Portable archive integrity check failed")
        bad = z.testzip()
        if bad:
            raise RuntimeError(f"Corrupted ZIP entry: {bad}")
    return len(files), str(output), hashlib.sha256(output.read_bytes()).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=None,
                        help="ZIP path (defaults to project root)")
    args = parser.parse_args()
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    dest = args.output or ROOT / f"MultiShell-MCP-Server-{pkg['version']}-portable.zip"
    count, archive, sha256 = build(dest)
    print(f"PORTABLE_OK files={count} archive={archive}")
    print(f"SHA256 {sha256}")