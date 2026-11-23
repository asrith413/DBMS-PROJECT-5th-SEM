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
    set_flash(message, scope="assets")
    st.rerun()


def render_assets(api: APIClient, user: dict[str, Any]) -> None:
    if not require_role(user, {"ADMIN", "ANALYST"}):
        return
    show_flash("assets")
    page_header(
        "Asset inventory",
        "Asset Management",
        "Maintain the API-backed asset inventory and associate assets with incidents you can access.",
    )

    try:
        assets = api.list_assets()
    except APIError as error:
        handle_api_error(error, "Unable to load assets")
        return
    pending_asset = st.session_state.get("pending_analyst_asset")
    if (
        user.get("role") == "ANALYST"
        and isinstance(pending_asset, dict)
        and all(
            int(item["asset_id"]) != int(pending_asset["asset_id"])
            for item in assets
        )
    ):
        assets.append(pending_asset)

    metric_grid(
        [
            ("Assets", len(assets)),
            ("With IP / network", sum(bool(item.get("ip_address")) for item in assets)),
            ("Departments", len({item.get("department") for item in assets})),
        ]
    )
    inventory_tab, create_tab, edit_tab, association_tab = st.tabs(
        ["Inventory", "Create asset", "Edit asset", "Associate with incident"]
    )

    with inventory_tab:
        search = st.text_input(
            "Filter inventory", placeholder="Name, type, IP, or department", key="asset_inventory_search"
        ).strip().lower()
        visible_assets = [
            item
            for item in assets
            if not search
            or search
            in " ".join(
                str(item.get(field) or "")
                for field in ("name", "type", "ip_address", "department")
            ).lower()
        ]
        if visible_assets:
            frame = pd.DataFrame(
                [
                    {
                        "ID": item.get("asset_id"),
                        "Name": item.get("name", ""),
                        "Type": item.get("type", ""),
                        "IP / network": item.get("ip_address") or "-",
                        "Department": item.get("department", ""),
                    }
                    for item in visible_assets
                ]
            )
            st.dataframe(frame, hide_index=True, use_container_width=True)
        else:
            st.info("No assets match this filter.")
        if assets:
            asset_by_id = {int(item["asset_id"]): item for item in assets}
            reset_invalid_selection("asset_relationship_selector", asset_by_id)
            relationship_asset_id = st.selectbox(
                "View affected incidents for asset",
                options=list(asset_by_id),
                format_func=lambda value: f"#{value}  {asset_by_id[value]['name']}",
                key="asset_relationship_selector",
            )
            try:
                affected = api.list_asset_incidents(int(relationship_asset_id))
            except APIError as error:
                handle_api_error(error, "Unable to load affected incidents")
            else:
                if affected:
                    st.dataframe(pd.DataFrame(affected), hide_index=True, use_container_width=True)
                else:
                    st.caption("This asset is not linked to an accessible incident.")

    with create_tab:
        with st.form("create_asset_form", clear_on_submit=True):
            name = st.text_input("Asset name", max_chars=150)
            asset_type = st.text_input("Asset type", max_chars=100, placeholder="Server, endpoint, network")
            ip_address = st.text_input("IP address or CIDR network", max_chars=45)
            department = st.text_input("Department", max_chars=120)
            submitted = st.form_submit_button("Create asset", type="primary")
        if submitted:
            if min(len(name.strip()), len(asset_type.strip()), len(department.strip())) < 2:
                st.warning("Name, type, and department must each contain at least 2 characters.")
            else:
                try:
                    created = api.create_asset(
                        {
                            "name": name.strip(),
                            "type": asset_type.strip(),
                            "ip_address": ip_address.strip() or None,
                            "department": department.strip(),
                        }
                    )
                    if user.get("role") == "ANALYST":
                        st.session_state["pending_analyst_asset"] = created
                    _reload("Asset created.")
                except APIError as error:
                    handle_api_error(error, "Asset creation failed")

    with edit_tab:
        if not assets:
            st.info("There are no assets to edit.")
        else:
            asset_by_id = {int(item["asset_id"]): item for item in assets}
            reset_invalid_selection("asset_editor_selector", asset_by_id)
            selected_id = st.selectbox(
                "Asset",
                options=list(asset_by_id),
                format_func=lambda value: (
                    f"#{value}  {asset_by_id[value]['name']}  |  {asset_by_id[value]['type']}"
                ),
                key="asset_editor_selector",
            )
            selected = asset_by_id[int(selected_id)]
            with st.form(f"edit_asset_form_{selected_id}"):
                updated_name = st.text_input("Asset name", value=selected.get("name", ""), max_chars=150)
                updated_type = st.text_input("Asset type", value=selected.get("type", ""), max_chars=100)
                updated_ip = st.text_input(
                    "IP address or CIDR network",
                    value=selected.get("ip_address") or "",
                    max_chars=45,
                    help="Leave blank to clear the current IP address.",
                )
                updated_department = st.text_input(
                    "Department", value=selected.get("department", ""), max_chars=120
                )
                edit_submitted = st.form_submit_button("Save asset", type="primary")
            if edit_submitted:
                if min(
                    len(updated_name.strip()),
                    len(updated_type.strip()),
                    len(updated_department.strip()),
                ) < 2:
                    st.warning("Name, type, and department must each contain at least 2 characters.")
                else:
                    payload = {
                        "name": updated_name.strip(),
                        "type": updated_type.strip(),
                        "ip_address": updated_ip.strip() or None,
                        "department": updated_department.strip(),
                    }
                    try:
                        api.update_asset(int(selected_id), payload)
                        _reload("Asset updated.")
                    except APIError as error:
                        handle_api_error(error, "Asset update failed")

            if user.get("role") == "ADMIN":
                with st.expander("Delete asset"):
                    st.warning("The API rejects deletion when an asset is linked to incident history.")
                    confirmed = st.checkbox(
                        f"Delete {selected['name']}", key=f"confirm_asset_delete_{selected_id}"
                    )
                    if st.button(
                        "Delete asset",
                        disabled=not confirmed,
                        key=f"delete_asset_{selected_id}",
                    ):
                        try:
                            api.delete_asset(int(selected_id))
                            _reload("Asset deleted.")
                        except APIError as error:
                            handle_api_error(error, "Asset deletion failed")

    with association_tab:
        try:
            incidents = [
                item
                for item in api.list_incidents(limit=200)
                if item.get("status") not in {"Resolved", "Closed"}
            ]
        except APIError as error:
            handle_api_error(error, "Unable to load incidents for association")
            incidents = []
        if not assets or not incidents:
            st.info("At least one accessible incident and one asset are required.")
        else:
            incident_by_id = {int(item["incident_id"]): item for item in incidents}
            asset_by_id = {int(item["asset_id"]): item for item in assets}
            with st.form("asset_incident_association"):
                incident_id = st.selectbox(
                    "Incident",
                    options=list(incident_by_id),
                    format_func=lambda value: f"#{value}  {incident_by_id[value]['title']}",
                )
                asset_id = st.selectbox(
                    "Asset",
                    options=list(asset_by_id),
                    format_func=lambda value: f"{asset_by_id[value]['name']}  |  {asset_by_id[value]['type']}",
                )
                impact_type = st.text_input(
                    "Impact type", max_chars=120, placeholder="For example: Service disrupted"
                )
                link_submitted = st.form_submit_button("Associate asset", type="primary")
            if link_submitted:
                if len(impact_type.strip()) < 2:
                    st.warning("The impact type must contain at least 2 characters.")
                else:
                    try:
                        api.associate_asset(int(asset_id), int(incident_id), impact_type.strip())
                        if (
                            isinstance(pending_asset, dict)
                            and int(pending_asset["asset_id"]) == int(asset_id)
                        ):
                            st.session_state.pop("pending_analyst_asset", None)
                        _reload("Asset associated with the incident.")
                    except APIError as error:
                        handle_api_error(error, "Asset association failed")
            st.caption("Review or remove existing associations from the Incident Details page.")
