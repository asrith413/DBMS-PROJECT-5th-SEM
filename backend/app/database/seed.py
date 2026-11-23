from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Action,
    Analyst,
    Asset,
    Incident,
    IncidentAsset,
    IncidentAssignment,
    IncidentStatus,
    IncidentThreatActor,
    IncidentType,
    Role,
    Severity,
    ThreatActor,
    User,
)
from app.services.audit_service import create_audit_log
from app.services.auth_service import hash_password


DEMO_PASSWORD = "CimsDemo123!"


def seed_relational_data(db: Session) -> dict[str, int | str]:
    if db.scalar(select(func.count()).select_from(User)):
        return {"status": 0, "message": "Database already contains users; seed skipped."}

    now = datetime.now(timezone.utc)
    users = [
        User(
            name="Aarav Mehta",
            email="admin@cims.edu",
            password_hash=hash_password(DEMO_PASSWORD),
            role=Role.ADMIN,
            department="Information Security",
        ),
        User(
            name="Maya Singh",
            email="maya.analyst@cims.edu",
            password_hash=hash_password(DEMO_PASSWORD),
            role=Role.ANALYST,
            department="Security Operations",
        ),
        User(
            name="Noah Fernandes",
            email="noah.analyst@cims.edu",
            password_hash=hash_password(DEMO_PASSWORD),
            role=Role.ANALYST,
            department="Security Operations",
        ),
        User(
            name="Isha Rao",
            email="reporter@cims.edu",
            password_hash=hash_password(DEMO_PASSWORD),
            role=Role.REPORTER,
            department="Finance",
        ),
        User(
            name="Vikram Shah",
            email="vikram.reporter@cims.edu",
            password_hash=hash_password(DEMO_PASSWORD),
            role=Role.REPORTER,
            department="Engineering",
        ),
    ]
    db.add_all(users)
    db.flush()

    analysts = [
        Analyst(user_id=users[1].user_id, expertise="Phishing and identity security"),
        Analyst(user_id=users[2].user_id, expertise="Malware and network forensics"),
    ]
    db.add_all(analysts)

    incident_types = [
        IncidentType(name="Phishing", description="Deceptive messages used to steal credentials."),
        IncidentType(name="Malware", description="Malicious software detected on a managed endpoint."),
        IncidentType(name="Network Intrusion", description="Unauthorized activity within the network."),
        IncidentType(name="SQL Injection", description="Malicious SQL submitted through an application."),
        IncidentType(name="Unauthorized Access", description="Access performed without valid authorization."),
    ]
    severities = [
        Severity(level="Low", response_sla_hours=24, resolution_sla_hours=120),
        Severity(level="Medium", response_sla_hours=8, resolution_sla_hours=72),
        Severity(level="High", response_sla_hours=2, resolution_sla_hours=24),
        Severity(level="Critical", response_sla_hours=1, resolution_sla_hours=8),
    ]
    assets = [
        Asset(name="Public Web Server", type="Web Server", ip_address="10.20.1.10", department="Engineering"),
        Asset(name="Customer Database", type="Database Server", ip_address="10.20.2.15", department="Engineering"),
        Asset(name="Finance Laptop 24", type="Employee Laptop", ip_address="10.30.5.24", department="Finance"),
        Asset(name="Edge Firewall", type="Firewall", ip_address="10.20.0.1", department="Information Security"),
        Asset(name="Corporate LAN", type="Internal Network", ip_address="10.30.0.0/16", department="IT Operations"),
    ]
    actors = [
        ThreatActor(alias="Unknown Credential Harvester", description="Unattributed actor operating phishing pages."),
        ThreatActor(alias="Night Sparrow", description="Demonstration ransomware affiliate group."),
        ThreatActor(alias="External Scanner", description="Unattributed automated reconnaissance source."),
    ]
    db.add_all(incident_types + severities + assets + actors)
    db.flush()

    incident_specs = [
        ("Payroll credential phishing", "Several finance employees received a fake payroll sign-in page.", 0, 2, 3, IncidentStatus.UNDER_INVESTIGATION, 6, None),
        ("Malware on finance laptop", "Endpoint protection detected a trojan downloading additional payloads.", 1, 3, 3, IncidentStatus.IN_PROGRESS, 2, None),
        ("Repeated VPN login failures", "Multiple failed logins were followed by one successful foreign login.", 4, 2, 4, IncidentStatus.ASSIGNED, 1, None),
        ("Web application SQL injection", "Database error patterns and UNION payloads appeared in access logs.", 3, 3, 4, IncidentStatus.RESOLVED, 15, 14),
        ("Internal port scanning", "A workstation scanned privileged network segments overnight.", 2, 1, 4, IncidentStatus.OPEN, 0, None),
        ("Blocked malicious attachment", "Mail gateway quarantined a suspicious macro document.", 0, 0, 3, IncidentStatus.CLOSED, 25, 24),
        ("Database service account misuse", "A service account queried customer exports outside its normal schedule.", 4, 2, 4, IncidentStatus.UNDER_INVESTIGATION, 3, None),
        ("Firewall exploit attempts", "External source sent repeated exploit probes to the edge firewall.", 2, 1, 3, IncidentStatus.ASSIGNED, 4, None),
    ]
    incidents: list[Incident] = []
    for title, description, type_index, severity_index, reporter_index, status, age_hours, resolved_age in incident_specs:
        incident = Incident(
            title=title,
            description=description,
            incident_type=incident_types[type_index],
            severity=severities[severity_index],
            reporter=users[reporter_index],
            status=status,
            reported_date=now - timedelta(hours=age_hours),
            resolved_date=(now - timedelta(hours=resolved_age)) if resolved_age is not None else None,
        )
        incidents.append(incident)
    db.add_all(incidents)
    db.flush()

    assignments = [
        IncidentAssignment(incident_id=incidents[0].incident_id, analyst_id=analysts[0].user_id, role="Primary Analyst", assigned_date=incidents[0].reported_date + timedelta(minutes=30)),
        IncidentAssignment(incident_id=incidents[1].incident_id, analyst_id=analysts[1].user_id, role="Primary Analyst", assigned_date=incidents[1].reported_date + timedelta(minutes=20)),
        IncidentAssignment(incident_id=incidents[2].incident_id, analyst_id=analysts[0].user_id, role="Identity Specialist", assigned_date=incidents[2].reported_date + timedelta(minutes=15)),
        IncidentAssignment(incident_id=incidents[3].incident_id, analyst_id=analysts[1].user_id, role="Forensic Analyst", assigned_date=incidents[3].reported_date + timedelta(minutes=10)),
        IncidentAssignment(incident_id=incidents[5].incident_id, analyst_id=analysts[0].user_id, role="Primary Analyst", assigned_date=incidents[5].reported_date + timedelta(minutes=30)),
        IncidentAssignment(incident_id=incidents[6].incident_id, analyst_id=analysts[0].user_id, role="Primary Analyst", assigned_date=incidents[6].reported_date + timedelta(minutes=20)),
        IncidentAssignment(incident_id=incidents[6].incident_id, analyst_id=analysts[1].user_id, role="Database Specialist", assigned_date=incidents[6].reported_date + timedelta(minutes=25)),
        IncidentAssignment(incident_id=incidents[7].incident_id, analyst_id=analysts[1].user_id, role="Network Analyst", assigned_date=incidents[7].reported_date + timedelta(minutes=30)),
    ]
    db.add_all(assignments)
    analysts[0].workload = 3
    analysts[1].workload = 3

    asset_links = [
        IncidentAsset(incident_id=incidents[0].incident_id, asset_id=assets[2].asset_id, impact_type="Credentials targeted"),
        IncidentAsset(incident_id=incidents[1].incident_id, asset_id=assets[2].asset_id, impact_type="Endpoint compromised"),
        IncidentAsset(incident_id=incidents[3].incident_id, asset_id=assets[0].asset_id, impact_type="Application targeted"),
        IncidentAsset(incident_id=incidents[3].incident_id, asset_id=assets[1].asset_id, impact_type="Data access attempted"),
        IncidentAsset(incident_id=incidents[4].incident_id, asset_id=assets[4].asset_id, impact_type="Reconnaissance"),
        IncidentAsset(incident_id=incidents[6].incident_id, asset_id=assets[1].asset_id, impact_type="Suspicious queries"),
        IncidentAsset(incident_id=incidents[7].incident_id, asset_id=assets[3].asset_id, impact_type="Exploit attempts"),
    ]
    threat_links = [
        IncidentThreatActor(incident_id=incidents[0].incident_id, actor_id=actors[0].actor_id),
        IncidentThreatActor(incident_id=incidents[1].incident_id, actor_id=actors[1].actor_id),
        IncidentThreatActor(incident_id=incidents[7].incident_id, actor_id=actors[2].actor_id),
    ]
    db.add_all(asset_links + threat_links)
    actions = [
        Action(incident_id=incidents[0].incident_id, performed_by=users[1].user_id, description="Disabled the phishing domain in the secure web gateway.", action_date=incidents[0].reported_date + timedelta(hours=1)),
        Action(incident_id=incidents[0].incident_id, performed_by=users[1].user_id, description="Requested password resets for affected employees.", action_date=incidents[0].reported_date + timedelta(hours=2)),
        Action(incident_id=incidents[1].incident_id, performed_by=users[2].user_id, description="Quarantined the infected device from the corporate network.", action_date=incidents[1].reported_date + timedelta(minutes=40)),
        Action(incident_id=incidents[3].incident_id, performed_by=users[2].user_id, description="Blocked the source IP and deployed an input validation fix.", action_date=incidents[3].reported_date + timedelta(minutes=30)),
        Action(incident_id=incidents[6].incident_id, performed_by=users[1].user_id, description="Revoked the database service account session tokens.", action_date=incidents[6].reported_date + timedelta(hours=1)),
        Action(incident_id=incidents[7].incident_id, performed_by=users[2].user_id, description="Added temporary firewall rules for the scanner addresses.", action_date=incidents[7].reported_date + timedelta(hours=1)),
    ]
    db.add_all(actions)
    db.flush()

    audit_events: list[dict[str, object]] = []
    for incident in incidents:
        audit_events.append(
            {
                "incident_id": incident.incident_id,
                "performed_by": incident.reported_by,
                "action_type": "INCIDENT_CREATED",
                "action_data": {"title": incident.title, "status": IncidentStatus.OPEN.value},
                "timestamp": incident.reported_date,
            }
        )
    assigned_incidents: set[int] = set()
    for assignment in assignments:
        old_status = (
            IncidentStatus.ASSIGNED.value
            if assignment.incident_id in assigned_incidents
            else IncidentStatus.OPEN.value
        )
        assigned_incidents.add(assignment.incident_id)
        audit_events.append(
            {
                "incident_id": assignment.incident_id,
                "performed_by": users[0].user_id,
                "action_type": "INCIDENT_ASSIGNED",
                "action_data": {
                    "analyst_id": assignment.analyst_id,
                    "role": assignment.role,
                    "old_status": old_status,
                    "new_status": IncidentStatus.ASSIGNED.value,
                },
                "timestamp": assignment.assigned_date,
            }
        )
    for link in asset_links:
        incident = next(item for item in incidents if item.incident_id == link.incident_id)
        asset = next(item for item in assets if item.asset_id == link.asset_id)
        audit_events.append(
            {
                "incident_id": link.incident_id,
                "performed_by": users[0].user_id,
                "action_type": "ASSET_ASSOCIATED",
                "action_data": {
                    "asset_id": link.asset_id,
                    "asset_name": asset.name,
                    "impact_type": link.impact_type,
                },
                "timestamp": min(
                    incident.reported_date + timedelta(minutes=5), now
                ),
            }
        )
    for link in threat_links:
        incident = next(item for item in incidents if item.incident_id == link.incident_id)
        actor = next(item for item in actors if item.actor_id == link.actor_id)
        audit_events.append(
            {
                "incident_id": link.incident_id,
                "performed_by": users[0].user_id,
                "action_type": "THREAT_ACTOR_ASSOCIATED",
                "action_data": {"actor_id": link.actor_id, "alias": actor.alias},
                "timestamp": min(
                    incident.reported_date + timedelta(minutes=6), now
                ),
            }
        )
    status_events = [
        (incidents[0], IncidentStatus.ASSIGNED, IncidentStatus.UNDER_INVESTIGATION, incidents[0].reported_date + timedelta(minutes=45)),
        (incidents[1], IncidentStatus.ASSIGNED, IncidentStatus.UNDER_INVESTIGATION, incidents[1].reported_date + timedelta(minutes=25)),
        (incidents[1], IncidentStatus.UNDER_INVESTIGATION, IncidentStatus.IN_PROGRESS, incidents[1].reported_date + timedelta(minutes=30)),
        (incidents[3], IncidentStatus.ASSIGNED, IncidentStatus.UNDER_INVESTIGATION, incidents[3].reported_date + timedelta(minutes=15)),
        (incidents[3], IncidentStatus.UNDER_INVESTIGATION, IncidentStatus.IN_PROGRESS, incidents[3].reported_date + timedelta(minutes=20)),
        (incidents[3], IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED, incidents[3].resolved_date),
        (incidents[5], IncidentStatus.ASSIGNED, IncidentStatus.UNDER_INVESTIGATION, incidents[5].reported_date + timedelta(minutes=35)),
        (incidents[5], IncidentStatus.UNDER_INVESTIGATION, IncidentStatus.IN_PROGRESS, incidents[5].reported_date + timedelta(minutes=40)),
        (incidents[5], IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED, incidents[5].resolved_date),
        (incidents[5], IncidentStatus.RESOLVED, IncidentStatus.CLOSED, incidents[5].resolved_date + timedelta(minutes=5)),
        (incidents[6], IncidentStatus.ASSIGNED, IncidentStatus.UNDER_INVESTIGATION, incidents[6].reported_date + timedelta(minutes=30)),
    ]
    for incident, old_status, new_status, event_time in status_events:
        audit_events.append(
            {
                "incident_id": incident.incident_id,
                "performed_by": users[0].user_id,
                "action_type": (
                    "INCIDENT_RESOLVED"
                    if new_status == IncidentStatus.RESOLVED
                    else "STATUS_CHANGED"
                ),
                "action_data": {
                    "old_status": old_status.value,
                    "new_status": new_status.value,
                },
                "timestamp": event_time,
            }
        )
    for action in actions:
        audit_events.append(
            {
                "incident_id": action.incident_id,
                "performed_by": action.performed_by,
                "action_type": "ACTION_ADDED",
                "action_data": {"description": action.description},
                "timestamp": action.action_date,
            }
        )
    for event in sorted(audit_events, key=lambda item: item["timestamp"]):
        create_audit_log(
            db,
            incident_id=int(event["incident_id"]),
            performed_by=int(event["performed_by"]),
            action_type=str(event["action_type"]),
            action_data=event["action_data"],
            timestamp=event["timestamp"],
        )

    db.commit()
    return {
        "users": len(users),
        "analysts": len(analysts),
        "incidents": len(incidents),
        "assets": len(assets),
        "actions": len(actions),
    }
