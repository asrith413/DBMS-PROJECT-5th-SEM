from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st

from components.ui import (
    format_datetime,
    handle_api_error,
    page_header,
    reset_invalid_selection,
    set_flash,
    show_flash,
    status_pill,
)
from services.api_client import APIClient, APIError


NEXT_STATUS = {
    "Open": "Assigned",
    "Assigned": "Under Investigation",
    "Under Investigation": "In Progress",
    "In Progress": "Resolved",
    "Resolved": "Closed",
}


def _refresh(message: str) -> None:
    set_flash(message, scope="incident_details")
    st.rerun()


def _render_status_workflow(api: APIClient, incident: dict[str, Any], role: str) -> None:
    incident_id = int(incident["incident_id"])
    current_status = str(incident.get("status", ""))
    st.markdown("#### Workflow status")
    status_pill(current_status)
    next_status = NEXT_STATUS.get(current_status)
    if role not in {"ADMIN", "ANALYST"}:
        st.caption("Submitted incidents are read-only for reporters.")
        return
    if next_status is None:
        st.caption("This incident has reached the final Closed state.")
        return
    if current_status == "Open":
        st.caption("Create an analyst assignment below to move this incident to Assigned.")
        return
    st.caption(f"The API permits only the next transition: {current_status} to {next_status}.")
    if st.button(
        f"Advance to {next_status}",
        type="primary",
        key=f"incident_status_{incident_id}_{current_status}",
    ):
        try:
            api.update_incident(incident_id, {"status": next_status})
            _refresh(f"Incident #{incident_id} advanced to {next_status}.")
        except APIError as error:
            handle_api_error(error, "Status update failed")


def _render_assignments(api: APIClient, incident: dict[str, Any], role: str) -> None:
    incident_id = int(incident["incident_id"])
    assignments = incident.get("assignments") or []
    st.markdown("#### Assignments")
    if assignments:
        frame = pd.DataFrame(
            [
                {
                    "Analyst": item.get("analyst_name") or f"User #{item.get('analyst_id')}",
                    "Role": item.get("role", ""),
                    "Assigned": format_datetime(item.get("assigned_date")),
                }
                for item in assignments
            ]
        )
        st.dataframe(frame, hide_index=True, use_container_width=True)
    else:
        st.info("No analyst is assigned to this incident.")

    if role != "ADMIN" or incident.get("status") in {"Resolved", "Closed"}:
        return
    try:
        analysts = api.list_analysts()
    except APIError as error:
        handle_api_error(error, "Unable to load analysts for assignment")
        return
    assigned_ids = {int(item["analyst_id"]) for item in assignments}
    available = [item for item in analysts if int(item["user_id"]) not in assigned_ids]
    if not available:
        st.caption("Every available analyst is already assigned. The API does not support unassignment.")
        return
    analyst_by_id = {int(item["user_id"]): item for item in available}
    with st.form(f"incident_assignment_form_{incident_id}"):
        analyst_id = st.selectbox(
            "Assign analyst",
            options=list(analyst_by_id),
            format_func=lambda value: (
                f"{analyst_by_id[value]['user']['name']}  |  "
                f"workload {analyst_by_id[value]['workload']}  |  "
                f"{analyst_by_id[value]['expertise']}"
            ),
        )
        assignment_role = st.text_input("Assignment role", value="Primary Analyst", max_chars=100)
        submitted = st.form_submit_button("Create assignment", type="primary")
    if submitted:
        if len(assignment_role.strip()) < 2:
            st.warning("The assignment role must contain at least 2 characters.")
            return
        try:
            api.create_assignment(
                {
                    "incident_id": incident_id,
                    "analyst_id": int(analyst_id),
                    "role": assignment_role.strip(),
                }
            )
            _refresh("Analyst assignment created.")
        except APIError as error:
            handle_api_error(error, "Assignment failed")


