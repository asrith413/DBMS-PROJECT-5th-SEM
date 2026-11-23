from __future__ import annotations

import html
import json
from datetime import datetime
from typing import Any, Iterable

import pandas as pd
import streamlit as st

from services.api_client import APIError


def page_header(eyebrow: str, title: str, description: str) -> None:
    st.markdown(
        f"""
        <div class="cims-eyebrow">{html.escape(eyebrow)}</div>
        <h1 class="cims-page-title">{html.escape(title)}</h1>
        <p class="cims-page-copy">{html.escape(description)}</p>
        """,
        unsafe_allow_html=True,
    )


def status_pill(status: str) -> None:
    st.markdown(
        f'<span class="cims-status">{html.escape(status)}</span>',
        unsafe_allow_html=True,
    )


def format_datetime(value: str | None) -> str:
    if not value:
        return "-"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone().strftime("%d %b %Y, %H:%M")
    except (TypeError, ValueError):
        return str(value)


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)


def metric_grid(metrics: Iterable[tuple[str, Any]], columns: int = 3) -> None:
    items = list(metrics)
    for start in range(0, len(items), columns):
        row = items[start : start + columns]
        holders = st.columns(len(row))
        for holder, (label, value) in zip(holders, row):
            holder.metric(label, value)


def count_chart(items: list[dict[str, Any]], *, height: int = 300) -> None:
    if not items:
        st.caption("No data is available for this view.")
        return
    frame = pd.DataFrame(items)
    if not {"label", "count"}.issubset(frame.columns):
        st.caption("The report did not contain chartable data.")
        return
    st.bar_chart(frame.set_index("label")[["count"]], height=height)


def incident_frame(incidents: list[dict[str, Any]]) -> pd.DataFrame:
    rows = []
    for incident in incidents:
        sla = incident.get("sla") or {}
        remaining = sla.get("remaining_resolution_hours")
        if incident.get("status") in {"Resolved", "Closed"}:
            sla_value = "Breached" if sla.get("sla_breached") else "Completed"
        else:
            sla_value = "Breached" if sla.get("sla_breached") else (
                f"{float(remaining):.1f} h" if remaining is not None else "-"
            )
        rows.append(
            {
                "ID": incident.get("incident_id"),
                "Title": incident.get("title", ""),
                "Severity": (incident.get("severity") or {}).get("level", ""),
                "Status": incident.get("status", ""),
                "Type": (incident.get("incident_type") or {}).get("name", ""),
                "Reporter": (incident.get("reporter") or {}).get("name", ""),
                "Reported": format_datetime(incident.get("reported_date")),
                "SLA": sla_value,
            }
        )
    return pd.DataFrame(rows)


def set_flash(message: str, *, level: str = "success", scope: str | None = None) -> None:
    st.session_state["_cims_flash"] = {"message": message, "level": level, "scope": scope}


def show_flash(scope: str) -> None:
    flash = st.session_state.get("_cims_flash")
    if not flash or flash.get("scope") not in (None, scope):
        return
    st.session_state.pop("_cims_flash", None)
    renderer = getattr(st, flash.get("level", "info"), st.info)
    renderer(flash.get("message", ""))


def reset_invalid_selection(key: str, options: Iterable[Any]) -> None:
    valid_options = set(options)
    if key in st.session_state and st.session_state[key] not in valid_options:
        st.session_state.pop(key, None)


def handle_api_error(error: APIError, context: str) -> None:
    if error.status_code == 401:
        st.session_state.clear()
        st.session_state["_auth_notice"] = "Your session expired. Sign in again to continue."
        st.rerun()
    prefix = f"{context}: " if context else ""
    st.error(f"{prefix}{error.detail}")


def require_role(user: dict[str, Any], allowed: set[str]) -> bool:
    if user.get("role") in allowed:
        return True
    st.error("Your role does not permit access to this page.")
    return False
