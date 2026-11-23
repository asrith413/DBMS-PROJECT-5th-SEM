import re
from typing import Any
from uuid import uuid4

from pymongo.collection import Collection

from app.schemas.security_logs import SecurityLogCreate


def insert_security_log(
    collection: Collection[dict[str, Any]], payload: SecurityLogCreate
) -> dict[str, Any]:
    document = payload.model_dump(mode="python")
    document["log_id"] = str(uuid4())
    collection.insert_one(document)
    document.pop("_id", None)
    return document


def search_security_logs(
    collection: Collection[dict[str, Any]],
    *,
    incident_id: int | None = None,
    source: str | None = None,
    severity: str | None = None,
    event_type: str | None = None,
    search: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {}
    if incident_id is not None:
        query["incident_id"] = incident_id
    if source:
        query["source"] = {"$regex": f"^{re.escape(source)}$", "$options": "i"}
    if severity:
        query["severity"] = {"$regex": f"^{re.escape(severity)}$", "$options": "i"}
    if event_type:
        query["event_type"] = {"$regex": f"^{re.escape(event_type)}$", "$options": "i"}
    if search:
        text_pattern = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [
            {"description": text_pattern},
            {"source": text_pattern},
            {"event_type": text_pattern},
            {"source_ip": text_pattern},
            {"destination_ip": text_pattern},
        ]
    documents = collection.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return list(documents)
