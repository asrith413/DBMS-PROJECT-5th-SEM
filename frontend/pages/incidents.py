from __future__ import annotations

import hashlib
import html
from typing import Any, Callable

import streamlit as st

from components.ui import (
    handle_api_error,
    incident_frame,
    page_header,
    reset_invalid_selection,
    set_flash,
    show_flash,
)
from services.api_client import APIClient, APIError


STATUSES = ["Open", "Assigned", "Under Investigation", "In Progress", "Resolved", "Closed"]


def _text_fingerprint(title: str, description: str, type_id: int | None) -> str:
    content = f"{title.strip()}\n{description.strip()}\n{type_id or 0}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _create_incident_panel(
    api: APIClient,
    incident_types: list[dict[str, Any]],
    severities: list[dict[str, Any]],
    open_incident: Callable[[int], None],
) -> None:
    with st.expander("Report a new incident", expanded=False):
        if not incident_types or not severities:
            st.warning("Incident types and severity levels must be available before a report can be filed.")
            return

        version = int(st.session_state.get("incident_create_version", 0))
        type_by_id = {int(item["type_id"]): item for item in incident_types}
        severity_by_id = {int(item["severity_id"]): item for item in severities}

        st.markdown("**1. Incident evidence**")
        title = st.text_input(
            "Title",
            max_chars=200,
            placeholder="Concise description of the observed event",
            key=f"incident_create_title_{version}",
        )
        description = st.text_area(
            "Description",
            height=150,
            max_chars=10000,
            placeholder="Describe what happened, when it was observed, and the affected context.",
            key=f"incident_create_description_{version}",
        )
        type_id = st.selectbox(
            "Incident type",
            options=list(type_by_id),
            format_func=lambda value: type_by_id[value]["name"],
            key=f"incident_create_type_{version}",
        )

        st.markdown("**2. ML advisory**")
        st.caption("The model is advisory only. It never writes the final severity field.")
        fingerprint = _text_fingerprint(title, description, type_id)
        if st.button("Generate severity suggestion", key=f"incident_suggest_{version}"):
            if len(title.strip()) < 3 or len(description.strip()) < 5:
                st.warning("Enter a title and at least 5 characters of description before requesting a suggestion.")
            else:
                try:
                    suggestion = api.suggest_severity(
                        {
                            "title": title.strip(),
                            "description": description.strip(),
                            "incident_type": type_by_id[int(type_id)]["name"],
                        }
                    )
                    st.session_state["incident_ml_suggestion"] = {
                        "fingerprint": fingerprint,
                        "result": suggestion,
                    }
                except APIError as error:
                    handle_api_error(error, "Severity suggestion failed")

        stored_suggestion = st.session_state.get("incident_ml_suggestion") or {}
        if stored_suggestion.get("fingerprint") == fingerprint:
            result = stored_suggestion.get("result", {})
            confidence = float(result.get("confidence", 0.0))
            suggested_severity = html.escape(str(result.get("suggested_severity", "Unavailable")))
            st.markdown(
                f"""
                <div class="cims-advisory">
                    <div class="cims-advisory-label">ML severity suggestion</div>
                    <div class="cims-advisory-value">{suggested_severity}</div>
                    <div>Confidence: {confidence:.1%}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.caption(result.get("disclaimer", ""))
        else:
            st.info("No current ML suggestion. Generate one after entering the incident evidence.")

        st.markdown("**3. Final severity selection**")
        st.caption("This manual selection is the severity submitted to CIMS, independent of the ML suggestion.")
        severity_id = st.selectbox(
            "Final severity",
            options=list(severity_by_id),
            format_func=lambda value: (
                f"{severity_by_id[value]['level']}  |  "
                f"response {severity_by_id[value]['response_sla_hours']}h, "
                f"resolution {severity_by_id[value]['resolution_sla_hours']}h"
            ),
            key=f"incident_create_severity_{version}",
        )

        if st.button(
            "Submit incident",
            type="primary",
            use_container_width=True,
            key=f"incident_create_submit_{version}",
        ):
            if len(title.strip()) < 3:
                st.warning("The title must contain at least 3 characters.")
                return
            if len(description.strip()) < 10:
                st.warning("The description must contain at least 10 characters.")
                return
            try:
                created = api.create_incident(
                    {
                        "title": title.strip(),
                        "description": description.strip(),
                        "type_id": int(type_id),
                        "severity_id": int(severity_id),
                    }
                )
                st.session_state["incident_create_version"] = version + 1
                st.session_state.pop("incident_ml_suggestion", None)
                set_flash(
                    f"Incident #{created['incident_id']} was created successfully.",
                    scope="incident_details",
                )
                open_incident(int(created["incident_id"]))
            except APIError as error:
                handle_api_error(error, "Incident creation failed")


def render_incidents(
    api: APIClient,
    user: dict[str, Any],
    open_incident: Callable[[int], None],
) -> None:
    show_flash("incidents")
    page_header(
        "Case operations",
        "Incident Management",
        "Report incidents, apply API-supported filters, and move into the complete investigation record.",
    )

    incident_types: list[dict[str, Any]] = []
    severities: list[dict[str, Any]] = []
    try:
        incident_types = api.list_incident_types()
        severities = api.list_severities()
    except APIError as error:
        handle_api_error(error, "Unable to load incident reference data")

    if user.get("role") in {"ADMIN", "REPORTER"}:
        _create_incident_panel(api, incident_types, severities, open_incident)

    st.subheader("Incident queue")
    type_by_id = {int(item["type_id"]): item for item in incident_types}
    severity_by_id = {int(item["severity_id"]): item for item in severities}
    with st.container(border=True):
        first, second, third, fourth = st.columns([1.2, 1, 1, 1.6])
        with first:
            selected_status = st.selectbox(
                "Status", ["All statuses", *STATUSES], key="incident_filter_status"
            )
        with second:
            selected_severity = st.selectbox(
                "Severity",
                [0, *severity_by_id],
                format_func=lambda value: "All severities" if value == 0 else severity_by_id[value]["level"],
                key="incident_filter_severity",
            )
        with third:
            selected_type = st.selectbox(
                "Type",
                [0, *type_by_id],
                format_func=lambda value: "All types" if value == 0 else type_by_id[value]["name"],
                key="incident_filter_type",
            )
        with fourth:
            search = st.text_input(
                "Search",
                max_chars=200,
                placeholder="Title or description",
                key="incident_filter_search",
            )

    try:
        incidents = api.list_incidents(
            status=None if selected_status == "All statuses" else selected_status,
            severity_id=None if selected_severity == 0 else int(selected_severity),
            type_id=None if selected_type == 0 else int(selected_type),
            search=search.strip() or None,
            limit=200,
        )
    except APIError as error:
        handle_api_error(error, "Unable to load incidents")
        return

    if not incidents:
        st.info("No incidents match the current filters.")
        return

    st.caption(f"Showing {len(incidents)} incident(s). The API caps this view at 200 records.")
    st.dataframe(incident_frame(incidents), hide_index=True, use_container_width=True)
    incident_by_id = {int(item["incident_id"]): item for item in incidents}
    reset_invalid_selection("incident_management_selector", incident_by_id)
    chosen_id = st.selectbox(
        "Incident to inspect",
        options=list(incident_by_id),
        format_func=lambda value: (
            f"#{value}  {incident_by_id[value]['title']}  |  {incident_by_id[value]['status']}"
        ),
        key="incident_management_selector",
    )
    if st.button("Open incident details", type="primary", key="incident_management_open"):
        open_incident(int(chosen_id))
