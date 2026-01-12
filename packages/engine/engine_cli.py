#!/usr/bin/env python3
import sys
from pathlib import Path

# Keep compatibility with the original CLI path by delegating to src/engine.py.
ENGINE_SRC = Path(__file__).resolve().parent / "src"
sys.path.insert(0, str(ENGINE_SRC))

from engine import main  # noqa: E402


if __name__ == "__main__":
    main()
