"""
FireWatch — Industrial Fire & Persistent Thermal Source Intelligence

An operational screening layer for industrial fire risk. Satellite thermal
hotspots are matched against mapped industrial sites and tested for recurrence,
so a persistent furnace is separated from seasonal field burning and a real
incident is not lost in the noise.

The application presents three surfaces over that feed: an operational map, an
analytics view for the reviewing officer, and a ranked escalation queue that
exports to CSV for field teams.

Run:
    pip install streamlit folium streamlit-folium pandas numpy plotly
    streamlit run final.py

PROCESSING CHAIN
    Acquisition     NASA FIRMS hotspots + OpenStreetMap industrial sites,
                    enriched with distance-to-site and recurrence count
    Classification  deterministic rules assign fire type and risk band
    Delivery        this application — map, analytics, escalation queue

Reads the classified detection feed from this folder when present; otherwise
runs on a built-in sample set so the interface is never empty.
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

import folium
from folium.plugins import Fullscreen, HeatMap, MarkerCluster, MiniMap
from streamlit_folium import st_folium

import plotly.express as px
import plotly.graph_objects as go

# ---------------------------------------------------------------------------
# 0. PATHS / CONSTANTS
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
ASSETS = BASE_DIR / "assets"
# Classified detection feed. The first name present is used; the alternatives
# are accepted so an existing producer does not have to be renamed.
DATA_CANDIDATES = ("detections_classified.csv", "firewatch_detections.csv",
                   "pair2_classified.csv")
REAL_DATA_PATH = next((BASE_DIR / n for n in DATA_CANDIDATES if (BASE_DIR / n).exists()),
                      BASE_DIR / DATA_CANDIDATES[0])
FAVICON = ASSETS / "favicon.png"

APP_TITLE = "FireWatch — Industrial Thermal Intelligence"

st.set_page_config(
    page_title=APP_TITLE,
    page_icon=str(FAVICON) if FAVICON.exists() else None,
    layout="wide",
    initial_sidebar_state="auto",   # collapsed by default on narrow screens
)

# --- Appearance ------------------------------------------------------------
# The active theme travels in the URL (?theme=dark) so it survives the reload
# that switches Streamlit's own widget theme to match. The floating control in
# the top-right corner writes both.
def _active_theme() -> str:
    try:
        return "dark" if str(st.query_params.get("theme", "light")).lower() == "dark" else "light"
    except Exception:
        return "light"


THEME = _active_theme()
DARK = THEME == "dark"

RISK_DESC = ["Critical", "High", "Medium", "Low"]   # severity first
RISK_ASC  = ["Low", "Medium", "High", "Critical"]   # for ordered categorical

if DARK:
    INK        = "#EAF1F8"   # primary text
    INK_2      = "#B9CBDD"   # secondary
    SLATE      = "#9DB1C5"   # body text
    SLATE_LT   = "#75899D"   # captions
    LINE       = "#233241"   # hairlines
    SURFACE    = "#141F2C"   # cards
    CANVAS     = "#0C151E"   # page background
    ACCENT     = "#E2733B"   # ember accent
    GRID       = "#1B2734"   # chart gridlines
    WELL       = "#1B2734"   # inset wells (meters, code, notices)
    RISK_COLORS = {"Critical": "#E05252", "High": "#E2733B",
                   "Medium": "#D9A441", "Low": "#4FA97F"}
    TYPE_COLORS = {"Industrial Fire": "#5A9BD8", "Agricultural Burning": "#D9A441",
                   "Other/Natural": "#6FB07A"}
    TYPE_FALLBACK = "#8698AA"
    # Solid buttons need their own tokens: INK is a near-white here, so a button
    # painted INK with white text would disappear.
    BTN_BG, BTN_TEXT, BTN_HOVER = "#EAF1F8", "#0C151E", "#FFFFFF"
else:
    INK        = "#0A1F33"
    INK_2      = "#12314F"
    SLATE      = "#4A6076"
    SLATE_LT   = "#7C90A4"
    LINE       = "#DCE3EB"
    SURFACE    = "#FFFFFF"
    CANVAS     = "#F4F6F9"
    ACCENT     = "#C2410C"
    GRID       = "#EDF1F5"
    WELL       = "#EDF1F5"
    RISK_COLORS = {"Critical": "#9B1C1C", "High": "#C2410C",
                   "Medium": "#B7791F", "Low": "#2F7A5B"}
    TYPE_COLORS = {"Industrial Fire": "#0F4C81", "Agricultural Burning": "#A16207",
                   "Other/Natural": "#4B7F52"}
    TYPE_FALLBACK = "#5B6B7C"
    BTN_BG, BTN_TEXT, BTN_HOVER = "#0A1F33", "#FFFFFF", "#12314F"

ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/{svc}/MapServer/tile/{{z}}/{{y}}/{{x}}"

# Esri's public tile services need no API key. CartoDB's basemaps now do, which
# is why they are not used here — a keyless stack cannot fail in the field.
BASEMAPS = {
    "Satellite imagery": {
        "tiles":  ESRI.format(svc="World_Imagery"),
        "labels": ESRI.format(svc="Reference/World_Boundaries_and_Places"),
        "attr":   "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    },
    "Light (cartographic)": {
        "tiles":  ESRI.format(svc="Canvas/World_Light_Gray_Base"),
        "labels": ESRI.format(svc="Canvas/World_Light_Gray_Reference"),
        "attr":   "&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    },
    "Dark": {
        "tiles":  ESRI.format(svc="Canvas/World_Dark_Gray_Base"),
        "labels": ESRI.format(svc="Canvas/World_Dark_Gray_Reference"),
        "attr":   "&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    },
}

IMAGES = {
    "asia_lights": ASSETS / "asia_night_lights.png",
    "modis_fires": ASSETS / "modis_india_fires.jpg",
    "thermal":     ASSETS / "viirs_thermal.jpg",
    "flaring":     ASSETS / "viirs_night_flaring.jpg",
    "crop":        ASSETS / "crop_burning_nw_india.jpg",
    "haze":        ASSETS / "delhi_haze_misr.jpg",
}


def icon(name: str, size: int = 16, color: str = "currentColor", stroke: float = 1.6) -> str:
    """Inline stroke icons — the grown-up replacement for emoji."""
    paths = {
        "satellite": '<path d="M4 10 10 4l4 4-6 6-4-4Z"/><path d="m10.5 13.5 3 3"/>'
                     '<path d="M13 7.5 16.5 4"/><path d="M14 14a4 4 0 0 1-4 4"/>'
                     '<path d="M15.5 17.5a7 7 0 0 1-7 3.5"/>',
        "factory":   '<path d="M3 21V9l6 4V9l6 4V6h5v15H3Z"/><path d="M7 17h2M13 17h2M18 17h1"/>',
        "map":       '<path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3-6-3Z"/><path d="M9 4v13M15 7v13"/>',
        "alert":     '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4M12 17.5v.5"/>',
        "chart":     '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        "layers":    '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
        "download":  '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
        "clock":     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
        "pin":       '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
        "shield":    '<path d="M12 3 5 6v6c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
        "database":  '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
        "cpu":       '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M10 1.5v2M14 1.5v2M10 20.5v2M14 20.5v2M1.5 10h2M1.5 14h2M20.5 10h2M20.5 14h2"/>',
    }
    d = paths.get(name, paths["pin"])
    return (
        f'<svg class="fw-ico" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
        f'stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true">{d}</svg>'
    )


# ---------------------------------------------------------------------------
# 1. DESIGN SYSTEM (CSS)
#    Plain string + token substitution: no f-string brace escaping, so the
#    stylesheet stays readable and editable by the team.
# ---------------------------------------------------------------------------
_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');

/* ---------- base ---------- */
html, body, .stApp, [data-testid="stAppViewContainer"] {
    background: __CANVAS__;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: __SLATE__;
    -webkit-font-smoothing: antialiased;
}
.block-container {
    max-width: 1280px;
    padding-top: 0.6rem !important;
    padding-bottom: 3rem;
}
[data-testid="stToolbar"], [data-testid="stDecoration"], #MainMenu, footer { display: none !important; }
header[data-testid="stHeader"] { background: transparent; }

h1, h2, h3, h4, h5 { font-family: 'Inter', sans-serif; color: __INK__; letter-spacing: -0.015em; }
.fw-mono { font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
.fw-ico  { vertical-align: -3px; }
a { color: __INK2__; }

/* ---------- section headers ---------- */
.fw-sec { margin: 2.2rem 0 1.0rem 0; }
.fw-sec .eyebrow {
    font-size: 0.68rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    color: __ACCENT__; margin-bottom: 0.35rem;
}
.fw-sec h2 { font-size: 1.42rem; font-weight: 700; margin: 0 0 0.3rem 0; }
.fw-sec p  { font-size: 0.92rem; color: __SLATELT__; margin: 0; max-width: 74ch; line-height: 1.55; }
.fw-sec .bar { width: 46px; height: 3px; background: __ACCENT__; border-radius: 2px; margin-top: 0.7rem; }

/* ---------- cards ---------- */
.fw-card {
    background: __SURFACE__; border: 1px solid __LINE__; border-radius: 10px;
    padding: 1.15rem 1.25rem; height: 100%;
    box-shadow: 0 1px 2px rgba(10,31,51,0.05), 0 8px 24px -18px rgba(10,31,51,0.35);
}
.fw-card h4 { font-size: 1.0rem; font-weight: 700; margin: 0.15rem 0 0.45rem 0; }
.fw-card p  { font-size: 0.88rem; line-height: 1.6; color: __SLATE__; margin: 0; }
.fw-card .step {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; letter-spacing: 0.1em;
    color: __SLATELT__; text-transform: uppercase;
}
.fw-figure { border: 1px solid __LINE__; border-radius: 10px; overflow: hidden; background: __SURFACE__; }
.fw-figure img { display: block; width: 100%; height: 190px; object-fit: cover; }
.fw-figure .cap {
    padding: 0.7rem 0.9rem; font-size: 0.78rem; color: __SLATELT__; line-height: 1.5;
    border-top: 1px solid __LINE__;
}
.fw-figure .cap b { color: __INK__; font-weight: 600; }

/* ---------- status strip ---------- */
.fw-strip {
    display: flex; flex-wrap: wrap; gap: 1.6rem; align-items: center;
    background: __SURFACE__; border: 1px solid __LINE__; border-radius: 10px;
    padding: 0.7rem 1.1rem; margin: 0.2rem 0 1.4rem 0;
    font-size: 0.79rem; color: __SLATELT__;
}
.fw-strip b { color: __INK__; font-weight: 600; }
.fw-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 7px; vertical-align: 1px; }

/* ---------- alert rows ---------- */
.fw-alert {
    display: grid; grid-template-columns: 4px 1fr auto; gap: 0 1.1rem; align-items: center;
    background: __SURFACE__; border: 1px solid __LINE__; border-radius: 10px;
    padding: 0; margin-bottom: 0.7rem; overflow: hidden;
}
.fw-alert .sev { height: 100%; min-height: 88px; }
.fw-alert .body { padding: 0.85rem 0; }
.fw-alert .ttl { font-size: 1.0rem; font-weight: 700; color: __INK__; margin-bottom: 0.2rem; }
.fw-alert .meta { font-size: 0.79rem; color: __SLATELT__; line-height: 1.65; }
.fw-alert .meta .k { color: __SLATE__; font-weight: 600; }
.fw-alert .right { padding: 0.85rem 1.2rem 0.85rem 0; text-align: right; min-width: 190px; }
.fw-alert .conf { font-size: 1.5rem; font-weight: 700; color: __INK__; line-height: 1; }
.fw-alert .conflbl { font-size: 0.64rem; letter-spacing: 0.14em; text-transform: uppercase; color: __SLATELT__; margin-top: 0.25rem; }
.fw-meter { height: 5px; background: __WELL__; border-radius: 3px; margin-top: 0.55rem; overflow: hidden; }
.fw-meter span { display: block; height: 100%; border-radius: 3px; }
.fw-tag {
    display: inline-block; padding: 3px 10px; border-radius: 4px; color: #fff;
    font-size: 0.66rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
}
.fw-chip {
    display: inline-block; padding: 4px 11px; border-radius: 999px; margin: 0 6px 6px 0;
    border: 1px solid __LINE__; background: __SURFACE__;
    font-size: 0.74rem; font-weight: 500; color: __SLATE__;
}

/* ---------- tabs ---------- */
.stTabs [data-baseweb="tab-list"] {
    gap: 2px; border-bottom: 1px solid __LINE__; background: transparent;
}
.stTabs [data-baseweb="tab"] {
    height: 46px; padding: 0 18px; background: transparent; border-radius: 0;
    font-size: 0.76rem; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase;
    color: __SLATELT__;
}
.stTabs [data-baseweb="tab"]:hover { color: __INK__; }
.stTabs [aria-selected="true"] { color: __INK__ !important; }
.stTabs [data-baseweb="tab-highlight"] { background: __ACCENT__; height: 2px; }
.stTabs [data-baseweb="tab-border"] { display: none; }

/* ---------- sidebar ---------- */
[data-testid="stSidebar"] { background: __SURFACE__; border-right: 1px solid __LINE__; }
[data-testid="stSidebar"] .block-container { padding-top: 1.2rem; }
.fw-side-label {
    font-size: 0.65rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
    color: __SLATELT__; margin: 1.15rem 0 0.5rem 0;
}
[data-testid="stSidebar"] label p { font-size: 0.82rem !important; color: __SLATE__ !important; }
[data-testid="stSidebar"] hr { margin: 1.1rem 0; border-color: __LINE__; }

/* ---------- widgets ---------- */
[data-baseweb="tag"] { background-color: __INK2__ !important; border-color: __INK2__ !important; }
[data-testid="stDataFrame"] { border: 1px solid __LINE__; border-radius: 10px; overflow: hidden; }
[data-testid="stSlider"] [role="slider"] { border-color: __INK__ !important; }
div[data-testid="stExpander"] { border: 1px solid __LINE__; border-radius: 10px; background: __SURFACE__; }
.stDownloadButton button, .stButton button { border-radius: 6px; font-weight: 600; font-size: 0.82rem; }
.stDownloadButton button {
    background: __BTNBG__ !important; color: __BTNTXT__ !important;
    border: 1px solid __BTNBG__ !important;
}
.stDownloadButton button:hover, .stDownloadButton button:focus, .stDownloadButton button:active {
    background: __BTNHOVER__ !important; border-color: __BTNHOVER__ !important;
    color: __BTNTXT__ !important;
}
.stDownloadButton button p, .stDownloadButton button div, .stDownloadButton button span {
    color: __BTNTXT__ !important;
}

/* ---------- map frame ---------- */
iframe[title="streamlit_folium.st_folium"] { border: 1px solid __LINE__; border-radius: 10px; }

/* ---------- footer ---------- */
.fw-foot {
    margin-top: 2.6rem; padding-top: 1.4rem; border-top: 1px solid __LINE__;
    font-size: 0.76rem; color: __SLATELT__; line-height: 1.7;
}
.fw-foot b { color: __INK__; font-weight: 600; }

/* ---------- typography enforcement ----------
   Streamlit injects its own font stack at a specificity our base rule loses to.
   This is what makes the product read as one typeface instead of two. */
html, body, .stApp, [data-testid="stAppViewContainer"], [data-testid="stSidebar"],
.stMarkdown, .stMarkdown *, h1, h2, h3, h4, h5, h6, p, span, div, label, li,
button, input, select, textarea, .stTabs button, [data-testid="stWidgetLabel"] * {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}
.fw-mono, .fw-mono *, code, pre, kbd, samp {
    font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace !important;
}
code { background: __WELL__ !important; color: __INK2__ !important; font-size: 0.82em !important;
       padding: 1px 5px !important; border-radius: 4px !important; }

/* ---------- status notices (own markup, so they match the palette) ---------- */
.fw-note {
    border: 1px solid __LINE__; border-left: 3px solid __INK2__; border-radius: 8px;
    background: __WELL__; padding: 0.7rem 0.85rem; font-size: 0.78rem; line-height: 1.6;
    color: __SLATE__; margin-bottom: 0.4rem;
}
.fw-note .fw-mono { font-size: 0.72rem; overflow-wrap: break-word; }

/* ---------- KPI tiles ---------- */
.fw-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 0.2rem 0 0.4rem 0; }
.fw-kpis .kpi {
    background: __SURFACE__; border: 1px solid __LINE__; border-radius: 10px;
    padding: 0.95rem 1.05rem 1.0rem 1.05rem; position: relative; overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,.05);
}
.fw-kpis .accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
.fw-kpis .lbl {
    font-size: 0.63rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: __SLATELT__; margin-bottom: 0.5rem;
}
.fw-kpis .val { font-size: 2.0rem; font-weight: 700; color: __INK__; line-height: 1; letter-spacing: -0.02em; }
.fw-kpis .sub { font-size: 0.71rem; color: __SLATELT__; margin-top: 0.4rem; }
.fw-note .hd {
    font-weight: 700; color: __INK__; font-size: 0.73rem; letter-spacing: 0.09em;
    text-transform: uppercase; margin-bottom: 0.3rem; display: flex; align-items: center;
}
.fw-note.ok  { border-left-color: #2F7A5B; }

.fw-note.warn{ border-left-color: __ACCENT__; }
.fw-note.err { border-left-color: __RISKCRIT__; }

/* ---------- Streamlit's Material icon ligatures ----------
   The typography rule above must not reach these spans. Overriding their font
   makes the ligature render as its literal name — which is why an unstyled
   "keyboard_double_arrow_left" used to sit at the top of the sidebar. */
[data-testid="stIconMaterial"], .stIconMaterial, span[class*="stIconMaterial"],
.material-symbols-rounded, .material-icons, [class*="material-symbols"] {
    font-family: 'Material Symbols Rounded', 'Material Icons', sans-serif !important;
}

/* ---------- hero: free-floating, no panel, no outline ---------- */
.fw-hero { text-align: center; padding: 2.4rem 0 1.6rem 0; }
.fw-hero .eyebrow {
    font-size: 0.7rem; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase;
    color: __ACCENT__; margin-bottom: 0.9rem;
}
.fw-hero h1 {
    font-size: 3.5rem; font-weight: 800; letter-spacing: -0.035em; line-height: 1;
    color: __INK__; margin: 0;
}
.fw-hero h1 .thin { font-weight: 300; color: __SLATELT__; }
.fw-hero .rule {
    width: 58px; height: 3px; background: __ACCENT__; border-radius: 2px;
    margin: 1.05rem auto 1.0rem auto;
}
.fw-hero .lede {
    max-width: 66ch; margin: 0 auto 1.2rem auto; font-size: 1.02rem;
    line-height: 1.65; color: __SLATE__;
}
.fw-hero .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

/* ---------- pipeline stages: flow layout, so text can never overflow ---------- */
.fw-pipe { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0; }
.fw-pipe .stage {
    flex: 1 1 250px; background: __SURFACE__; border: 1px solid __LINE__;
    border-radius: 10px; padding: 0; overflow: hidden; min-width: 230px;
}
.fw-pipe .stage .top { height: 3px; display: block; }
.fw-pipe .stage .inner { padding: 0.95rem 1.1rem 1.05rem 1.1rem; }
.fw-pipe .stage .tag {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.66rem; letter-spacing: 0.13em;
    color: __SLATELT__; text-transform: uppercase;
}
.fw-pipe .stage h5 {
    font-size: 1.02rem; font-weight: 700; color: __INK__; margin: 0.3rem 0 0.5rem 0;
}
.fw-pipe .stage ul { margin: 0; padding-left: 1.05rem; }
.fw-pipe .stage li { font-size: 0.79rem; line-height: 1.6; color: __SLATE__; margin-bottom: 0.15rem; }
.fw-pipe .arrow {
    display: flex; align-items: center; justify-content: center; padding: 0 0.75rem;
    color: __SLATELT__; font-size: 1.15rem; flex: 0 0 auto;
}
@media (max-width: 780px) {
    .fw-pipe .arrow { width: 100%; padding: 0.35rem 0; transform: rotate(90deg); }
}

/* ---------- accent normalisation ----------
   Streamlit's stock dark theme brings its own red primary; keep the ember. */
div[data-baseweb="slider"] div[role="slider"] { background-color: __ACCENT__ !important; }
[data-testid="stSlider"] [data-testid="stThumbValue"] { color: __ACCENT__ !important; }
[data-baseweb="radio"] div[aria-checked="true"] { background-color: __ACCENT__ !important; }
[data-testid="stSidebar"] [data-baseweb="select"] > div { border-color: __LINE__ !important; }
/* ---------- small screens ----------
   The dashboard is used on a phone in the field as often as on a laptop. */
@media (max-width: 1100px) {
    .fw-kpis { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 820px) {
    .block-container { padding-left: 1rem !important; padding-right: 1rem !important; }
    .fw-kpis { grid-template-columns: repeat(2, 1fr); gap: 9px; }
    .fw-kpis .val { font-size: 1.7rem; }
    .fw-hero { padding: 1.6rem 0 1.0rem 0; }
    .fw-hero h1 { font-size: 2.4rem; }
    .fw-hero .lede { font-size: 0.94rem; }
    .fw-hero .eyebrow { font-size: 0.62rem; letter-spacing: 0.16em; }
    .fw-sec h2 { font-size: 1.2rem; }
    .fw-strip { gap: 0.55rem 1.1rem; font-size: 0.74rem; padding: 0.65rem 0.85rem; }
    .stTabs [data-baseweb="tab"] { padding: 0 11px; font-size: 0.68rem; letter-spacing: 0.05em; height: 42px; }
    .stTabs [data-baseweb="tab-list"] { overflow-x: auto; scrollbar-width: none; }
    .stTabs [data-baseweb="tab-list"]::-webkit-scrollbar { display: none; }
    /* alert rows stack: the figure block moves under the detail */
    .fw-alert { grid-template-columns: 4px 1fr; }
    .fw-alert .sev { grid-row: 1 / span 2; }
    .fw-alert .right { grid-column: 2; text-align: left; padding: 0 0 0.85rem 0; min-width: 0; }
    .fw-alert .right .fw-tag { margin-right: 0.7rem; }
    .fw-alert .conf { font-size: 1.25rem; display: inline-block; margin-right: 0.5rem; }
    .fw-alert .conflbl { display: inline-block; }
    .fw-alert .fw-meter { max-width: 190px; }
    .fw-figure img { height: 150px; }
}
@media (max-width: 480px) {
    .fw-kpis { grid-template-columns: 1fr 1fr; }
    .fw-hero h1 { font-size: 2.0rem; }
    .fw-sec p, .fw-card p { font-size: 0.84rem; }
}
</style>
"""

