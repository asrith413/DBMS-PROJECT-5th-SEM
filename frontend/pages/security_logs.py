from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import streamlit as st

from components.ui import (
    format_datetime,
    handle_api_error,
    json_text,
    page_header,
    require_role,
    reset_invalid_selection,
    set_flash,
    show_flash,
)
from services.api_client import APIClient, APIError


LOG_SEVERITIES = ["Low", "Medium", "High", "Critical"]


def _reload(message: str) -> None:
    set_flash(message, scope="security_logs")
    st.rerun()


def render_security_logs(api: APIClient, user: dict[str, Any]) -> None:
    if not require_role(user, {"ADMIN", "ANALYST"}):
        return
    show_flash("security_logs")
    role = user.get("role", "")
    page_header(
        "MongoDB telemetry",
        "Security Logs",
        "Query incident telemetry using the filters supported by the API and add investigation evidence.",
    )

    try:
        incidents = api.list_incidents(limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load incidents for log access")
        return
    incident_by_id = {int(item["incident_id"]): item for item in incidents}
    incident_ids = list(incident_by_id)
    if role == "ANALYST" and not incident_ids:
        st.info("No assigned incidents are available. Analysts can query logs only by assigned incident ID.")
        return

    st.subheader("Log search")
    with st.form("security_log_filters"):
        filter_columns = st.columns([1.25, 1, 1, 1])
        with filter_columns[0]:
            filter_options = ([0] if role == "ADMIN" else []) + incident_ids
            selected_incident = st.selectbox(
                "Incident",
                options=filter_options,
                format_func=lambda value: (
                    "All incidents"
                    if value == 0
                    else f"#{value}  {incident_by_id[value]['title']}"
                ),
            )
        with filter_columns[1]:
            selected_severity = st.selectbox("Severity", ["All severities", *LOG_SEVERITIES])
        with filter_columns[2]:
            source = st.text_input("Source", max_chars=100, placeholder="Email Gateway")
        with filter_columns[3]:
            event_type = st.text_input("Event type", max_chars=100, placeholder="phishing_url")
        search = st.text_input("Description search", max_chars=200)
        limit = st.selectbox("Result limit", [50, 100, 200, 500, 1000], index=2)
        st.form_submit_button("Apply log filters", type="primary")

    incident_filter = None if selected_incident == 0 else int(selected_incident)
    try:
        logs = api.list_security_logs(
            incident_id=incident_filter,
            source=source.strip() or None,
            severity=None if selected_severity == "All severities" else selected_severity,
            event_type=event_type.strip() or None,
            search=search.strip() or None,
            limit=int(limit),
        )
    except APIError as error:
        handle_api_error(error, "Security log query failed")
        return

    if logs:
        rows = [
            {
                "Timestamp": format_datetime(item.get("timestamp")),
                "Incident": item.get("incident_id"),
                "Severity": item.get("severity", ""),
                "Source": item.get("source", ""),
                "Event type": item.get("event_type", ""),
                "Source IP": item.get("source_ip") or "-",
                "Destination IP": item.get("destination_ip") or "-",
                "Description": item.get("description", ""),
                "Metadata": json_text(item.get("metadata") or {}),
                "Log ID": item.get("log_id", ""),
            }
            for item in logs
        ]
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
        log_by_id = {str(item["log_id"]): item for item in logs}
        reset_invalid_selection("raw_security_log_selector", log_by_id)
        selected_log_id = st.selectbox(
            "Inspect raw log record", options=list(log_by_id), key="raw_security_log_selector"
        )
        with st.expander("Raw API record"):
            st.json(log_by_id[selected_log_id])
    else:
        st.info("No security logs match the current filters.")

    st.subheader("Add security log")
    active_incident_ids = [
        incident_id
        for incident_id in incident_ids
        if incident_by_id[incident_id].get("status") not in {"Resolved", "Closed"}
    ]
    if not active_incident_ids:
        st.info("An accessible incident is required before telemetry can be added.")
        return
    now = datetime.now(timezone.utc)
    with st.form("create_security_log", clear_on_submit=True):
        selected_create_incident = st.selectbox(
            "Incident",
            options=active_incident_ids,
            format_func=lambda value: f"#{value}  {incident_by_id[value]['title']}",
        )
        first, second = st.columns(2)
        with first:
            create_source = st.text_input("Source", max_chars=100)
            create_event_type = st.text_input("Event type", max_chars=100)
            source_ip = st.text_input("Source IP", max_chars=45)
        with second:
            create_severity = st.selectbox("Severity", LOG_SEVERITIES, index=1)
            destination_ip = st.text_input("Destination IP", max_chars=45)
            log_date = st.date_input("Event date (UTC)", value=now.date())
            log_time = st.time_input("Event time (UTC)", value=now.time().replace(microsecond=0, tzinfo=None))
        create_description = st.text_area("Description", max_chars=5000)
        metadata_text = st.text_area(
            "Metadata (JSON object)",
            value="{}",
            help='Example: {"blocked": true, "rule_id": "SOC-104"}',
        )
        create_submitted = st.form_submit_button("Add security log", type="primary")
    if create_submitted:
        if min(len(create_source.strip()), len(create_event_type.strip())) < 2:
            st.warning("Source and event type must each contain at least 2 characters.")
            return
        if len(create_description.strip()) < 3:
            st.warning("Description must contain at least 3 characters.")
            return
        try:
            metadata = json.loads(metadata_text or "{}")
        except json.JSONDecodeError as error:
            st.warning(f"Metadata is not valid JSON: {error.msg}.")
            return
        if not isinstance(metadata, dict):
            st.warning("Metadata must be a JSON object.")
            return
        timestamp = datetime.combine(log_date, log_time, tzinfo=timezone.utc).isoformat()
        try:
            api.create_security_log(
                {
                    "incident_id": int(selected_create_incident),
                    "source": create_source.strip(),
                    "event_type": create_event_type.strip(),
                    "source_ip": source_ip.strip() or None,
                    "destination_ip": destination_ip.strip() or None,
                    "timestamp": timestamp,
                    "severity": create_severity,
                    "description": create_description.strip(),
                    "metadata": metadata,
                }
            )
            _reload("Security log added to MongoDB through the API.")
        except APIError as error:
            handle_api_error(error, "Security log creation failed")