def _render_admin_editor(api: APIClient, incident: dict[str, Any]) -> None:
    incident_id = int(incident["incident_id"])
    with st.expander("Edit incident classification and evidence"):
        try:
            incident_types = api.list_incident_types()
            severities = api.list_severities()
        except APIError as error:
            handle_api_error(error, "Unable to load incident editor reference data")
            return
        type_by_id = {int(item["type_id"]): item for item in incident_types}
        severity_by_id = {int(item["severity_id"]): item for item in severities}
        current_type = int((incident.get("incident_type") or {}).get("type_id", 0))
        current_severity = int((incident.get("severity") or {}).get("severity_id", 0))
        type_ids = list(type_by_id)
        severity_ids = list(severity_by_id)
        with st.form(f"incident_editor_{incident_id}"):
            title = st.text_input("Title", value=incident.get("title", ""), max_chars=200)
            description = st.text_area(
                "Description", value=incident.get("description", ""), height=180, max_chars=10000
            )
            selected_type = st.selectbox(
                "Incident type",
                type_ids,
                index=type_ids.index(current_type) if current_type in type_ids else 0,
                format_func=lambda value: type_by_id[value]["name"],
            )
            selected_severity = st.selectbox(
                "Severity",
                severity_ids,
                index=severity_ids.index(current_severity) if current_severity in severity_ids else 0,
                format_func=lambda value: severity_by_id[value]["level"],
            )
            submitted = st.form_submit_button("Save incident changes", type="primary")
        if submitted:
            payload: dict[str, Any] = {}
            if title.strip() != incident.get("title"):
                payload["title"] = title.strip()
            if description.strip() != incident.get("description"):
                payload["description"] = description.strip()
            if int(selected_type) != current_type:
                payload["type_id"] = int(selected_type)
            if int(selected_severity) != current_severity:
                payload["severity_id"] = int(selected_severity)
            if not payload:
                st.info("No incident fields changed.")
                return
            try:
                api.update_incident(incident_id, payload)
                _refresh("Incident fields updated.")
            except APIError as error:
                handle_api_error(error, "Incident update failed")


def _render_assets(api: APIClient, incident: dict[str, Any], role: str) -> None:
    incident_id = int(incident["incident_id"])
    is_terminal = incident.get("status") in {"Resolved", "Closed"}
    links = incident.get("assets") or []
    if links:
        for link in links:
            asset = link.get("asset") or {}
            left, middle, right = st.columns([2.3, 2, 1])
            with left:
                st.markdown(f"**{asset.get('name', 'Unknown asset')}**")
                st.caption(f"{asset.get('type', '-')} | {asset.get('department', '-')}")
            with middle:
                st.markdown(link.get("impact_type", "-"))
                st.caption(asset.get("ip_address") or "No IP address")
            with right:
                if role in {"ADMIN", "ANALYST"} and not is_terminal and st.button(
                    "Remove",
                    key=f"remove_asset_{incident_id}_{asset.get('asset_id')}",
                    use_container_width=True,
                ):
                    try:
                        api.remove_asset_association(int(asset["asset_id"]), incident_id)
                        _refresh("Asset association removed.")
                    except APIError as error:
                        handle_api_error(error, "Unable to remove asset association")
            st.divider()
    else:
        st.info("No assets are associated with this incident.")

    if role not in {"ADMIN", "ANALYST"}:
        return
    if is_terminal:
        st.caption("Asset associations are read-only after resolution.")
        return
    try:
        assets = api.list_assets()
    except APIError as error:
        handle_api_error(error, "Unable to load assets")
        return
    linked_ids = {int(item["asset_id"]) for item in links}
    available = [asset for asset in assets if int(asset["asset_id"]) not in linked_ids]
    if not available:
        st.caption("No additional assets are available to associate.")
        return
    asset_by_id = {int(item["asset_id"]): item for item in available}
    with st.form(f"incident_asset_link_{incident_id}"):
        asset_id = st.selectbox(
            "Asset",
            options=list(asset_by_id),
            format_func=lambda value: (
                f"{asset_by_id[value]['name']}  |  {asset_by_id[value]['type']}  |  "
                f"{asset_by_id[value].get('ip_address') or 'no IP'}"
            ),
        )
        impact_type = st.text_input(
            "Impact type", max_chars=120, placeholder="For example: Credentials targeted"
        )
        submitted = st.form_submit_button("Associate asset", type="primary")
    if submitted:
        if len(impact_type.strip()) < 2:
            st.warning("The impact type must contain at least 2 characters.")
            return
        try:
            api.associate_asset(int(asset_id), incident_id, impact_type.strip())
            _refresh("Asset associated with the incident.")
        except APIError as error:
            handle_api_error(error, "Asset association failed")