for _tok, _val in {
    "__INK__": INK, "__INK2__": INK_2, "__SLATE__": SLATE, "__SLATELT__": SLATE_LT,
    "__LINE__": LINE, "__SURFACE__": SURFACE, "__CANVAS__": CANVAS, "__ACCENT__": ACCENT,
    "__WELL__": WELL, "__GRID__": GRID, "__RISKCRIT__": RISK_COLORS["Critical"],
    "__BTNBG__": BTN_BG, "__BTNTXT__": BTN_TEXT, "__BTNHOVER__": BTN_HOVER,
}.items():
    _CSS = _CSS.replace(_tok, _val)
st.markdown(_CSS, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# 2. MOTION LAYER
#    GSAP is loaded into the parent document from a zero-height component.
#    Nothing is hidden by CSS — if the CDN is unreachable (offline demo hall)
#    the page simply renders static. Motion is an enhancement, never a
#    prerequisite for content being visible.
# ---------------------------------------------------------------------------
def inject_motion() -> None:
    """Load GSAP into the parent document and reveal content as it scrolls in.

    Streamlit scrolls an inner container rather than the window, so scroll-position
    plugins do not see it. An IntersectionObserver watches the viewport directly and
    works regardless of which element is doing the scrolling. Nothing is hidden by
    CSS and every element carries a failsafe timer, so if the CDN is unreachable —
    an offline demo hall — the page simply renders static and complete.
    """
    components.html(
        """
        <script>
        (function () {
          const P = window.parent;
          if (P.__fwMotion) { P.__fwSweep && P.__fwSweep(); return; }
          P.__fwMotion = true;

          P.__fwShow = function (el) {
            el.style.transition = 'opacity .55s ease, transform .55s ease';
            el.style.opacity = '1';
            el.style.transform = 'none';
          };

          P.__fwSweep = function () {
            if (!P.gsap) return;
            const els = P.document.querySelectorAll('.fw-reveal:not([data-fw-seen])');
            if (!els.length) return;
            if (!P.__fwIO) {
              P.__fwIO = new P.IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                  if (!en.isIntersecting) return;
                  P.__fwIO.unobserve(en.target);
                  P.gsap.to(en.target, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
                });
              }, { threshold: 0.03 });
            }
            els.forEach(function (el) {
              el.setAttribute('data-fw-seen', '1');
              P.gsap.set(el, { opacity: 0, y: 16 });
              P.__fwIO.observe(el);
              setTimeout(function () {
                if (parseFloat(P.getComputedStyle(el).opacity) < 0.05) P.__fwShow(el);
              }, 2600);
            });

            // Count the KPI figures up from zero. The final value is already in
            // the markup, so without GSAP they simply render as-is.
            P.document.querySelectorAll('.fw-count:not([data-fw-counted])').forEach(function (el) {
              el.setAttribute('data-fw-counted', '1');
              var target = parseFloat(el.getAttribute('data-v')) || 0;
              var box = { v: 0 };
              P.gsap.to(box, {
                v: target, duration: 1.1, ease: 'power2.out',
                onUpdate: function () { el.textContent = Math.round(box.v).toLocaleString('en-IN'); }
              });
            });
          };

          const s = P.document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
          s.onerror = function () {};
          s.onload = function () {
            P.__fwSweep();
            let t = null;
            new P.MutationObserver(function () {
              clearTimeout(t); t = setTimeout(P.__fwSweep, 140);
            }).observe(P.document.body, { childList: true, subtree: true });
          };
          P.document.head.appendChild(s);
        })();
        </script>
        """,
        height=0,
    )


def section(eyebrow: str, title: str, sub: str = "") -> None:
    st.markdown(
        '<div class="fw-sec fw-reveal">'
        f'<div class="eyebrow">{eyebrow}</div>'
        f'<h2>{title}</h2>'
        + (f'<p>{sub}</p>' if sub else "")
        + '<div class="bar"></div></div>',
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# 3. MASTHEAD + FLOATING CONTROLS
# ---------------------------------------------------------------------------
def render_hero() -> None:
    """Free-floating centred masthead — no panel, no outline, no background, so
    it reads as part of the page rather than a banner pasted on top of it."""
    st.markdown(
        '<div class="fw-hero">'
        '<div class="eyebrow fw-reveal">Industrial Thermal Anomaly Screening</div>'
        '<h1 class="fw-reveal">Fire<span class="thin">Watch</span></h1>'
        '<div class="rule fw-reveal"></div>'
        '<p class="lede fw-reveal">A national screening layer for industrial fire risk. '
        'Satellite thermal hotspots are matched against mapped industrial sites and tested '
        'for recurrence, so a persistent furnace is never confused with a burning field — '
        'and a real incident is never lost in the noise.</p>'
        '<div class="chips fw-reveal">'
        '<span class="fw-chip">NASA FIRMS &nbsp;·&nbsp; VIIRS / MODIS</span>'
        '<span class="fw-chip">OpenStreetMap industrial sites</span>'
        '<span class="fw-chip">Recurrence &amp; proximity rules</span>'
        '<span class="fw-chip">Risk-ranked alerting</span>'
        '</div></div>',
        unsafe_allow_html=True,
    )


# The control bar is injected as a script element belonging to the *parent*
# document rather than run from inside the component iframe. Streamlit sandboxes
# those iframes without allow-top-navigation, so a theme switch driven from
# inside one can write localStorage but can never reload the page to apply it.
_CONTROL_JS = """
(function () {
  var D = document, W = window;
  var THEME = "__THEME__";
  var KEY = 'stActiveTheme-/-v1';

  // Keep Streamlit's own widget theme in step with ?theme= — matters when the
  // URL is reopened or shared, so custom and native styling never disagree.
  try {
    var cur = (JSON.parse(W.localStorage.getItem(KEY) || '{}') || {}).name || null;
    if (THEME === 'dark' && cur !== 'Dark') {
      W.localStorage.setItem(KEY, JSON.stringify({ name: 'Dark' })); W.location.reload(); return;
    }
    if (THEME !== 'dark' && cur === 'Dark') {
      W.localStorage.removeItem(KEY); W.location.reload(); return;
    }
  } catch (e) {}

  var old = D.getElementById('fw-controls'); if (old) old.remove();
  var oldCss = D.getElementById('fw-controls-css'); if (oldCss) oldCss.remove();

  var css = D.createElement('style');
  css.id = 'fw-controls-css';
  css.textContent =
    '#fw-controls{position:fixed;top:12px;right:16px;z-index:1000001;display:flex;gap:8px;}' +
    '#fw-controls button{display:flex;align-items:center;gap:7px;cursor:pointer;' +
      'background:__SURFACE__;border:1px solid __LINE__;color:__INK__;border-radius:7px;' +
      'padding:7px 13px;font-family:Inter,sans-serif;font-size:0.76rem;font-weight:600;' +
      'line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.10);transition:border-color .15s,color .15s;}' +
    '#fw-controls button:hover{border-color:__ACCENT__;color:__ACCENT__;}' +
    '#fw-controls svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;' +
      'stroke-linecap:round;stroke-linejoin:round;}' +
    '@media (max-width:700px){#fw-controls span{display:none;}#fw-controls button{padding:7px 9px;}}';
  D.head.appendChild(css);

  var ICON_SB = '<svg viewBox="0 0 24 24"><path d="M4 6h8M17 6h3M4 12h3M12 12h8M4 18h8M17 18h3"/>' +
                '<circle cx="14.5" cy="6" r="2"/><circle cx="9.5" cy="12" r="2"/>' +
                '<circle cx="14.5" cy="18" r="2"/></svg>';
  var ICON_DK = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>';
  var ICON_LT = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22' +
                'M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';

  var bar = D.createElement('div');
  bar.id = 'fw-controls';
  bar.innerHTML =
    '<button id="fw-sb" type="button" title="Show or hide the filter panel">' + ICON_SB + '<span></span></button>' +
    '<button id="fw-th" type="button" title="Switch between light and dark">' +
      (THEME === 'dark' ? ICON_LT : ICON_DK) +
      '<span>' + (THEME === 'dark' ? 'Light' : 'Dark') + '</span></button>';
  D.body.appendChild(bar);

  var label = bar.querySelector('#fw-sb span');
  function isOpen() {
    var sb = D.querySelector('[data-testid="stSidebar"]');
    return !!sb && sb.getAttribute('aria-expanded') === 'true';
  }
  function sync() { label.textContent = isOpen() ? 'Hide filters' : 'Filters'; }
  sync();

  bar.querySelector('#fw-sb').addEventListener('click', function () {
    var collapse = D.querySelector('[data-testid="stSidebarCollapseButton"] button');
    var expand = D.querySelector('[data-testid="stExpandSidebarButton"] button');
    if (isOpen()) { if (collapse) collapse.click(); }
    else { var btn = expand || collapse; if (btn) btn.click(); }
    setTimeout(sync, 320);
  });

  bar.querySelector('#fw-th').addEventListener('click', function () {
    var next = THEME === 'dark' ? 'light' : 'dark';
    try {
      if (next === 'dark') W.localStorage.setItem(KEY, JSON.stringify({ name: 'Dark' }));
      else W.localStorage.removeItem(KEY);
    } catch (e) {}
    var url = new URL(W.location.href);
    url.searchParams.set('theme', next);
    W.location.replace(url.toString());
  });

  if (W.__fwCtlObs) W.__fwCtlObs.disconnect();
  W.__fwCtlObs = new MutationObserver(sync);
  W.__fwCtlObs.observe(D.body, { attributes: true, subtree: true, attributeFilter: ['aria-expanded'] });
})();
"""


def inject_controls() -> None:
    """Top-right control bar: a dedicated sidebar toggle and a theme switch.

    The sidebar button drives Streamlit's own collapse control, which is
    otherwise a hover-only affordance most people never find. The theme button
    writes both the URL parameter this script reads and the key Streamlit keeps
    its widget theme in, then reloads once so the two always agree.
    """
    payload = _CONTROL_JS
    for tok, val in {"__THEME__": THEME, "__SURFACE__": SURFACE, "__LINE__": LINE,
                     "__INK__": INK, "__ACCENT__": ACCENT}.items():
        payload = payload.replace(tok, val)
    components.html(
        "<script>(function(){var D=window.parent.document;"
        "var prev=D.getElementById('fw-ctl-script');if(prev)prev.remove();"
        "var sc=D.createElement('script');sc.id='fw-ctl-script';"
        "sc.textContent=" + json.dumps(payload) + ";D.head.appendChild(sc);})();</script>",
        height=0,
    )


# ---------------------------------------------------------------------------
# 4. KPI STRIP
# ---------------------------------------------------------------------------
def render_kpis(tiles) -> None:
    """tiles: (label, value, sub, accent colour).

    Rendered into the page rather than a component iframe: an iframe needs its
    height declared from Python, which cannot know how many rows the grid will
    wrap into on a phone. The counters are animated by the motion layer, and the
    final figure is already in the markup, so they read correctly without it.
    """
    cells = []
    for label, value, sub, colour in tiles:
        cells.append(
            f'<div class="kpi"><span class="accent" style="background:{colour}"></span>'
            f'<div class="lbl">{label}</div>'
            f'<div class="val fw-count" data-v="{int(value)}">{int(value):,}</div>'
            f'<div class="sub">{sub}</div></div>'
        )
    st.markdown('<div class="fw-kpis fw-reveal">' + "".join(cells) + "</div>",
                unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# 5. DATA LAYER
# ---------------------------------------------------------------------------
COLUMN_ALIASES = {
    "latitude": "lat", "y": "lat",
    "longitude": "lon", "long": "lon", "lng": "lon", "x": "lon",
    "fire_type": "type", "class": "type", "classification": "type", "label": "type",
    "conf": "confidence", "confidence_pct": "confidence", "conf_pct": "confidence",
    "risk": "risk_level", "risk_category": "risk_level", "severity": "risk_level",
    "acq_date": "detected_on", "date": "detected_on", "detection_date": "detected_on",
    "dist_km": "distance_km", "distance_to_factory_km": "distance_km",
    "nearest_factory_km": "distance_km", "factory_distance_km": "distance_km",
    "recurrence": "days_seen", "repeat_days": "days_seen", "n_days": "days_seen",
    "satellite": "source", "sensor": "source", "instrument": "source",
    "region": "state", "state_name": "state",
}

# NASA FIRMS ships confidence as l/n/h on some products; map to a percentage.
FIRMS_CONF = {"l": 30, "low": 30, "n": 65, "nominal": 65, "h": 90, "high": 90}

SAMPLE_SITES = [
    (28.6692, 77.4538, "Industrial Fire", 92, "Critical", "NASA FIRMS (VIIRS)", "Delhi NCR", 0.8, 4),
    (28.4595, 77.0266, "Industrial Fire", 78, "High", "Sentinel-2", "Haryana", 2.1, 3),
    (28.7041, 77.1025, "Agricultural Burning", 65, "Medium", "NASA FIRMS (MODIS)", "Delhi NCR", 12.4, 1),
    (19.0760, 72.8777, "Industrial Fire", 88, "Critical", "NASA FIRMS (VIIRS)", "Maharashtra", 1.2, 5),
    (22.5726, 88.3639, "Other/Natural", 40, "Low", "OSM cross-check", "West Bengal", 22.0, 1),
    (13.0827, 80.2707, "Agricultural Burning", 55, "Medium", "Sentinel-2", "Tamil Nadu", 9.7, 2),
    (23.0225, 72.5714, "Other/Natural", 30, "Low", "NASA FIRMS (MODIS)", "Gujarat", 18.5, 1),
    (17.3850, 78.4867, "Industrial Fire", 71, "High", "Sentinel-2", "Telangana", 2.9, 3),
    (12.9716, 77.5946, "Industrial Fire", 95, "Critical", "NASA FIRMS (VIIRS)", "Karnataka", 0.5, 6),
    (26.9124, 75.7873, "Other/Natural", 20, "Low", "OSM cross-check", "Rajasthan", 30.0, 1),
    (21.1702, 72.8311, "Industrial Fire", 83, "High", "NASA FIRMS (VIIRS)", "Gujarat", 2.4, 2),
    (25.5941, 85.1376, "Agricultural Burning", 48, "Medium", "OSM cross-check", "Bihar", 14.0, 2),
    (30.7333, 76.7794, "Agricultural Burning", 60, "Medium", "Sentinel-2", "Punjab", 16.2, 1),
    (11.0168, 76.9558, "Industrial Fire", 90, "Critical", "NASA FIRMS (VIIRS)", "Tamil Nadu", 1.0, 4),
    (15.2993, 74.1240, "Other/Natural", 35, "Low", "OSM cross-check", "Goa", 25.3, 1),
    (22.3072, 73.1812, "Industrial Fire", 86, "Critical", "NASA FIRMS (VIIRS)", "Gujarat", 0.9, 5),
    (19.9975, 73.7898, "Industrial Fire", 74, "High", "Sentinel-2", "Maharashtra", 3.1, 3),
    (23.2599, 77.4126, "Agricultural Burning", 52, "Medium", "NASA FIRMS (MODIS)", "Madhya Pradesh", 11.8, 2),
    (26.8467, 80.9462, "Agricultural Burning", 58, "Medium", "NASA FIRMS (MODIS)", "Uttar Pradesh", 15.4, 1),
    (21.2514, 81.6296, "Industrial Fire", 81, "High", "NASA FIRMS (VIIRS)", "Chhattisgarh", 2.6, 3),
    (20.2961, 85.8245, "Other/Natural", 28, "Low", "OSM cross-check", "Odisha", 27.6, 1),
    (16.5062, 80.6480, "Agricultural Burning", 44, "Medium", "Sentinel-2", "Andhra Pradesh", 13.2, 2),
    (31.6340, 74.8723, "Agricultural Burning", 62, "Medium", "NASA FIRMS (MODIS)", "Punjab", 17.9, 1),
    (22.7196, 75.8577, "Industrial Fire", 77, "High", "Sentinel-2", "Madhya Pradesh", 2.2, 2),
    (18.5204, 73.8567, "Industrial Fire", 94, "Critical", "NASA FIRMS (VIIRS)", "Maharashtra", 0.6, 7),
    (9.9312, 76.2673, "Other/Natural", 33, "Low", "OSM cross-check", "Kerala", 21.4, 1),
    (25.3176, 82.9739, "Agricultural Burning", 50, "Medium", "NASA FIRMS (MODIS)", "Uttar Pradesh", 12.9, 1),
    (24.5854, 73.7125, "Industrial Fire", 69, "High", "Sentinel-2", "Rajasthan", 3.4, 2),
]


def build_sample_frame() -> pd.DataFrame:
    """Standby set — realistic geography, synthetic readings. Superseded the
    moment a classified detection feed appears alongside this file."""
    rng = np.random.default_rng(42)
    cols = ["lat", "lon", "type", "confidence", "risk_level", "source",
            "state", "distance_km", "days_seen"]
    df = pd.DataFrame(SAMPLE_SITES, columns=cols)
    anchor = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    df["detected_on"] = [
        (anchor - timedelta(days=int(d))).strftime("%Y-%m-%d")
        for d in rng.integers(0, 7, size=len(df))
    ]
    return df


def normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Make any upstream CSV safe to render: harmonise column names, coerce
    dtypes, fill optional fields. Upstream producers can rename fields without
    taking the interface down."""
    df = df.copy()
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    df = df.rename(columns={k: v for k, v in COLUMN_ALIASES.items() if k in df.columns})

    missing = [c for c in ("lat", "lon") if c not in df.columns]
    if missing:
        raise KeyError("missing required column(s): " + ", ".join(missing))

    for col, default in (("type", "Other/Natural"), ("risk_level", "Low"),
                         ("source", "Unspecified"), ("state", "Unspecified")):
        if col not in df.columns:
            df[col] = default
        df[col] = df[col].fillna(default).astype(str).str.strip()

    if "confidence" not in df.columns:
        df["confidence"] = 50
    conf = df["confidence"]
    if conf.dtype == object:
        conf = conf.astype(str).str.strip().str.lower().map(FIRMS_CONF).fillna(
            pd.to_numeric(df["confidence"], errors="coerce"))
    df["confidence"] = pd.to_numeric(conf, errors="coerce").fillna(50).clip(0, 100).round().astype(int)

    for col, default in (("distance_km", np.nan), ("days_seen", 1)):
        if col not in df.columns:
            df[col] = default
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["days_seen"] = df["days_seen"].fillna(1).clip(lower=1).astype(int)

    for col in ("lat", "lon"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["lat", "lon"])

    if "detected_on" not in df.columns:
        df["detected_on"] = pd.Timestamp.now().normalize()
    df["detected_on"] = pd.to_datetime(df["detected_on"], errors="coerce")
    df["detected_on"] = df["detected_on"].fillna(pd.Timestamp.now().normalize())

    # Canonicalise the four risk bands; anything unexpected is kept visible
    # rather than silently dropped.
    canon = {r.lower(): r for r in RISK_ASC}
    df["risk_level"] = df["risk_level"].str.lower().map(canon).fillna(df["risk_level"])
    order = RISK_ASC + [r for r in df["risk_level"].unique() if r not in RISK_ASC]
    df["risk_level"] = pd.Categorical(df["risk_level"], categories=order, ordered=True)

    if not len(df):
        return df.reset_index(drop=True)
    if "site_id" not in df.columns:
        df.insert(0, "site_id", [f"FW-{i:04d}" for i in range(1, len(df) + 1)])
    return df.reset_index(drop=True)


@st.cache_data(show_spinner=False)
def load_data(path: str, stamp: float):
    """stamp (file mtime) is part of the cache key, so dropping in a fresh
    feed refreshes the dashboard without a restart."""
    if stamp > 0:
        return normalise(pd.read_csv(path)), True
    return normalise(build_sample_frame()), False


_stamp = REAL_DATA_PATH.stat().st_mtime if REAL_DATA_PATH.exists() else 0.0
try:
    df, USING_REAL_DATA = load_data(str(REAL_DATA_PATH), _stamp)
    LOAD_ERROR = ""
except Exception as exc:  # a bad upstream CSV must not blank the screen
    df, USING_REAL_DATA = normalise(build_sample_frame()), False
    LOAD_ERROR = f"{type(exc).__name__}: {exc}"


def risk_color(level) -> str:
    return RISK_COLORS.get(str(level), SLATE_LT)


def type_color(t) -> str:
    return TYPE_COLORS.get(str(t), TYPE_FALLBACK)


# ---------------------------------------------------------------------------
# 6. SIDEBAR — control panel
# ---------------------------------------------------------------------------
BRAND_MARK = (
    '<svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">'
    '<rect width="64" height="64" rx="14" fill="' + INK + '"/>'
    '<defs><linearGradient id="emb" x1="0" y1="1" x2="0" y2="0">'
    '<stop offset="0%" stop-color="#9B1C1C"/><stop offset="55%" stop-color="#C2410C"/>'
    '<stop offset="100%" stop-color="#F0A868"/></linearGradient></defs>'
    '<path fill="url(#emb)" d="M32 12c-2 8-9 11-9 20a9 9 0 0 0 18 0c0-4-2-6-3-8'
    ' .3 3-1.6 4.4-3 4.6C36.6 22 34 16 32 12Z"/>'
    '<circle cx="32" cy="44" r="10" fill="url(#emb)" opacity="0.92"/></svg>'
)

with st.sidebar:
    st.markdown(
        '<div style="display:flex;gap:11px;align-items:center;margin-bottom:0.2rem;">'
        + BRAND_MARK
        + '<div><div style="font-size:1.02rem;font-weight:700;color:' + INK + ';'
          'letter-spacing:-0.02em;line-height:1.15;">FireWatch</div>'
          '<div style="font-size:0.66rem;letter-spacing:0.13em;text-transform:uppercase;'
          'color:' + SLATE_LT + ';">Control Panel</div></div></div>',
        unsafe_allow_html=True,
    )

    st.markdown('<div class="fw-side-label">Data source</div>', unsafe_allow_html=True)
    if USING_REAL_DATA:
        st.markdown(
            '<div class="fw-note ok"><div class="hd">'
            '<span class="fw-dot" style="background:#2F7A5B"></span>Live pipeline</div>'
            'Reading the classified detection feed from '
            '<span class="fw-mono">' + REAL_DATA_PATH.name + '</span>.</div>',
            unsafe_allow_html=True)
    else:
        st.markdown(
            '<div class="fw-note warn"><div class="hd">'
            '<span class="fw-dot" style="background:' + ACCENT + '"></span>'
            'Sample dataset</div>'
            'Place <span class="fw-mono">' + DATA_CANDIDATES[0] + '</span> beside this file and '
            'the dashboard switches to the live feed on its own.</div>',
            unsafe_allow_html=True)
    if LOAD_ERROR:
        st.markdown(
            '<div class="fw-note err"><div class="hd">Upstream file unreadable</div>'
            'Falling back to the sample set.<br>'
            '<span class="fw-mono" style="font-size:.72rem;">' + LOAD_ERROR + '</span></div>',
            unsafe_allow_html=True)


def toggle_group(label: str, options, state_key: str, colors: dict, columns: int = 2):
    """Filter chips built from real buttons, tinted with the same colours the
    charts and map use, so the legend is the control."""
    if state_key not in st.session_state:
        st.session_state[state_key] = list(options)
    st.sidebar.markdown(f'<div class="fw-side-label">{label}</div>', unsafe_allow_html=True)
    cols = st.sidebar.columns(columns, gap="small")
    rules = []
    for i, opt in enumerate(options):
        chosen = opt in st.session_state[state_key]
        key = f"{state_key}_{i}"
        col = colors.get(opt, INK_2)
        if cols[i % columns].button(opt, key=key, use_container_width=True):
            sel = list(st.session_state[state_key])
            if chosen and len(sel) > 1:
                sel.remove(opt)
            elif not chosen:
                sel.append(opt)
            st.session_state[state_key] = sel
            st.rerun()
        rules.append(
            f'.st-key-{key} button{{background:{col if chosen else "#fff"}!important;'
            f'border:1px solid {col}!important;color:{"#fff" if chosen else col}!important;'
            f'font-weight:600!important;font-size:0.76rem!important;padding:0.3rem 0.4rem!important;'
            f'opacity:{"1" if chosen else "0.72"};transition:all .16s ease;}}'
            f'.st-key-{key} button:hover{{background:{col}!important;color:#fff!important;opacity:1;}}'
        )
    st.sidebar.markdown("<style>" + "".join(rules) + "</style>", unsafe_allow_html=True)
    return st.session_state[state_key]


present_risks = [r for r in RISK_DESC if r in set(df["risk_level"].astype(str))]
present_types = sorted(df["type"].astype(str).unique())

risk_sel = toggle_group("Risk level", present_risks or RISK_DESC, "fw_risk", RISK_COLORS, 2)
type_sel = toggle_group("Fire classification", present_types, "fw_type", TYPE_COLORS, 1)

with st.sidebar:
    st.markdown('<div class="fw-side-label">Detection thresholds</div>', unsafe_allow_html=True)
    min_conf = st.slider("Minimum confidence (%)", 0, 100, 0, step=5)
    max_dist = st.slider("Maximum distance to nearest industrial site (km)", 0, 50, 50, step=1,
                         help="Industrial fires sit close to mapped factories. Tightening this "
                              "isolates the incidents a safety authority would act on first.")

    # A feed can legitimately be empty (a quiet day upstream) — fall back to
    # today's date rather than handing NaT to the date picker.
    if len(df) and df["detected_on"].notna().any():
        d_min, d_max = df["detected_on"].min().date(), df["detected_on"].max().date()
    else:
        d_min = d_max = datetime.now().date()
    st.markdown('<div class="fw-side-label">Observation window</div>', unsafe_allow_html=True)
    date_range = st.date_input("Detection date range", value=(d_min, d_max),
                               min_value=d_min, max_value=d_max)

    st.markdown('<div class="fw-side-label">Map</div>', unsafe_allow_html=True)
    basemap = st.selectbox("Base layer", ["Satellite imagery", "Light (cartographic)", "Dark"],
                           index=2 if DARK else 0)
    map_style = st.radio("Rendering", ["Risk markers", "Clustered", "Heat density"],
                         horizontal=False)

    st.markdown("---")
    if st.button("Reset all filters", use_container_width=True):
        for k in ("fw_risk", "fw_type"):
            st.session_state.pop(k, None)
        st.rerun()
    st.markdown(
        '<div style="font-size:0.7rem;color:' + SLATE_LT + ';line-height:1.6;">'
        'FireWatch · Release 1.0<br>Thermal screening platform</div>',
        unsafe_allow_html=True,
    )

# --- apply filters ---------------------------------------------------------
mask = (
    df["risk_level"].astype(str).isin(risk_sel)
    & df["type"].astype(str).isin(type_sel)
    & (df["confidence"] >= min_conf)
)
if max_dist < 50:
    mask &= df["distance_km"].fillna(np.inf) <= max_dist
if isinstance(date_range, (tuple, list)) and len(date_range) == 2:
    start = pd.to_datetime(date_range[0])
    end = pd.to_datetime(date_range[1]) + timedelta(days=1) - timedelta(seconds=1)
    mask &= df["detected_on"].between(start, end)
fdf = df[mask].copy()

n_crit = int((fdf["risk_level"].astype(str) == "Critical").sum())
n_high = int((fdf["risk_level"].astype(str) == "High").sum())
n_ind = int((fdf["type"].astype(str) == "Industrial Fire").sum())
recurring = int((fdf["days_seen"] >= 3).sum())
near_site = int((fdf["distance_km"].fillna(np.inf) <= 3).sum())

# ---------------------------------------------------------------------------
# 7. PAGE HEAD
# ---------------------------------------------------------------------------
inject_motion()
inject_controls()
render_hero()

_window = (f'{df["detected_on"].min():%d %b} – {df["detected_on"].max():%d %b %Y}'
           if len(df) and df["detected_on"].notna().any() else "no records")
_mode_col = "#2F7A5B" if USING_REAL_DATA else ACCENT
st.markdown(
    '<div class="fw-strip fw-reveal">'
    f'<span><span class="fw-dot" style="background:{_mode_col}"></span>'
    f'<b>{"Live feed" if USING_REAL_DATA else "Sample dataset"}</b></span>'
    f'<span>Records in view &nbsp;<b>{len(fdf):,}</b> of {len(df):,}</span>'
    f'<span>Observation window &nbsp;<b>{_window}</b></span>'
    f'<span>Sources &nbsp;<b>{df["source"].nunique()}</b></span>'
    f'<span>States covered &nbsp;<b>{df["state"].nunique()}</b></span>'
    f'<span>Rendered &nbsp;<b>{datetime.now():%H:%M, %d %b %Y}</b></span>'
    '</div>',
    unsafe_allow_html=True,
)

render_kpis([
    ("Detections in view", len(fdf), "after all active filters", INK_2),
    ("Critical", n_crit, "immediate verification", RISK_COLORS["Critical"]),
    ("High", n_high, "same-week inspection", RISK_COLORS["High"]),
    ("Industrial signatures", n_ind, "classified by rule engine", TYPE_COLORS["Industrial Fire"]),
    ("Recurring sites", recurring, "seen on 3+ separate days", ACCENT),
])


# ---------------------------------------------------------------------------
# 8. CHART STYLING
# ---------------------------------------------------------------------------
def style_fig(fig, height: int = 330, legend: bool = True):
    fig.update_layout(
        height=height,
        margin=dict(t=18, b=10, l=10, r=10),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Inter, sans-serif", size=12, color=SLATE),
        hoverlabel=dict(font_family="Inter, sans-serif", bgcolor=SURFACE,
                        bordercolor=LINE, font_color=INK),
        showlegend=legend,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0,
                    title=None, font=dict(size=11)),
    )
    fig.update_xaxes(showgrid=True, gridcolor=GRID, zeroline=False,
                     linecolor=LINE, ticks="outside", tickcolor=LINE,
                     title_font=dict(size=11, color=SLATE_LT))
    fig.update_yaxes(showgrid=True, gridcolor=GRID, zeroline=False,
                     linecolor=LINE, ticks="outside", tickcolor=LINE,
                     title_font=dict(size=11, color=SLATE_LT))
    return fig


def empty_state(message: str) -> None:
    st.markdown(
        '<div class="fw-card fw-reveal" style="text-align:center;padding:2.4rem 1rem;">'
        f'<p style="color:{SLATE_LT};">{message}</p></div>',
        unsafe_allow_html=True,
    )


TABS = st.tabs(["Live Map", "Analytics", "Priority Alerts", "Impact & Context", "System Architecture"])

# ---------------------------------------------------------------------------
# 9. TAB — LIVE MAP
# ---------------------------------------------------------------------------
with TABS[0]:
    section("Operational view", "National thermal anomaly map",
            "Every screened hotspot, positioned and coloured by assessed risk. Marker size "
            "tracks detection confidence; recurring industrial signatures pulse.")

    if len(fdf) == 0:
        empty_state("No detections match the current filters. Widen the risk, confidence "
                    "or distance thresholds in the control panel.")
    else:
        base = BASEMAPS[basemap]
        fmap = folium.Map(
            location=[float(fdf["lat"].mean()), float(fdf["lon"].mean())],
            zoom_start=5, tiles=base["tiles"], attr=base["attr"], control_scale=True,
        )
        # Place-name overlay: the gray canvas and imagery layers ship unlabelled.
        folium.TileLayer(tiles=base["labels"], attr=base["attr"],
                         overlay=True, control=False, name="Labels").add_to(fmap)
        Fullscreen(position="topright").add_to(fmap)
        MiniMap(toggle_display=True, position="bottomleft", width=120, height=120).add_to(fmap)

        fmap.get_root().header.add_child(folium.Element(
            "<style>"
            ".fw-pulse{width:16px;height:16px;border-radius:50%;position:relative;}"
            ".fw-pulse::before{content:'';position:absolute;inset:0;border-radius:50%;"
            "background:inherit;opacity:.55;animation:fwping 1.8s cubic-bezier(0,0,.2,1) infinite;}"
            ".fw-pulse::after{content:'';position:absolute;inset:4px;border-radius:50%;"
            "background:inherit;border:1.5px solid #fff;}"
            "@keyframes fwping{0%{transform:scale(.7);opacity:.6}80%,100%{transform:scale(2.6);opacity:0}}"
            f".fw-pop{{font-family:Inter,sans-serif;font-size:12px;color:{SLATE};min-width:232px}}"
            f".fw-pop h5{{margin:0 0 2px 0;font-size:13.5px;color:{INK};font-weight:700}}"
            f".fw-pop .id{{font-family:'IBM Plex Mono',monospace;font-size:10px;color:{SLATE_LT};"
            "letter-spacing:.06em;margin-bottom:8px}"
            ".fw-pop table{width:100%;border-collapse:collapse}"
            f".fw-pop td{{padding:3px 0;border-top:1px solid {LINE}}}"
            f".fw-pop td:last-child{{text-align:right;color:{INK};font-weight:600}}"
            ".fw-pop .badge{display:inline-block;padding:2px 8px;border-radius:3px;color:#fff;"
            "font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}"
            f".leaflet-popup-content-wrapper,.leaflet-popup-tip{{border-radius:8px;"
            f"background:{SURFACE};color:{SLATE}}}"
            "</style>"
        ))

        legend_rows = "".join(
            f'<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">'
            f'<span style="width:10px;height:10px;border-radius:50%;background:{RISK_COLORS[r]};'
            f'display:inline-block;"></span><span>{r}</span></div>'
            for r in RISK_DESC
        )
        fmap.get_root().html.add_child(folium.Element(
            f'<div style="position:fixed;bottom:26px;right:14px;z-index:9999;background:{SURFACE};'
            f'border:1px solid {LINE};border-radius:8px;padding:10px 12px;font-family:Inter,sans-serif;'
            f'font-size:11px;color:{SLATE};box-shadow:0 6px 20px -12px rgba(0,0,0,.45);">'
            f'<div style="font-size:9.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;'
            f'color:{SLATE_LT};margin-bottom:6px;">Assessed risk</div>'
            + legend_rows +
            f'<div style="margin-top:7px;padding-top:6px;border-top:1px solid {LINE};'
            f'font-size:10px;color:{SLATE_LT};">Marker size &prop; confidence</div></div>'
        ))

        if map_style == "Heat density":
            HeatMap(fdf[["lat", "lon", "confidence"]].values.tolist(),
                    radius=24, blur=18, min_opacity=0.25,
                    gradient={0.3: RISK_COLORS["Low"], 0.55: RISK_COLORS["Medium"],
                              0.75: RISK_COLORS["High"], 1.0: RISK_COLORS["Critical"]}
                    ).add_to(fmap)
        else:
            layer = MarkerCluster(name="Detections").add_to(fmap) if map_style == "Clustered" else fmap
            for _, r in fdf.iterrows():
                col = risk_color(r["risk_level"])
                dist = "n/a" if pd.isna(r["distance_km"]) else f"{r['distance_km']:.1f} km"
                popup = (
                    '<div class="fw-pop">'
                    f'<h5>{r["type"]}</h5>'
                    f'<div class="id">{r["site_id"]} &nbsp;·&nbsp; {r["lat"]:.4f}, {r["lon"]:.4f}</div>'
                    f'<span class="badge" style="background:{col}">{r["risk_level"]}</span>'
                    '<table>'
                    f'<tr><td>Confidence</td><td>{int(r["confidence"])}%</td></tr>'
                    f'<tr><td>Nearest industrial site</td><td>{dist}</td></tr>'
                    f'<tr><td>Distinct days observed</td><td>{int(r["days_seen"])}</td></tr>'
                    f'<tr><td>State</td><td>{r["state"]}</td></tr>'
                    f'<tr><td>Source</td><td>{r["source"]}</td></tr>'
                    f'<tr><td>Detected</td><td>{r["detected_on"]:%d %b %Y}</td></tr>'
                    '</table></div>'
                )
                tip = f'{r["site_id"]} · {r["type"]} · {r["risk_level"]}'
                if str(r["risk_level"]) == "Critical":
                    folium.Marker(
                        location=[r["lat"], r["lon"]],
                        icon=folium.DivIcon(
                            html=f'<div class="fw-pulse" style="background:{col}"></div>',
                            icon_size=(16, 16), icon_anchor=(8, 8), class_name="fw-divicon"),
                        popup=folium.Popup(popup, max_width=300), tooltip=tip,
                    ).add_to(layer)
                else:
                    folium.CircleMarker(
                        location=[r["lat"], r["lon"]],
                        radius=4.5 + float(r["confidence"]) / 16.0,
                        color=col, weight=1.6, fill=True, fill_color=col, fill_opacity=0.72,
                        popup=folium.Popup(popup, max_width=300), tooltip=tip,
                    ).add_to(layer)

        st_folium(fmap, height=560, use_container_width=True, returned_objects=[], key="fw_map")

        section("Record level", "Detection log",
                "The same rows behind the map, ranked by severity then confidence.")
        log = fdf[["site_id", "type", "risk_level", "confidence", "distance_km",
                   "days_seen", "state", "source", "detected_on"]].sort_values(
            ["risk_level", "confidence"], ascending=[False, False])
        log = log.rename(columns={
            "site_id": "Site ID", "type": "Classification", "risk_level": "Risk",
            "confidence": "Confidence", "distance_km": "Dist. to site (km)",
            "days_seen": "Days seen", "state": "State", "source": "Source",
            "detected_on": "Detected",
        })
        try:
            st.dataframe(
                log, hide_index=True, use_container_width=True,
                height=min(36 * (len(log) + 1) + 3, 620),
                column_config={
                    "Confidence": st.column_config.ProgressColumn(
                        "Confidence", format="%d%%", min_value=0, max_value=100),
                    "Dist. to site (km)": st.column_config.NumberColumn(format="%.1f"),
                    "Detected": st.column_config.DateColumn(format="DD MMM YYYY"),
                },
            )
        except Exception:
            st.dataframe(log, hide_index=True, use_container_width=True)

# ---------------------------------------------------------------------------
# 10. TAB — ANALYTICS
# ---------------------------------------------------------------------------
with TABS[1]:
    if len(fdf) == 0:
        section("Analysis", "No records in view")
        empty_state("Adjust the filters to populate the analytics.")
    else:
        def chart_title(text: str) -> None:
            st.markdown(
                f'<div class="fw-reveal" style="font-weight:600;color:{INK};font-size:1.0rem;'
                f'margin:0.2rem 0 0.5rem 0;">{text}</div>', unsafe_allow_html=True)

        section("Composition", "What the screening layer is seeing",
                "Risk is a function of two upstream signals: how close a hotspot sits to a "
                "mapped industrial site, and how often it returns.")

        # --- risk distribution -------------------------------------------------
        counts = (fdf["risk_level"].astype(str).value_counts()
                  .reindex(RISK_DESC).fillna(0).astype(int))
        donut = go.Figure(go.Pie(
            labels=counts.index.tolist(), values=counts.values.tolist(), hole=0.62,
            sort=False, direction="clockwise",
            marker=dict(colors=[RISK_COLORS[r] for r in counts.index],
                        line=dict(color=CANVAS, width=2)),
            textinfo="none",
            hovertemplate="<b>%{label}</b><br>%{value} detections (%{percent})<extra></extra>",
        ))
        donut.add_annotation(text=f"<b style='font-size:28px;color:{INK}'>{len(fdf)}</b>"
                                  f"<br><span style='font-size:11px;color:{SLATE_LT}'>IN VIEW</span>",
                             showarrow=False, font=dict(family="Inter"))
        chart_title("Risk distribution")
        st.plotly_chart(style_fig(donut, 380), use_container_width=True)

        # --- classification ----------------------------------------------------
        tc = fdf["type"].astype(str).value_counts().sort_values()
        bar = go.Figure(go.Bar(
            x=tc.values, y=tc.index, orientation="h",
            marker=dict(color=[type_color(t) for t in tc.index]),
            text=tc.values, textposition="outside",
            textfont=dict(family="Inter", size=12, color=SLATE),
            hovertemplate="<b>%{y}</b><br>%{x} detections<extra></extra>",
        ))
        bar.update_xaxes(title="Detections", range=[0, float(tc.max()) * 1.15])
        chart_title("Classification breakdown")
        st.plotly_chart(style_fig(bar, 300, legend=False), use_container_width=True)

        # --- proximity vs confidence ------------------------------------------
        section("Decision logic", "Proximity against confidence",
                "The shaded band is the industrial proximity zone applied by the classification "
                "rules. Points inside it that also recur across days are what get escalated.")
        sc = fdf.dropna(subset=["distance_km"])
        if len(sc):
            scatter = go.Figure()
            scatter.add_vrect(x0=0, x1=3, fillcolor=ACCENT, opacity=0.09, line_width=0,
                              annotation_text="Industrial proximity zone (≤ 3 km)",
                              annotation_position="top left",
                              annotation_font=dict(size=10, color=ACCENT, family="Inter"))
            for lvl in RISK_DESC:
                sub = sc[sc["risk_level"].astype(str) == lvl]
                if not len(sub):
                    continue
                scatter.add_trace(go.Scatter(
                    x=sub["distance_km"], y=sub["confidence"], mode="markers", name=lvl,
                    marker=dict(size=sub["days_seen"] * 3.6 + 7, color=RISK_COLORS[lvl],
                                opacity=0.85, line=dict(color=CANVAS, width=1.2)),
                    customdata=np.stack([sub["site_id"], sub["type"], sub["days_seen"]], axis=-1),
                    hovertemplate="<b>%{customdata[0]}</b> · %{customdata[1]}<br>"
                                  "%{x:.1f} km from nearest site<br>Confidence %{y}%<br>"
                                  "Seen on %{customdata[2]} day(s)<extra></extra>",
                ))
            scatter.update_xaxes(title="Distance to nearest mapped industrial site (km)")
            scatter.update_yaxes(title="Detection confidence (%)", range=[0, 105])
            st.plotly_chart(style_fig(scatter, 420), use_container_width=True)
            st.caption("Bubble size represents how many separate days the same location "
                       "returned a thermal signal.")
        else:
            empty_state("Distance to nearest industrial site is not populated in this dataset.")

        # --- time and geography ------------------------------------------------
        section("Trend & geography", "Where and when",
                "Daily detection volume by risk band, then the states carrying the most load.")
        trend = (fdf.assign(day=fdf["detected_on"].dt.date)
                    .groupby(["day", fdf["risk_level"].astype(str)])
                    .size().reset_index(name="count"))
        trend.columns = ["day", "Risk", "count"]
        line = go.Figure()
        for lvl in RISK_DESC:
            sub = trend[trend["Risk"] == lvl]
            if not len(sub):
                continue
            line.add_trace(go.Scatter(
                x=sub["day"], y=sub["count"], name=lvl, mode="lines+markers",
                line=dict(color=RISK_COLORS[lvl], width=2.2, shape="spline", smoothing=0.5),
                marker=dict(size=6),
                hovertemplate="<b>%{x|%d %b}</b><br>" + lvl + ": %{y}<extra></extra>",
            ))
        line.update_yaxes(title="Detections", rangemode="tozero")
        chart_title("Detections over time")
        st.plotly_chart(style_fig(line, 360), use_container_width=True)

        top = fdf["state"].value_counts().head(10).sort_values()
        sbar = go.Figure(go.Bar(
            x=top.values, y=top.index, orientation="h",
            marker=dict(color=INK_2), text=top.values, textposition="outside",
            textfont=dict(family="Inter", size=11, color=SLATE),
            hovertemplate="<b>%{y}</b><br>%{x} detections<extra></extra>",
        ))
        sbar.update_xaxes(title="Detections", range=[0, float(top.max()) * 1.15])
        chart_title("Most affected states")
        st.plotly_chart(style_fig(sbar, max(300, 34 * len(top)), legend=False),
                        use_container_width=True)

# ---------------------------------------------------------------------------
# 11. TAB — PRIORITY ALERTS
# ---------------------------------------------------------------------------
with TABS[2]:
    section("Escalation queue", "Sites requiring intervention",
            "Critical and High findings only, ordered by severity then confidence. This is the "
            "list a district industrial-safety officer would work through.")

    urgent = fdf[fdf["risk_level"].astype(str).isin(["Critical", "High"])].sort_values(
        ["risk_level", "confidence"], ascending=[False, False])

    a1, a2, a3 = st.columns(3, gap="medium")
    for col, (lbl, val, note, ico) in zip(
        (a1, a2, a3),
        (("Within 3 km of a mapped site", near_site, "proximity trigger", "factory"),
         ("Recurring across 3+ days", recurring, "persistence trigger", "clock"),
         ("Queued for verification", len(urgent), "critical + high", "shield")),
    ):
        col.markdown(
            '<div class="fw-card fw-reveal">'
            f'<div style="color:{ACCENT};margin-bottom:.35rem;">{icon(ico, 20, ACCENT)}</div>'
            f'<div style="font-size:1.85rem;font-weight:700;color:{INK};line-height:1;">{val}</div>'
            f'<div style="font-size:.82rem;color:{SLATE};margin-top:.35rem;">{lbl}</div>'
            f'<div style="font-size:.7rem;color:{SLATE_LT};letter-spacing:.08em;'
            f'text-transform:uppercase;margin-top:.3rem;">{note}</div></div>',
            unsafe_allow_html=True,
        )

    st.markdown("<div style='height:1.4rem'></div>", unsafe_allow_html=True)

    if len(urgent) == 0:
        empty_state("No Critical or High findings in the current filter set.")
    else:
        for _, r in urgent.iterrows():
            col = risk_color(r["risk_level"])
            dist = "distance unavailable" if pd.isna(r["distance_km"]) else \
                   f"{r['distance_km']:.1f} km from nearest mapped industrial site"
            st.markdown(
                '<div class="fw-alert fw-reveal">'
                f'<div class="sev" style="background:{col}"></div>'
                '<div class="body">'
                f'<div class="ttl">{r["type"]} &mdash; {r["state"]}</div>'
                f'<div class="meta"><span class="fw-mono">{r["site_id"]}</span> &nbsp;·&nbsp; '
                f'<span class="fw-mono">{r["lat"]:.4f}, {r["lon"]:.4f}</span><br>'
                f'<span class="k">{dist}</span> &nbsp;·&nbsp; observed on '
                f'<span class="k">{int(r["days_seen"])}</span> separate day(s) &nbsp;·&nbsp; '
                f'{r["source"]} &nbsp;·&nbsp; {r["detected_on"]:%d %b %Y}</div></div>'
                '<div class="right">'
                f'<span class="fw-tag" style="background:{col}">{r["risk_level"]}</span>'
                f'<div class="conf" style="margin-top:.5rem;">{int(r["confidence"])}%</div>'
                '<div class="conflbl">Confidence</div>'
                f'<div class="fw-meter"><span style="width:{int(r["confidence"])}%;'
                f'background:{col}"></span></div>'
                '</div></div>',
                unsafe_allow_html=True,
            )

        st.markdown(
            '<div class="fw-card fw-reveal" style="margin-top:1rem;border-left:3px solid ' + ACCENT + ';">'
            f'<div style="display:flex;gap:.6rem;align-items:flex-start;">{icon("shield", 18, ACCENT)}'
            '<div><h4 style="margin-top:0;">Recommended handling</h4>'
            '<p>Critical findings combine three independent signals — a thermal anomaly, proximity '
            'to a mapped industrial site, and recurrence across separate satellite passes. Route '
            'these to the district industrial-safety authority for ground verification within 24 '
            'hours. High findings should be batched into the next scheduled inspection round. '
            'Agricultural and natural detections are retained for context but are not escalated.</p>'
            '</div></div></div>',
            unsafe_allow_html=True,
        )

    st.markdown("<div style='height:1rem'></div>", unsafe_allow_html=True)
    e1, e2 = st.columns([1, 3])
    e1.download_button("Export current view (CSV)",
                       data=fdf.to_csv(index=False).encode("utf-8"),
                       file_name=f"firewatch_export_{datetime.now():%Y%m%d_%H%M}.csv",
                       mime="text/csv", use_container_width=True)
    e2.markdown(f'<div style="font-size:.78rem;color:{SLATE_LT};padding-top:.55rem;">'
                f'Exports carry every column in the current filter set, ready to attach to an '
                f'inspection request.</div>', unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# 12. TAB — IMPACT & CONTEXT
# ---------------------------------------------------------------------------
def framed_image(path: Path, key: str, height: int = 200) -> None:
    """Fixed-height, cover-cropped image. Source imagery arrives in several
    aspect ratios; without this the cards beneath them stop lining up."""
    if not path.exists():
        return
    try:
        box = st.container(key=key)
    except TypeError:          # older Streamlit without container keys
        box = st.container()
    with box:
        st.image(str(path), use_container_width=True)
    st.markdown(
        f"<style>.st-key-{key} img{{height:{height}px!important;object-fit:cover!important;"
        f"width:100%!important;border-radius:8px!important;}}</style>",
        unsafe_allow_html=True,
    )


def figure(path: Path, title: str, body: str) -> None:
    framed_image(path, "fig_" + path.stem.replace("-", "_"), height=280)
    st.markdown(
        f'<div style="border-left:2px solid {LINE};padding:.15rem 0 .6rem .8rem;margin-top:.6rem;">'
        f'<div style="font-size:.86rem;font-weight:600;color:{INK};margin-bottom:.25rem;">{title}</div>'
        f'<div style="font-size:.79rem;color:{SLATE_LT};line-height:1.6;">{body}</div></div>',
        unsafe_allow_html=True,
    )


with TABS[3]:
    section("The problem", "Two fires, one pixel",
            "A satellite radiometer reports heat, not intent. Every winter the same thermal "
            "signature is produced by a paddy field being cleared and by a factory losing "
            "containment — and the second one is an emergency.")

    i1, i2 = st.columns(2, gap="large")
    with i1:
        figure(IMAGES["modis_fires"],
               "Fires and smoke across northern India",
               "MODIS captured hundreds of simultaneous thermal detections across the "
               "Indo-Gangetic plain. At this density, an industrial incident is statistically "
               "invisible unless something separates it from seasonal burning. "
               "<i>NASA Earth Observatory, public domain.</i>")
    with i2:
        figure(IMAGES["crop"],
               "Seasonal crop-residue burning",
               "Agricultural fires are numerous, short-lived, and far from industrial "
               "infrastructure. They dominate the raw feed — and they are exactly what an "
               "alerting system must learn to stand down on. "
               "<i>NASA Earth Observatory, public domain.</i>")

    st.markdown("<div style='height:1.2rem'></div>", unsafe_allow_html=True)
    i3, i4 = st.columns(2, gap="large")
    with i3:
        figure(IMAGES["flaring"],
               "The industrial thermal signature at night",
               "Persistent industrial heat sources appear in the same place, pass after pass, "
               "long after crop fires have burnt out. Persistence plus proximity is the "
               "signature FireWatch keys on. <i>NASA / Suomi NPP VIIRS, public domain.</i>")
    with i4:
        figure(IMAGES["haze"],
               "Why the distinction has consequences",
               "Uncontrolled industrial burning drives the pollution load over dense urban "
               "populations and delays emergency response. Correct classification is what turns "
               "a data feed into a dispatch decision. <i>NASA JPL / MISR, public domain.</i>")

    st.markdown("<div style='height:1.6rem'></div>", unsafe_allow_html=True)
    section("What this changes", "From raw feed to accountable action")
    w1, w2, w3 = st.columns(3, gap="medium")
    for col, (ico, head, body) in zip((w1, w2, w3), [
        ("satellite", "Screens the whole country",
         "Open satellite feeds already cover India daily. FireWatch turns that public data into "
         "a national screening layer without deploying a single new sensor."),
        ("factory", "Separates industry from agriculture",
         "Distance to mapped industrial sites and recurrence across days let the system stand "
         "down on seasonal burning and escalate persistent industrial heat."),
        ("shield", "Hands over a ranked worklist",
         "Authorities receive an ordered queue with coordinates, confidence and evidence — not "
         "an undifferentiated feed of thermal pixels."),
    ]):
        col.markdown(
            '<div class="fw-card fw-reveal">'
            f'<div style="color:{ACCENT};margin-bottom:.5rem;">{icon(ico, 22, ACCENT)}</div>'
            f'<h4>{head}</h4><p>{body}</p></div>',
            unsafe_allow_html=True,
        )

# ---------------------------------------------------------------------------
# 13. TAB — SYSTEM ARCHITECTURE
# ---------------------------------------------------------------------------
def render_pipeline() -> None:
    """Processing chain as flow-laid HTML cards. The earlier SVG version used
    fixed-width boxes, so any label longer than the box ran outside it — this
    wraps instead, at any window width."""
    stages = [
        ("Stage 01", "Acquisition", TYPE_COLORS["Industrial Fire"], [
            "NASA FIRMS hotspots (VIIRS / MODIS)",
            "OpenStreetMap industrial polygons",
            "distance to nearest mapped site",
            "recurrence count per location",
        ]),
        ("Stage 02", "Classification", ACCENT, [
            "deterministic rule engine",
            "proximity and persistence thresholds",
            "assigns fire type and risk band",
            "auditable — no black box",
        ]),
        ("Stage 03", "Delivery", INK_2, [
            "operational map and analytics",
            "ranked escalation queue",
            "CSV export for field teams",
            "runs offline on a single machine",
        ]),
    ]
    parts = []
    for i, (tag, title, colour, items) in enumerate(stages):
        if i:
            parts.append('<div class="arrow">&#10230;</div>')
        parts.append(
            '<div class="stage">'
            f'<span class="top" style="background:{colour}"></span>'
            '<div class="inner">'
            f'<div class="tag">{tag}</div><h5>{title}</h5>'
            '<ul>' + "".join(f"<li>{x}</li>" for x in items) + '</ul>'
            '</div></div>'
        )
    st.markdown('<div class="fw-pipe fw-reveal">' + "".join(parts) + "</div>",
                unsafe_allow_html=True)


with TABS[4]:
    section("Architecture", "How the platform is composed",
            "A single CSV contract between each stage, so any stage can be rebuilt or "
            "replaced without touching the others.")

    render_pipeline()

    st.markdown("<div style='height:1.2rem'></div>", unsafe_allow_html=True)
    s1, s2, s3 = st.columns(3, gap="medium")
    for col, (img, step, head, body, chips) in zip((s1, s2, s3), [
        (IMAGES["asia_lights"], "Stage 01 · Data layer", "Acquisition & enrichment",
         "Thermal hotspots are pulled from NASA FIRMS and joined against OpenStreetMap "
         "industrial land use. Each detection gains two derived fields: metres to the nearest "
         "mapped site, and how many separate days that location has fired.",
         ["NASA FIRMS", "OpenStreetMap", "geopy", "pandas"]),
        (IMAGES["thermal"], "Stage 02 · Rule engine", "Rule-based classification",
         "Explicit thresholds — not a trained model — convert proximity and persistence into a "
         "fire type and risk band. Every escalation can be explained to an inspector in one "
         "sentence, which is what makes it usable by an authority.",
         ["Deterministic rules", "Explainable", "pandas"]),
        (IMAGES["modis_fires"], "Stage 03 · Interface", "Decision surface",
         "This application. It renders the classified feed as an operational map, an analytics "
         "view for the reviewing officer, and a ranked escalation queue that exports straight "
         "to CSV.",
         ["Streamlit", "Folium / Leaflet", "Plotly", "GSAP"]),
    ]):
        with col:
            framed_image(img, "arch_" + img.stem.replace("-", "_"), height=190)
            st.markdown(
                '<div class="fw-card fw-reveal" style="margin-top:.6rem;">'
                f'<div class="step">{step}</div><h4>{head}</h4><p>{body}</p>'
                '<div style="margin-top:.75rem;">'
                + "".join(f'<span class="fw-chip">{c}</span>' for c in chips)
                + '</div></div>',
                unsafe_allow_html=True,
            )

    section("Integration", "The handover contract",
            "The application reads one file. Nothing else needs to change to go live.")
    h1, h2 = st.columns([1.15, 1], gap="large")
    with h1:
        st.markdown(
            '<div class="fw-card fw-reveal">'
            f'<div style="color:{ACCENT};margin-bottom:.5rem;">{icon("database", 20, ACCENT)}</div>'
            '<h4>Drop-in activation</h4>'
            '<p>Place <span class="fw-mono" style="color:' + INK + ';">'
            + DATA_CANDIDATES[0] + '</span> '
            'in this folder. The dashboard picks it up on the next interaction, keys its cache to '
            'the file timestamp, and switches out of sample mode by itself — no code edit, '
            'no restart.</p>'
            '<p style="margin-top:.7rem;">Column names are normalised on load, so '
            '<span class="fw-mono">latitude</span>, <span class="fw-mono">fire_type</span>, '
            '<span class="fw-mono">acq_date</span> and similar upstream spellings all resolve. '
            'Missing optional fields are filled rather than fatal, and a malformed file falls '
            'back to the sample set with the parse error shown in the control panel.</p></div>',
            unsafe_allow_html=True,
        )
    with h2:
        contract = pd.DataFrame([
            ("lat, lon", "required", "Decimal degrees, WGS 84"),
            ("type", "expected", "Industrial Fire / Agricultural Burning / Other-Natural"),
            ("risk_level", "expected", "Critical / High / Medium / Low"),
            ("confidence", "expected", "0–100, or FIRMS l / n / h"),
            ("distance_km", "optional", "To nearest mapped industrial site"),
            ("days_seen", "optional", "Distinct days the pixel returned"),
            ("detected_on", "optional", "Any parseable date"),
            ("state, source", "optional", "Free text, used for grouping"),
        ], columns=["Column", "Status", "Meaning"])
        st.dataframe(contract, hide_index=True, use_container_width=True, height=330)

# ---------------------------------------------------------------------------
# 14. FOOTER
# ---------------------------------------------------------------------------
st.markdown(
    '<div class="fw-foot">'
    '<div style="display:flex;flex-wrap:wrap;gap:2.4rem;justify-content:space-between;">'
    '<div style="max-width:46ch;">'
    f'<b>FireWatch</b> — Industrial fire &amp; persistent thermal source intelligence.<br>'
    f'Release 1.0 &nbsp;·&nbsp; Screening layer for satellite thermal anomalies '
    f'over India.'
    '</div>'
    '<div style="max-width:52ch;">'
    'Imagery: NASA Earth Observatory, NASA/NOAA Suomi NPP VIIRS and NASA JPL MISR — public '
    'domain. Basemaps &copy; Esri, HERE, Garmin and OpenStreetMap contributors. '
    + ('Detection records shown are sample data.' if not USING_REAL_DATA
       else 'Detection records supplied by the classified detection feed.') +
    '</div></div>'
    # closing credit — the last line on the page
    f'<div style="margin-top:1.3rem;padding-top:0.95rem;border-top:1px solid {LINE};'
    f'text-align:center;letter-spacing:0.02em;">'
    f'Made by <b>Team Binary Brains</b></div>'
    '</div>',
    unsafe_allow_html=True,
)
