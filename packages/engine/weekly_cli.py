#!/usr/bin/env python3
"""Weekly review CLI: stdin JSON -> stdout JSON."""

import json
import sys
from pathlib import Path

ENGINE_SRC = Path(__file__).resolve().parent / "src"
sys.path.insert(0, str(ENGINE_SRC))

from weekly_review import generate_weekly_review, validate_weekly_payload  # noqa: E402


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print("Input payload required on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        snapshots, profile_context, week_range = validate_weekly_payload(payload)
        output = generate_weekly_review(
            snapshots, profile_context, week_range_override=week_range
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    sys.stdout.write(json.dumps(output))


if __name__ == "__main__":
    main()
