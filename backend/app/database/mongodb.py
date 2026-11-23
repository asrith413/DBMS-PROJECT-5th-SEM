from functools import lru_cache
from typing import Any

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection

from app.config import settings


@lru_cache
def get_mongo_client() -> MongoClient[dict[str, Any]]:
    return MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)


def get_security_logs_collection() -> Collection[dict[str, Any]]:
    return get_mongo_client()[settings.mongodb_database]["security_logs"]


def initialize_mongodb() -> None:
    collection = get_security_logs_collection()
    collection.create_index([("log_id", ASCENDING)], unique=True)
    collection.create_index([("incident_id", ASCENDING), ("timestamp", ASCENDING)])
    collection.create_index([("source", ASCENDING)])
    collection.create_index([("severity", ASCENDING)])
    collection.create_index([("event_type", ASCENDING)])


def check_mongodb_connection() -> bool:
    get_mongo_client().admin.command("ping")
    return True
