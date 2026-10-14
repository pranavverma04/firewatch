# FireWatch

Industrial fire & persistent thermal source intelligence — an operational
screening layer for satellite thermal anomalies over India.

Release 1.0

## What it does

Satellite thermal hotspots are matched against mapped industrial sites and
tested for recurrence, separating a persistent industrial heat source from
seasonal field burning. The application presents that feed as an operational
map, an analytics view, and a ranked escalation queue that exports to CSV for
field teams.

## Layout

| Path | Purpose |
|---|---|
| `final.py` | The application. |
| `assets/` | Reference imagery (NASA, public domain) and the application icon. |
| `.streamlit/config.toml` | Pinned interface theme. |
| `detections_classified.csv` | *Not committed.* The classified detection feed. |

## Run

```bash
pip install streamlit folium streamlit-folium pandas numpy plotly
streamlit run final.py
```

## Connecting the live feed

Place `detections_classified.csv` beside the application. It is detected on the
next interaction, the cache is keyed to the file's timestamp, and the interface
leaves sample mode by itself — no code change, no restart. `firewatch_detections.csv`
and `pair2_classified.csv` are also accepted, so an existing producer does not
have to be renamed.

Column names are normalised on load, so `latitude` / `fire_type` / `acq_date` /
`nearest_factory_km` and similar upstream spellings all resolve. Missing
optional fields are filled rather than fatal, and an unreadable file falls back
to the sample set with the parse error surfaced in the control panel.

| Column | Status | Meaning |
|---|---|---|
| `lat`, `lon` | required | decimal degrees, WGS 84 |
| `type` | expected | Industrial Fire / Agricultural Burning / Other-Natural |
| `risk_level` | expected | Critical / High / Medium / Low |
| `confidence` | expected | 0–100, or FIRMS `l` / `n` / `h` |
| `distance_km` | optional | to nearest mapped industrial site |
| `days_seen` | optional | distinct days the pixel returned |
| `detected_on` | optional | any parseable date |
| `state`, `source` | optional | free text, used for grouping |

## Running it on a phone as well as a laptop

The layout is responsive: KPI tiles reflow to two columns, the masthead and
tabs scale down, and the alert rows stack so the confidence figure sits under
the detail rather than beside it. The control panel starts collapsed on a
narrow screen and opens over the page from the **Filters** button.

To open it on a phone, start the server so it listens on the network:

```bash
streamlit run final.py --server.address 0.0.0.0
```

Then, with the phone on the same Wi-Fi, browse to the machine's LAN address —
currently `http://10.16.148.227:8501`. Streamlit prints this as the *Network URL* on
start-up. The address changes when the machine joins a different network, so
re-read it rather than memorising it. If the phone cannot connect, allow
incoming connections for Python in System Settings → Network → Firewall.

For an address that works off the local network, deploy the folder to
Streamlit Community Cloud (free, needs a GitHub repo) rather than exposing this
port to the internet.

## Using the interface

Two controls sit in the top-right corner of every screen:

- **Filters** — shows or hides the control panel. Streamlit's own collapse
  handle only appears on hover, which most people never find; this is an
  always-visible replacement.
- **Dark / Light** — switches the theme. The choice is written to the URL
  (`?theme=dark`), so a link can carry it, and Streamlit's own widget theme is
  switched at the same time; the two can never drift apart. The map base layer
  follows the theme by default.

## Operating notes

- Basemaps are keyless Esri services. CartoDB now requires an API key and is
  deliberately not used — nothing on the map can fail for want of a credential.
- Fonts and motion libraries load from CDNs. **Offline the application still
  renders completely** — type falls back to the system stack and reveal
  animations simply do not run. Nothing is hidden by CSS.
- Reference imagery is NASA Earth Observatory / Suomi NPP VIIRS / JPL MISR, all
  public domain, credited in the footer.
