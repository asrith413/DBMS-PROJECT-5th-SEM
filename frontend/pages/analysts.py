from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st

from components.ui import (
    handle_api_error,
    metric_grid,
    page_header,
    require_role,
    reset_invalid_selection,
    set_flash,
    show_flash,
)
from services.api_client import APIClient, APIError


def _reload(message: str) -> None:
    set_flash(message, scope="analysts")
    st.rerun()


def render_analysts(api: APIClient, user: dict[str, Any]) -> None:
    if not require_role(user, {"ADMIN"}):
        return
    show_flash("analysts")
    page_header(
        "Workforce administration",
        "Analyst Management",
        "Provision analyst accounts and profiles, maintain expertise, and monitor current workload.",
    )

    try:
        analysts = api.list_analysts()
    except APIError as error:
        handle_api_error(error, "Unable to load analysts")
        return
    try:
        users = api.list_users()
    except APIError as error:
        handle_api_error(error, "Unable to load users")
        users = []
    try:
        assignments = api.list_assignments()
        incidents = api.list_incidents(limit=200)
    except APIError as error:
        handle_api_error(error, "Unable to load analyst assignment details")
        assignments = []
        incidents = []
    incident_titles = {int(item["incident_id"]): item.get("title", "") for item in incidents}
    assigned_by_analyst: dict[int, list[str]] = {}
    for assignment in assignments:
        analyst_id = int(assignment["analyst_id"])
        incident_id = int(assignment["incident_id"])
        label = f"#{incident_id} {incident_titles.get(incident_id, '')}".strip()
        assigned_by_analyst.setdefault(analyst_id, []).append(label)

    metric_grid(
        [
            ("Analyst profiles", len(analysts)),
            ("Active assignments", sum(int(item.get("workload", 0)) for item in analysts)),
            ("Unprofiled analyst users", len(
                [
                    item
                    for item in users
                    if item.get("role") == "ANALYST"
                    and int(item["user_id"]) not in {int(a["user_id"]) for a in analysts}
                ]
            )),
        ]
    )

    roster_tab, assignment_tab, provision_tab, maintain_tab = st.tabs(
        ["Analyst roster", "Assign incident", "Provision analyst", "Maintain profiles"]
    )
    with roster_tab:
        if not analysts:
            st.info("No analyst profiles exist.")
        else:
            rows = [
                {
                    "User ID": item.get("user_id"),
                    "Name": (item.get("user") or {}).get("name", ""),
                    "Email": (item.get("user") or {}).get("email", ""),
                    "Expertise": item.get("expertise", ""),
                    "Workload": item.get("workload", 0),
                    "Assigned incidents": ", ".join(
                        assigned_by_analyst.get(int(item["user_id"]), [])
                    ) or "-",
                }
                for item in analysts
            ]
            st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
            st.caption("Workload is maintained by the assignment and resolution workflow in the API.")

    with assignment_tab:
        active_incidents = [
            item for item in incidents if item.get("status") not in {"Resolved", "Closed"}
        ]
        if not analysts or not active_incidents:
            st.info("At least one analyst profile and one active incident are required.")
        else:
            incident_by_id = {int(item["incident_id"]): item for item in active_incidents}
            analyst_by_id = {int(item["user_id"]): item for item in analysts}
            assigned_pairs = {
                (int(item["incident_id"]), int(item["analyst_id"]))
                for item in assignments
            }
            selected_incident_id = st.selectbox(
                "Incident",
                options=list(incident_by_id),
                format_func=lambda value: (
                    f"#{value}  {incident_by_id[value]['title']}  |  "
                    f"{incident_by_id[value]['status']}"
                ),
                key="analyst_assignment_incident",
            )
            available_analysts = {
                analyst_id: item
                for analyst_id, item in analyst_by_id.items()
                if (int(selected_incident_id), analyst_id) not in assigned_pairs
            }
            if not available_analysts:
                st.caption("Every analyst is already assigned to this incident.")
            else:
                with st.form("analyst_management_assignment"):
                    selected_analyst_id = st.selectbox(
                        "Analyst",
                        options=list(available_analysts),
                        format_func=lambda value: (
                            f"{available_analysts[value]['user']['name']}  |  "
                            f"workload {available_analysts[value]['workload']}"
                        ),
                    )
                    assignment_role = st.text_input(
                        "Assignment role", value="Primary Analyst", max_chars=100
                    )
                    assignment_submitted = st.form_submit_button(
                        "Create assignment", type="primary"
                    )
                if assignment_submitted:
                    if len(assignment_role.strip()) < 2:
                        st.warning("The assignment role must contain at least 2 characters.")
                    else:
                        try:
                            api.create_assignment(
                                {
                                    "incident_id": int(selected_incident_id),
                                    "analyst_id": int(selected_analyst_id),
                                    "role": assignment_role.strip(),
                                }
                            )
                            _reload("Incident assignment created.")
                        except APIError as error:
                            handle_api_error(error, "Assignment failed")

    with provision_tab:
        st.markdown("#### Create an analyst account and profile")
        st.caption("This performs POST /users followed by POST /analysts using the new user ID.")
        with st.form("provision_analyst_account"):
            name = st.text_input("Full name", max_chars=120)
            email = st.text_input("Email address", max_chars=255)
            password = st.text_input("Temporary password", type="password", max_chars=128)
            department = st.text_input("Department", max_chars=120)
            expertise = st.text_input(
                "Expertise", max_chars=255, placeholder="For example: Endpoint forensics and malware triage"
            )
            submitted = st.form_submit_button("Create analyst", type="primary")
        if submitted:
            if len(name.strip()) < 2 or "@" not in email:
                st.warning("Enter a valid name and email address.")
            elif len(password) < 8:
                st.warning("The temporary password must contain at least 8 characters.")
            elif len(expertise.strip()) < 2:
                st.warning("Expertise must contain at least 2 characters.")
            else:
                try:
                    created_user = api.create_user(
                        {
                            "name": name.strip(),
                            "email": email.strip().lower(),
                            "password": password,
                            "role": "ANALYST",
                            "department": department.strip() or None,
                        }
                    )
                except APIError as error:
                    handle_api_error(error, "Analyst account creation failed")
                else:
                    try:
                        api.create_analyst(int(created_user["user_id"]), expertise.strip())
                        _reload(f"Analyst profile created for {created_user['name']}.")
                    except APIError as error:
                        st.error(
                            "The user account was created, but its analyst profile could not be created. "
                            "Use the attach form below to complete provisioning."
                        )
                        handle_api_error(error, "Profile creation failed")

        profile_ids = {int(item["user_id"]) for item in analysts}
        candidates = [
            item
            for item in users
            if item.get("role") == "ANALYST" and int(item["user_id"]) not in profile_ids
        ]
        st.markdown("#### Attach a profile to an existing analyst user")
        if not candidates:
            st.caption("No unprofiled users with the ANALYST role are available.")
        else:
            user_by_id = {int(item["user_id"]): item for item in candidates}
            with st.form("attach_analyst_profile"):
                selected_user_id = st.selectbox(
                    "Analyst user",
                    options=list(user_by_id),
                    format_func=lambda value: (
                        f"{user_by_id[value]['name']}  |  {user_by_id[value]['email']}"
                    ),
                )
                attached_expertise = st.text_input("Profile expertise", max_chars=255)
                attach_submitted = st.form_submit_button("Attach profile")
            if attach_submitted:
                if len(attached_expertise.strip()) < 2:
                    st.warning("Expertise must contain at least 2 characters.")
                else:
                    try:
                        api.create_analyst(int(selected_user_id), attached_expertise.strip())
                        _reload("Analyst profile attached.")
                    except APIError as error:
                        handle_api_error(error, "Unable to attach analyst profile")

    with maintain_tab:
        if not analysts:
            st.info("There are no profiles to maintain.")
            return
        analyst_by_id = {int(item["user_id"]): item for item in analysts}
        reset_invalid_selection("maintain_analyst_selector", analyst_by_id)
        selected_id = st.selectbox(
            "Analyst profile",
            options=list(analyst_by_id),
            format_func=lambda value: (
                f"{analyst_by_id[value]['user']['name']}  |  workload {analyst_by_id[value]['workload']}"
            ),
            key="maintain_analyst_selector",
        )
        selected = analyst_by_id[int(selected_id)]
        with st.form(f"edit_analyst_{selected_id}"):
            updated_expertise = st.text_input(
                "Expertise", value=selected.get("expertise", ""), max_chars=255
            )
            edit_submitted = st.form_submit_button("Update expertise", type="primary")
        if edit_submitted:
            if len(updated_expertise.strip()) < 2:
                st.warning("Expertise must contain at least 2 characters.")
            else:
                try:
                    api.update_analyst(int(selected_id), updated_expertise.strip())
                    _reload("Analyst expertise updated.")
                except APIError as error:
                    handle_api_error(error, "Analyst update failed")

        with st.expander("Remove analyst profile"):
            st.warning("Profiles with assignment history cannot be removed by the API.")
            confirmed = st.checkbox(
                f"Remove the analyst profile for {selected['user']['name']}",
                key=f"confirm_analyst_delete_{selected_id}",
            )
            if st.button(
                "Remove profile",
                disabled=not confirmed,
                key=f"delete_analyst_{selected_id}",
            ):
                try:
                    api.delete_analyst(int(selected_id))
                    _reload("Analyst profile removed. The user account remains available.")
                except APIError as error:
                    handle_api_error(error, "Analyst profile removal failed")
