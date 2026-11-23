from __future__ import annotations

from typing import Any, Callable
from collections import Counter
from datetime import datetime

import streamlit as st

from components.ui import (
    count_chart,
    handle_api_error,
    incident_frame,
    metric_grid,
    page_header,
    reset_invalid_selection,
    show_flash,
)
from services.api_client import APIClient, APIError


def _local_summary(incidents: list[dict[str, Any]]) -> dict[str, int]:
    terminal = {"Resolved", "Closed"}
    return {
        "total_incidents": len(incidents),
        "open_incidents": sum(item.get("status") not in terminal for item in incidents),
        "resolved_incidents": sum(item.get("status") in terminal for item in incidents),
        "critical_incidents": sum(
            (item.get("severity") or {}).get("level", "").lower() == "critical"
            for item in incidents
        ),
        "sla_breaches": sum(bool((item.get("sla") or {}).get("sla_breached")) for item in incidents),
    }


def _count_items(values: list[str]) -> list[dict[str, Any]]:
    return [
        {"label": label, "count": count}
        for label, count in Counter(values).most_common()
    ]


def _local_charts(incidents: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    months: list[str] = []
    for item in incidents:
        value = str(item.get("reported_date", ""))
        try:
            months.append(datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%Y-%m"))
        except ValueError:
            continue
    return {
        "incidents_by_status": _count_items([str(item.get("status", "Unknown")) for item in incidents]),
        "incidents_by_severity": _count_items(
            [str((item.get("severity") or {}).get("level", "Unknown")) for item in incidents]
        ),
        "incidents_by_type": _count_items(
            [str((item.get("incident_type") or {}).get("name", "Unknown")) for item in incidents]
        ),
        "monthly_trends": [
            {"label": label, "count": count}
            for label, count in sorted(Counter(months).items())
        ],
    }


def render_dashboard(
    api: APIClient,
    user: dict[str, Any],
    open_incident: Callable[[int], None],
) -> None:
    show_flash("dashboard")
    role = user.get("role", "")
    scope = "organization" if role == "ADMIN" else "your accessible queue"
    page_header(
        "SOC overview",
        f"Welcome, {user.get('name', 'Operator')}",
        f"Current operational posture across {scope}. Metrics are sourced from the CIMS API.",
    )

    try:
        incidents = api.list_incidents(limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load the incident queue")
        return

    report: dict[str, Any] | None = None
    if role == "ADMIN":
        try:
            report = api.dashboard_report()
        except APIError as error:
            handle_api_error(error, "Unable to load organization report metrics")

    summary = report or _local_summary(incidents)
    metrics = [
        ("Total incidents", summary.get("total_incidents", 0)),
        ("Active", summary.get("open_incidents", 0)),
        ("Resolved / closed", summary.get("resolved_incidents", 0)),
        ("Critical", summary.get("critical_incidents", 0)),
        ("SLA breaches", summary.get("sla_breaches", 0)),
    ]
    if report is not None:
        metrics.append(("Analysts", report.get("analyst_count", 0)))
    metric_grid(metrics)

    chart_data = report or _local_charts(incidents)
    st.subheader("Operational distribution")
    left, right = st.columns(2)
    with left:
        st.caption("INCIDENTS BY STATUS")
        count_chart(chart_data.get("incidents_by_status", []), height=260)
    with right:
        st.caption("INCIDENTS BY SEVERITY")
        count_chart(chart_data.get("incidents_by_severity", []), height=260)
    left, right = st.columns(2)
    with left:
        st.caption("INCIDENTS BY TYPE")
        count_chart(chart_data.get("incidents_by_type", []), height=260)
    with right:
        st.caption("MONTHLY TREND")
        count_chart(chart_data.get("monthly_trends", []), height=260)

    st.subheader("Recent incident queue")
    recent = incidents[:10]
    if not recent:
        st.info("No incidents are available for your account.")
        return
    st.dataframe(incident_frame(recent), hide_index=True, use_container_width=True)
    incident_by_id = {int(item["incident_id"]): item for item in recent}
    reset_invalid_selection("dashboard_incident_selector", incident_by_id)
    selected_id = st.selectbox(
        "Inspect an incident",
        options=list(incident_by_id),
        format_func=lambda value: f"#{value}  {incident_by_id[value].get('title', '')}",
        key="dashboard_incident_selector",
    )
    if st.button("Open incident record", type="primary", key="dashboard_open_incident"):
        open_incident(int(selected_id))
