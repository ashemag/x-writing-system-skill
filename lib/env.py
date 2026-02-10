from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, List


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    key = key.strip()
    value = value.strip().strip("'").strip('"')
    if not key:
        return None
    return key, value


def load_env_files(paths: Iterable[Path]) -> List[str]:
    loaded: List[str] = []
    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            parsed = _parse_env_line(line)
            if not parsed:
                continue
            key, value = parsed
            if key not in os.environ:
                os.environ[key] = value
        loaded.append(str(path))
    return loaded


def default_env_candidates(repo_root: Path) -> List[Path]:
    return [
        repo_root / ".env",
        repo_root.parent / "ashe_ai" / ".env",
    ]
