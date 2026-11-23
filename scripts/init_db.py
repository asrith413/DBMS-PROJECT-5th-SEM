from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def main() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.returncode)
    print("CIMS relational schema is up to date.")


if __name__ == "__main__":
    main()
