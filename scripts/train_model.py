from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.classifier import MODEL_PATH, train_model  # noqa: E402


if __name__ == "__main__":
    train_model()
    print(f"Severity model saved to {MODEL_PATH}")
