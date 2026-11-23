import csv
from functools import lru_cache
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


ML_DIRECTORY = Path(__file__).resolve().parent
DATASET_PATH = ML_DIRECTORY / "training_data.csv"
MODEL_PATH = ML_DIRECTORY / "severity_model.joblib"


def combine_text(title: str, description: str, incident_type: str) -> str:
    return f"{incident_type} {title} {description}"


def train_model(model_path: Path = MODEL_PATH) -> Pipeline:
    texts: list[str] = []
    labels: list[str] = []
    with DATASET_PATH.open("r", encoding="utf-8", newline="") as dataset:
        for row in csv.DictReader(dataset):
            texts.append(combine_text(row["title"], row["description"], row["incident_type"]))
            labels.append(row["severity"])
    if len(set(labels)) != 4:
        raise ValueError("Training data must contain all four severity labels.")
    model = Pipeline(
        [
            ("vectorizer", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("classifier", LogisticRegression(max_iter=1000, random_state=42)),
        ]
    )
    model.fit(texts, labels)
    joblib.dump(model, model_path)
    return model


@lru_cache(maxsize=1)
def load_model() -> Pipeline:
    if not MODEL_PATH.exists():
        return train_model()
    return joblib.load(MODEL_PATH)


def predict_severity(title: str, description: str, incident_type: str) -> tuple[str, float]:
    model = load_model()
    text = combine_text(title, description, incident_type)
    prediction = str(model.predict([text])[0])
    confidence = float(max(model.predict_proba([text])[0]))
    return prediction, round(confidence, 4)
