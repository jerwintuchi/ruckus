#!/usr/bin/env python3
"""Enforce the closed Kit: geometry is code, so no asset file may enter the tree.

Why this exists (RD-001): the previous project lost months to an art loop that could
never converge, because every surface was bespoke and verified by eye rather than by
test. The structural fix is not discipline — it is making the failure mode
unavailable. If there is no asset to polish, no one can spend a week polishing it.

This is a guard, not a linter: it fails loudly on the *first* asset, when reverting
costs nothing, rather than after a pipeline has grown around it.

    python3 tools/kit_check.py             # report
    python3 tools/kit_check.py --check     # exit 1 on any violation
    python3 tools/kit_check.py --selftest  # assert the rules
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BANNED_EXT = {
    # models
    ".glb", ".gltf", ".fbx", ".obj", ".blend", ".dae", ".3ds", ".stl",
    # textures / images
    ".png", ".jpg", ".jpeg", ".webp", ".tga", ".bmp", ".psd", ".aseprite", ".ase",
    # audio (deliberately banned in v1 — see RD-005)
    ".mp3", ".wav", ".ogg", ".flac", ".m4a",
    # video
    ".mp4", ".webm", ".mov",
}

# Narrow, explicit exemptions. A favicon is not game art.
ALLOW_PATHS = {
    "src/client/public/favicon.svg",
}

SKIP_DIRS = {".git", "node_modules", "dist", "__pycache__", ".vite", "coverage"}

# Loading an asset at runtime is the same violation arriving by a different door.
RE_LOADER = re.compile(
    r"\b(TextureLoader|GLTFLoader|FBXLoader|OBJLoader|CubeTextureLoader|"
    r"loadTexture|new\s+Audio|AudioLoader)\b"
)
RE_CODE = re.compile(r"\.(ts|tsx|js|jsx|mjs)$")


def walk() -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, "/")
            out.append(rel)
    return out


def violations() -> list[str]:
    out: list[str] = []
    for rel in walk():
        if rel in ALLOW_PATHS:
            continue
        ext = os.path.splitext(rel)[1].lower()
        if ext in BANNED_EXT:
            out.append(f"asset file: {rel}  ({ext} is not in the Kit — geometry is code)")
        if RE_CODE.search(rel):
            try:
                text = open(os.path.join(ROOT, rel), encoding="utf-8").read()
            except (OSError, UnicodeDecodeError):
                continue
            # The tool's own patterns, and doc prose, are not violations.
            if rel.startswith("tools/"):
                continue
            for m in RE_LOADER.finditer(text):
                line = text[: m.start()].count("\n") + 1
                out.append(f"asset loader: {rel}:{line} uses {m.group(1)}")
    return out


def selftest() -> int:
    assert ".glb" in BANNED_EXT and ".png" in BANNED_EXT and ".wav" in BANNED_EXT
    assert ".ts" not in BANNED_EXT and ".json" not in BANNED_EXT
    assert RE_LOADER.search("const l = new GLTFLoader()")
    assert RE_LOADER.search("new TextureLoader().load(x)")
    assert not RE_LOADER.search("new BoxGeometry(1,1,1)")
    assert not RE_LOADER.search("CapsuleGeometry")
    assert RE_CODE.search("a/b.ts") and not RE_CODE.search("a/b.md")
    print("kit_check selftest: OK")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    bad = violations()
    if bad:
        print("KIT VIOLATION — the Kit is closed (.claude/rules/kit-rules.md):", file=sys.stderr)
        for b in bad:
            print(f"  {b}", file=sys.stderr)
        print(
            "\nA minigame that needs an asset needs a different rule instead.\n"
            "If this is genuinely the exception, it takes a DECISION_LOG entry and an\n"
            "ALLOW_PATHS edit — not a quiet commit.",
            file=sys.stderr,
        )
        return 1
    print("kit OK — no assets, no loaders; geometry is code")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
