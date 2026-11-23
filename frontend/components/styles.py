import streamlit as st


def apply_global_styles() -> None:
    st.markdown(
        """
        <style>
        :root {
            --cims-black: #111315;
            --cims-ink: #202326;
            --cims-muted: #666b70;
            --cims-line: #d8d9d6;
            --cims-paper: #ffffff;
            --cims-canvas: #f4f4f1;
        }
        .stApp { background: var(--cims-canvas); color: var(--cims-ink); }
        .block-container { max-width: 1440px; padding-top: 2.2rem; padding-bottom: 4rem; }
        [data-testid="stSidebar"] {
            background: #ecece8;
            border-right: 1px solid #d2d2ce;
        }
        [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
            color: #252729;
        }
        .cims-brand {
            background: var(--cims-black);
            color: #fff;
            padding: 1.15rem 1.2rem;
            border-radius: 4px;
            letter-spacing: .04em;
            margin-bottom: 1rem;
        }
        .cims-brand strong { font-size: 1.02rem; letter-spacing: .12em; }
        .cims-brand small { display: block; color: #bfc2c4; margin-top: .28rem; }
        .cims-eyebrow {
            color: var(--cims-muted);
            font-size: .73rem;
            font-weight: 700;
            letter-spacing: .13em;
            text-transform: uppercase;
            margin-bottom: .35rem;
        }
        .cims-page-title {
            color: var(--cims-black);
            font-size: clamp(1.75rem, 3.4vw, 2.65rem);
            line-height: 1.06;
            font-weight: 720;
            letter-spacing: -.035em;
            margin: 0;
        }
        .cims-page-copy {
            color: var(--cims-muted);
            max-width: 780px;
            margin: .65rem 0 1.55rem;
            line-height: 1.55;
        }
        .cims-status {
            display: inline-block;
            border: 1px solid #b8bbb9;
            border-radius: 999px;
            background: #fff;
            color: #222;
            font-size: .74rem;
            font-weight: 700;
            letter-spacing: .025em;
            padding: .24rem .65rem;
        }
        .cims-advisory {
            border-left: 4px solid #111315;
            background: #fff;
            padding: .95rem 1rem;
            margin: .65rem 0 1rem;
        }
        .cims-advisory-label {
            color: #64686b;
            font-size: .72rem;
            font-weight: 700;
            letter-spacing: .1em;
            text-transform: uppercase;
        }
        .cims-advisory-value { color: #111315; font-size: 1.25rem; font-weight: 750; }
        [data-testid="stMetric"] {
            background: var(--cims-paper);
            border: 1px solid var(--cims-line);
            border-radius: 4px;
            padding: .85rem 1rem;
        }
        [data-testid="stMetricLabel"] { color: var(--cims-muted); }
        [data-testid="stMetricValue"] { color: var(--cims-black); }
        [data-testid="stForm"], [data-testid="stVerticalBlockBorderWrapper"] {
            background: rgba(255, 255, 255, .82);
            border-color: var(--cims-line);
            border-radius: 4px;
        }
        .stButton > button, .stFormSubmitButton > button, .stDownloadButton > button {
            border-radius: 3px;
            border-color: #919497;
            font-weight: 650;
        }
        .stButton > button[kind="primary"],
        .stFormSubmitButton > button[kind="primary"] {
            background: var(--cims-black);
            border-color: var(--cims-black);
            color: #fff;
        }
        div[data-baseweb="tab-list"] { gap: .35rem; }
        div[data-baseweb="tab"] { border-radius: 3px 3px 0 0; }
        hr { border-color: var(--cims-line); }
        @media (max-width: 700px) {
            .block-container { padding: 1.25rem .85rem 3rem; }
            .cims-page-copy { margin-bottom: 1.1rem; }
            [data-testid="stHorizontalBlock"] { gap: .55rem; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