def _render_actions(api: APIClient, incident: dict[str, Any], role: str) -> None:
    incident_id = int(incident["incident_id"])
    actions = incident.get("actions") or []
    if actions:
        for action in actions:
            performer = action.get("performer") or {}
            st.markdown(f"**{performer.get('name', 'Unknown user')}**")
            st.caption(format_datetime(action.get("action_date")))
            st.write(action.get("description", ""))
            st.divider()
    else:
        st.info("No investigation actions have been recorded.")

    if role not in {"ADMIN", "ANALYST"}:
        return
    if incident.get("status") in {"Resolved", "Closed"}:
        st.caption("Investigation actions are read-only after resolution.")
        return
    with st.form(f"incident_action_form_{incident_id}", clear_on_submit=True):
        description = st.text_area(
            "New investigation action",
            max_chars=4000,
            placeholder="Record a concrete investigative or containment action.",
        )
        submitted = st.form_submit_button("Add action", type="primary")
    if submitted:
        if len(description.strip()) < 3:
            st.warning("The action must contain at least 3 characters.")
            return
        try:
            api.add_action(incident_id, description.strip())
            _refresh("Investigation action recorded.")
        except APIError as error:
            handle_api_error(error, "Unable to add action")


def _render_delete_control(api: APIClient, incident: dict[str, Any]) -> None:
    incident_id = int(incident["incident_id"])
    with st.expander("Deletion controls"):
        st.warning(
            "The API rejects deletion when audit or related history exists. This preserves the evidence chain."
        )
        confirmed = st.checkbox(
            f"I understand and want to request deletion of incident #{incident_id}",
            key=f"confirm_delete_incident_{incident_id}",
        )
        if st.button(
            "Request incident deletion",
            disabled=not confirmed,
            key=f"delete_incident_{incident_id}",
        ):
            try:
                response = api.delete_incident(incident_id)
                st.session_state.pop("selected_incident_id", None)
                set_flash(response.get("message", "Incident deleted."), scope="incidents")
                st.rerun()
            except APIError as error:
                handle_api_error(error, "Incident deletion was rejected")


def _render_security_logs(api: APIClient, incident_id: int, role: str) -> None:
    if role not in {"ADMIN", "ANALYST"}:
        st.info("Security telemetry is available to assigned analysts and administrators.")
        return
    try:
        records = api.list_security_logs(incident_id=incident_id, limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load related security logs")
        return
    if not records:
        st.info("No MongoDB security logs are linked to this incident.")
        return
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Timestamp": format_datetime(item.get("timestamp")),
                    "Severity": item.get("severity"),
                    "Source": item.get("source"),
                    "Event type": item.get("event_type"),
                    "Source IP": item.get("source_ip") or "-",
                    "Destination IP": item.get("destination_ip") or "-",
                    "Description": item.get("description"),
                }
                for item in records
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )


def _render_audit_history(api: APIClient, incident_id: int, role: str) -> None:
    if role not in {"ADMIN", "ANALYST"}:
        st.info("Audit history is available to assigned analysts and administrators.")
        return
    try:
        records = api.list_audit_logs(incident_id=incident_id, limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load incident audit history")
        return
    if not records:
        st.info("No audit history is available for this incident.")
        return
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Log ID": item.get("log_id"),
                    "Timestamp": format_datetime(item.get("timestamp")),
                    "Action": item.get("action_type"),
                    "User": (item.get("performer") or {}).get("name", ""),
                    "Hash": str(item.get("hash", ""))[:16] + "...",
                }
                for item in records
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )


