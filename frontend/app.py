from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import streamlit as st


FRONTEND_ROOT = Path(__file__).resolve().parent
if str(FRONTEND_ROOT) not in sys.path:
    sys.path.insert(0, str(FRONTEND_ROOT))

from components.styles import apply_global_styles
from components.ui import handle_api_error
from pages.analysts import render_analysts
from pages.assets import render_assets
from pages.audit_logs import render_audit_logs
from pages.dashboard import render_dashboard
from pages.incident_details import render_incident_details
from pages.incidents import render_incidents
from pages.reports import render_reports
from pages.security_logs import render_security_logs
from services.api_client import APIClient, APIError, get_api_base_url


st.set_page_config(
    page_title="CIMS | SOC Console",
    layout="wide",
    initial_sidebar_state="expanded",
)
apply_global_styles()


def _clear_session() -> None:
    st.session_state.clear()


def _render_login() -> None:
    left, center, right = st.columns([1, 1.15, 1])
    with center:
        st.markdown(
            """
            <div class="cims-brand">
                <strong>CIMS</strong>
                <small>Cybersecurity Incident Management System</small>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("## SOC Console Access")
        st.caption("Authenticate with your CIMS account. Credentials are sent only to the configured API.")
        notice = st.session_state.pop("_auth_notice", None)
        if notice:
            st.warning(notice)
        with st.form("cims_login_form"):
            email = st.text_input(
                "Email address",
                placeholder="operator@example.com",
                autocomplete="email",
            )
            password = st.text_input(
                "Password",
                type="password",
                autocomplete="current-password",
            )
            submitted = st.form_submit_button("Sign in", type="primary", use_container_width=True)
        if submitted:
            if not email.strip() or not password:
                st.warning("Enter both email address and password.")
                return
            try:
                response = APIClient(get_api_base_url()).login(email.strip(), password)
            except APIError as error:
                st.error(error.detail)
                return
            token = response.get("access_token")
            user = response.get("user")
            if not token or not isinstance(user, dict):
                st.error("The login response did not include a valid token and user profile.")
                return
            st.session_state["access_token"] = token
            st.session_state["current_user"] = user
            st.rerun()
        st.caption(f"API: {get_api_base_url()}")


def _authenticated_app(token: str, user: dict[str, Any]) -> None:
    api = APIClient(get_api_base_url(), token=token)
    try:
        refreshed_user = api.current_user()
    except APIError as error:
        handle_api_error(error, "Unable to refresh the current account")
        return
    if refreshed_user != user:
        st.session_state["current_user"] = refreshed_user
        user = refreshed_user

    def incident_details_view() -> None:
        render_incident_details(api, user)

    details_page = st.Page(
        incident_details_view,
        title="Incident Details",
        url_path="incident-details",
    )

    def open_incident(incident_id: int) -> None:
        st.session_state["selected_incident_id"] = int(incident_id)
        st.session_state.pop("incident_details_selector", None)
        st.switch_page(details_page)

    def dashboard_view() -> None:
        render_dashboard(api, user, open_incident)

    def incident_management_view() -> None:
        render_incidents(api, user, open_incident)

    dashboard_page = st.Page(
        dashboard_view,
        title="Dashboard",
        url_path="dashboard",
        default=True,
    )
    incident_page = st.Page(
        incident_management_view,
        title="Incident Management",
        url_path="incidents",
    )
    navigation_pages = [dashboard_page, incident_page, details_page]

    role = user.get("role")
    if role == "ADMIN":
        navigation_pages.extend(
            [
                st.Page(
                    lambda: render_analysts(api, user),
                    title="Analyst Management",
                    url_path="analysts",
                ),
                st.Page(
                    lambda: render_assets(api, user),
                    title="Asset Management",
                    url_path="assets",
                ),
                st.Page(
                    lambda: render_security_logs(api, user),
                    title="Security Logs",
                    url_path="security-logs",
                ),
                st.Page(
                    lambda: render_audit_logs(api, user),
                    title="Audit Logs",
                    url_path="audit-logs",
                ),
                st.Page(
                    lambda: render_reports(api, user),
                    title="Reports",
                    url_path="reports",
                ),
            ]
        )
    elif role == "ANALYST":
        navigation_pages.extend(
            [
                st.Page(
                    lambda: render_assets(api, user),
                    title="Asset Management",
                    url_path="assets",
                ),
                st.Page(
                    lambda: render_security_logs(api, user),
                    title="Security Logs",
                    url_path="security-logs",
                ),
                st.Page(
                    lambda: render_audit_logs(api, user),
                    title="Audit Logs",
                    url_path="audit-logs",
                ),
            ]
        )
    elif role != "REPORTER":
        _clear_session()
        st.session_state["_auth_notice"] = "The account returned an unsupported role."
        st.rerun()

    selected_page = st.navigation(navigation_pages, position="sidebar")
    with st.sidebar:
        st.markdown(
            """
            <div class="cims-brand">
                <strong>CIMS</strong>
                <small>SOC operations console</small>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(f"**{user.get('name', 'User')}**")
        st.caption(f"{role} | {user.get('department') or 'No department'}")
        if st.button("Sign out", use_container_width=True, key="sign_out"):
            _clear_session()
            st.rerun()
        st.caption(f"API: {get_api_base_url()}")
    selected_page.run()


token = st.session_state.get("access_token")
current_user = st.session_state.get("current_user")
if not token or not isinstance(current_user, dict):
    login_page = st.Page(_render_login, title="Sign in", default=True)
    st.navigation([login_page], position="hidden").run()
else:
    _authenticated_app(str(token), current_user)
