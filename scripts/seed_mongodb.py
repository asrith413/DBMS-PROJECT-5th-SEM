from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

from sqlalchemy import select


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.database.mongodb import get_security_logs_collection, initialize_mongodb  # noqa: E402
from app.database.postgres import SessionLocal  # noqa: E402
from app.models import Incident  # noqa: E402


def main() -> None:
    incident_titles = {
        "Payroll credential phishing",
        "Malware on finance laptop",
        "Repeated VPN login failures",
        "Web application SQL injection",
        "Firewall exploit attempts",
    }
    with SessionLocal() as db:
        incident_ids = dict(
            db.execute(
                select(Incident.title, Incident.incident_id).where(
                    Incident.title.in_(incident_titles)
                )
            ).all()
        )
    missing = sorted(incident_titles - incident_ids.keys())
    if missing:
        raise RuntimeError(
            "MongoDB seed requires the relational demo incidents. Missing: "
            + ", ".join(missing)
        )

    initialize_mongodb()
    collection = get_security_logs_collection()
    if collection.count_documents({}):
        print("MongoDB security_logs already contains data; seed skipped.")
        return
    now = datetime.now(timezone.utc)
    documents = [
        {"log_id": "demo-log-001", "incident_id": incident_ids["Payroll credential phishing"], "source": "Email Gateway", "event_type": "phishing_url", "source_ip": "198.51.100.34", "destination_ip": "10.30.5.24", "timestamp": now - timedelta(hours=5), "severity": "High", "description": "Message contained a credential-harvesting payroll URL.", "metadata": {"message_id": "MSG-88421", "blocked": True}},
        {"log_id": "demo-log-002", "incident_id": incident_ids["Malware on finance laptop"], "source": "Endpoint Detection", "event_type": "malware_detected", "source_ip": "10.30.5.24", "destination_ip": "203.0.113.77", "timestamp": now - timedelta(hours=2), "severity": "Critical", "description": "Trojan process attempted an outbound command-and-control connection.", "metadata": {"process": "invoice_viewer.exe", "quarantined": True}},
        {"log_id": "demo-log-003", "incident_id": incident_ids["Repeated VPN login failures"], "source": "VPN Gateway", "event_type": "authentication_failure", "source_ip": "192.0.2.55", "destination_ip": "10.20.0.1", "timestamp": now - timedelta(hours=1), "severity": "High", "description": "Twelve failed login attempts preceded a successful session.", "metadata": {"failures": 12, "country": "Unknown"}},
        {"log_id": "demo-log-004", "incident_id": incident_ids["Web application SQL injection"], "source": "Web Application Firewall", "event_type": "sql_injection", "source_ip": "203.0.113.91", "destination_ip": "10.20.1.10", "timestamp": now - timedelta(hours=14), "severity": "Critical", "description": "UNION SELECT payload blocked on the customer search endpoint.", "metadata": {"path": "/customers/search", "http_status": 403}},
        {"log_id": "demo-log-005", "incident_id": incident_ids["Firewall exploit attempts"], "source": "Edge Firewall", "event_type": "exploit_probe", "source_ip": "198.51.100.88", "destination_ip": "10.20.0.1", "timestamp": now - timedelta(hours=3), "severity": "Medium", "description": "Repeated exploit probes targeted the firewall administration interface.", "metadata": {"attempts": 47, "blocked": True}},
    ]
    collection.insert_many(documents)
    print(f"Inserted {len(documents)} MongoDB security logs.")


if __name__ == "__main__":
    main()