def render_incident_details(api: APIClient, user: dict[str, Any]) -> None:
    show_flash("incident_details")
    role = user.get("role", "")
    try:
        available_incidents = api.list_incidents(limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load accessible incidents")
        return

    selected_from_state = st.session_state.get("selected_incident_id")
    incident_by_id = {int(item["incident_id"]): item for item in available_incidents}
    options = list(incident_by_id)
    if selected_from_state is not None and int(selected_from_state) not in options:
        options.insert(0, int(selected_from_state))
    if not options:
        page_header(
            "Case record",
            "Incident Details",
            "Inspect evidence, workflow history, assignments, assets, and investigation actions.",
        )
        st.info("No incident is available for your account.")
        return

    selector_key = "incident_details_selector"
    reset_invalid_selection(selector_key, options)
    default_id = int(selected_from_state) if selected_from_state in options else options[0]
    selected_id = st.selectbox(
        "Incident record",
        options=options,
        index=options.index(default_id),
        format_func=lambda value: (
            f"#{value}  {incident_by_id[value]['title']}" if value in incident_by_id else f"#{value}"
        ),
        key=selector_key,
    )
    st.session_state["selected_incident_id"] = int(selected_id)
    try:
        incident = api.get_incident(int(selected_id))
    except APIError as error:
        handle_api_error(error, "Unable to load incident details")
        return

    page_header(
        f"Incident #{incident['incident_id']}",
        incident.get("title", "Incident Details"),
        "Authoritative case data, relationships, SLA state, and permitted workflow actions.",
    )

    sla = incident.get("sla") or {}
    first, second, third, fourth = st.columns(4)
    first.metric("Status", incident.get("status", "-"))
    second.metric("Severity", (incident.get("severity") or {}).get("level", "-"))
    third.metric("Type", (incident.get("incident_type") or {}).get("name", "-"))
    if incident.get("status") in {"Resolved", "Closed"}:
        resolution_sla = "Breached" if sla.get("resolution_breached") else "Completed"
    else:
        resolution_sla = (
            "Breached"
            if sla.get("resolution_breached")
            else f"{float(sla.get('remaining_resolution_hours', 0)):.1f} h left"
        )
    fourth.metric(
        "Resolution SLA",
        resolution_sla,
    )

    st.markdown("#### Incident description")
    st.write(incident.get("description", ""))
    meta_left, meta_middle, meta_right = st.columns(3)
    meta_left.caption(f"Reporter: {(incident.get('reporter') or {}).get('name', '-')}")
    meta_middle.caption(f"Reported: {format_datetime(incident.get('reported_date'))}")
    meta_right.caption(f"Resolved: {format_datetime(incident.get('resolved_date'))}")

    overview_tab, assets_tab, actions_tab, logs_tab, audit_tab = st.tabs(
        ["Workflow & evidence", "Associated assets", "Actions", "Security logs", "Audit history"]
    )
    with overview_tab:
        left, right = st.columns([1, 1.25])
        with left:
            _render_status_workflow(api, incident, role)
            st.markdown("#### SLA deadlines")
            st.write(f"Response: {format_datetime(sla.get('response_deadline'))}")
            st.write(f"Resolution: {format_datetime(sla.get('resolution_deadline'))}")
            if sla.get("sla_breached"):
                st.error("One or more SLA targets are breached.")
        with right:
            if role == "REPORTER":
                st.info("Assignment details are restricted to SOC personnel.")
            else:
                _render_assignments(api, incident, role)

        if role != "REPORTER":
            threat_links = incident.get("threat_actors") or []
            st.markdown("#### Linked threat actors")
            if threat_links:
                for link in threat_links:
                    actor = link.get("threat_actor") or {}
                    st.write(f"**{actor.get('alias', 'Unknown')}**: {actor.get('description', '')}")
            else:
                st.caption("No threat actors are linked to this incident.")

        if role == "ADMIN" and incident.get("status") not in {"Resolved", "Closed"}:
            _render_admin_editor(api, incident)
        if role == "ADMIN":
            _render_delete_control(api, incident)

    with assets_tab:
        if role == "REPORTER":
            st.info("Affected asset details are restricted to SOC personnel.")
        else:
            _render_assets(api, incident, role)
    with actions_tab:
        if role == "REPORTER":
            st.info("Investigation actions are restricted to SOC personnel.")
        else:
            _render_actions(api, incident, role)
    with logs_tab:
        _render_security_logs(api, int(incident["incident_id"]), role)
    with audit_tab:
        _render_audit_history(api, int(incident["incident_id"]), role)
