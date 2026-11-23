from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.database.postgres import SessionLocal  # noqa: E402
from app.database.seed import DEMO_PASSWORD, seed_relational_data  # noqa: E402


def main() -> None:
    with SessionLocal() as db:
        result = seed_relational_data(db)
    print(result)
    print(f"Demo account password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
