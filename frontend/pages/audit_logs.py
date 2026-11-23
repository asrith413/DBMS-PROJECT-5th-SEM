from __future__ import annotations

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
    show_flash,
)
from services.api_client import APIClient, APIError


def render_audit_logs(api: APIClient, user: dict[str, Any]) -> None:
    if not require_role(user, {"ADMIN", "ANALYST"}):
        return
    show_flash("audit_logs")
    role = user.get("role", "")
    page_header(
        "Tamper-evident history",
        "Audit Logs",
        "Review tamper-evident incident activity and, for administrators, verify the complete hash chain.",
    )

    if role == "ADMIN":
        verification: dict[str, Any] | None = None
        with st.container(border=True):
            left, right = st.columns([2.4, 1])
            with left:
                st.markdown("**Audit chain integrity**")
                st.caption("Verification recalculates the complete ordered hash chain in the API.")
            with right:
                verify_clicked = st.button(
                    "Verify integrity", type="primary", use_container_width=True, key="verify_audit_chain"
                )
        if verify_clicked:
            try:
                verification = api.verify_audit_integrity()
            except APIError as error:
                handle_api_error(error, "Audit integrity verification failed")
        if verification:
            if verification.get("integrity_valid"):
                st.success(
                    f"Integrity valid. {verification.get('records_checked', 0)} record(s) verified."
                )
            else:
                st.error(
                    "Integrity failure detected. First invalid log ID: "
                    f"{verification.get('first_invalid_log_id')}."
                )

    try:
        incidents = api.list_incidents(limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load incidents for audit access")
        return
    incident_by_id = {int(item["incident_id"]): item for item in incidents}
    incident_ids = list(incident_by_id)
    if role == "ANALYST" and not incident_ids:
        st.info("No assigned incidents are available for audit review.")
        return

    with st.form("audit_log_filters"):
        options = ([0] if role == "ADMIN" else []) + incident_ids
        selected_incident = st.selectbox(
            "Incident",
            options=options,
            format_func=lambda value: (
                "All incidents" if value == 0 else f"#{value}  {incident_by_id[value]['title']}"
            ),
        )
        limit = st.selectbox("Result limit", [50, 100, 200, 500, 1000], index=2)
        st.form_submit_button("Apply audit filter", type="primary")

    incident_filter = None if selected_incident == 0 else int(selected_incident)
    try:
        records = api.list_audit_logs(incident_id=incident_filter, limit=int(limit))
    except APIError as error:
        handle_api_error(error, "Audit log query failed")
        return
    if not records:
        st.info("No audit records match this filter.")
        return

    frame = pd.DataFrame(
        [
            {
                "Log ID": item.get("log_id"),
                "Timestamp": format_datetime(item.get("timestamp")),
                "Incident": item.get("incident_id"),
                "Action": item.get("action_type", ""),
                "Performer": (item.get("performer") or {}).get("name", ""),
                "Action data": json_text(item.get("action_data") or {}),
                "Hash": str(item.get("hash", ""))[:16] + "...",
            }
            for item in records
        ]
    )
    st.dataframe(frame, hide_index=True, use_container_width=True)
    record_by_id = {int(item["log_id"]): item for item in records}
    reset_invalid_selection("audit_record_selector", record_by_id)
    selected_log_id = st.selectbox(
        "Inspect complete audit record", options=list(record_by_id), key="audit_record_selector"
    )
    selected = record_by_id[int(selected_log_id)]
    with st.expander("Audit record evidence", expanded=False):
        st.write(f"**Hash:** `{selected.get('hash', '')}`")
        st.write(f"**Previous hash:** `{selected.get('prev_hash', '')}`")
        st.write("**Action data**")
        st.json(selected.get("action_data") or {})
