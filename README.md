# FireWatch

**Industrial fire and persistent thermal source intelligence.**

FireWatch screens NASA FIRMS satellite thermal hotspots against mapped industrial sites, tests each one for recurrence, and hands a district safety authority a short, ranked worklist instead of a night of raw thermal points.

Release 1.0 · Static website + Python (Streamlit) operational dashboard · No API keys needed

---

## The problem

A satellite radiometer reports **heat, not intent**. Every winter the same thermal signature comes from a paddy field being cleared and from a factory losing containment. Only the second one is an emergency.

- In one season, field teams in Punjab visited **40,557** satellite alert sites and found **no fire at 17,832** of them (Punjab Remote Sensing Centre, reported by The Tribune).
- When nearly half the alerts are wasted trips, teams stop trusting the feed, and that is how real industrial fires get missed.

FireWatch does not add alerts. It removes the ones that waste a team's morning, and it puts the persistent industrial heat sources at the top.

## How it decides

Three written rules, with no trained model. An officer has to be able to defend every verdict, so every threshold is visible and every row can be checked by hand.

| Question | Rule |
|---|---|
| **Proximity**: is the heat at a mapped industrial site? | within **3 km** of an OpenStreetMap industrial polygon |
| **Persistence**: does it keep coming back? | seen on **3 or more** separate days |
| **Confidence**: how sure is the sensor? | **85%** or better for top priority |

- Each detection gets a **cause** (Industrial Fire, Agricultural Burning, or Other/Natural) and a **risk tier** (Critical, High, Medium or Low).
- The escalation queue holds **Critical and High only**, ordered by severity and then confidence.
- **Priority trend**: a site that has been Critical on 3 or more days and has come back on 5 or more goes to the top automatically.
- Crop-residue burning is **labelled, not deleted**. It stays on the map as context and stays out of the queue.
- VIIRS confidence `low / nominal / high` is read as 35% / 65% / 90%, so one scale runs through the whole system.
- Recommended action: route to the district industrial-safety authority for ground verification within 24 hours.

## Pipeline

```
NASA FIRMS (VIIRS, MODIS)  ─┐
                            ├─► Acquisition ─► Rule engine ─► Delivery
OpenStreetMap industry     ─┘   de-duplicate    cause +        map, analytics,
                                distance to     risk tier      ranked queue,
                                nearest site    recurrence     CSV / reports
                                recurrence
```

One CSV contract sits between each stage, so any stage can be rebuilt or replaced without touching the others.

---

## What's in this repo

| Path | What it is |
|---|---|
| `index.html` … `faq.html` | The FireWatch website: 11 pages, plain HTML/CSS/JS, no build step |
| `assets/` | Site scripts, styles, imagery and the hero video |
| `dashboard/` | The Python operational dashboard (Streamlit), see [`dashboard/README.md`](dashboard/README.md) |

## Website features

### Pages

| Page | What it does |
|---|---|
| **Home** (`index.html`) | Scroll-driven story from orbit to the officer's desk: the rules, the five pipeline jobs, and who it is built for |
| **Problem** (`problem.html`) | Why raw satellite alerts fail: "two fires, one pixel", the Punjab false-alert figures, and alert fatigue |
| **Dashboard** (`dashboard.html`) | World thermal-anomaly map with Map / Satellite switch, counts, and the **Sites requiring intervention** queue with priority trend |
| **Regions** (`regions.html`) | Pick a state, district, city or any named area. FireWatch draws its real boundary, analyses every incident inside it and in the surrounding band (30% of its width, at least 50 km), adds live satellite passes, and lists the incidents to act on and the ones pressing on the edge |
| **Compare** (`compare.html`) | Raw NASA FIRMS feed next to the screened feed on two linked maps (side by side or one at a time). Includes a before/after card for any single record and the counts of alerts received against alerts escalated |
| **Thermal DNA** (`thermal-dna.html`) | "Is this heat normal here?" Pick any point to get a 10-year climate baseline, a live 7-day fire fingerprint (recurrence, night burning, clustering), season context, what sits within 3 km, and a 7-day threat history scored with the same three rules |
| **Respond** (`respond.html`) | Road route from your position to an incident, with an arrival time that accounts for the hour's traffic, the weather on the way and emergency right of way. Live GPS follow re-routes if you leave the line by more than 80 m. One-tap hand-off to Google Maps, Apple Maps or Waze |
| **Report** (`report.html`) | Builds a situation report (feed, priority list, regions, alerts, dispatches, every timestamp and rule) and exports it as **PDF, HTML, Word, Excel, CSV, JSON, Markdown or plain text**. Everything is built in the browser and nothing is uploaded |
| **How it decides** (`how-it-decides.html`) | Interactive walk-through of the three rules on a real record, plus live screening of the sky above you |
| **Architecture** (`architecture.html`) | Acquisition, rule engine and delivery, and the CSV handover contract |
| **FAQ** (`faq.html`) | Straight answers: why rules and not a model, offline use, coverage, speed |

### On every page

- **Therma**: a bilingual (English and Hindi) site guide that answers questions about FireWatch. It is rule-based and works without a network.
- **Satellite evidence viewer**: dated, real imagery of any hotspot from NASA GIBS (the tiles behind NASA Worldview), with a sensor switch, date stepping, a cloud hint, a before/after split handle, and live VIIRS fire pixels overlaid.
- **Emergency SOS**: drafts a structured resource request for one incident from the record, the live VIIRS feed and OpenStreetMap, and lists the nearest fire stations, hospitals and police with phone numbers. You send it yourself by email, WhatsApp, SMS, webhook, print or a call link, after a confirmation step so nothing leaves by accident. *It does not dispatch straight into a government control room; that needs an official integration.*
- **Alert centre**: raises an alert for every Critical detection, every sustained-Critical site, every live VIIRS pass confirmed at a Critical or High site, and every SOS dispatch. Each alert shows the satellite pass time (UTC and local), when it was raised and when it was last updated. Desktop notifications and sound are opt-in. State is saved in your browser.

### Live services (all keyless)

NASA FIRMS VIIRS via the Esri / NASA Living Atlas feed · NASA GIBS imagery · Open-Meteo weather and climate · OpenStreetMap Nominatim and Overpass · OSRM and Valhalla routing · Esri basemaps

## Dashboard features (`dashboard/`)

A Streamlit app (`final.py`) for the operator's desk, with five tabs:

1. **Live Map**: every detection on a Folium map, drawn as risk markers, clusters or a heat-density layer, over satellite, light or dark keyless Esri basemaps, with a searchable detection log
2. **Analytics**: composition by cause and risk, proximity plotted against confidence (the decision logic), and a where-and-when trend view
3. **Priority Alerts**: the ranked escalation queue (Critical and High), with **CSV export** of the current view for field teams
4. **Impact & Context**: why this matters, with NASA reference imagery
5. **System Architecture**: the pipeline and the data contract

Other features:

- **Filters panel**: risk level and fire classification toggles, a minimum-confidence slider and a maximum-distance-to-industry slider. An always-visible **Filters** button opens it, also on phones.
- **Dark / Light theme**, stored in the URL (`?theme=dark`) so a shared link keeps it. The map follows the theme.
- **Responsive layout**: KPI tiles, tabs and alert rows reflow for phone screens.
- **Live feed hot-swap**: drop `detections_classified.csv` (or `firewatch_detections.csv` / `pair2_classified.csv`) next to `final.py`. The app picks it up on the next interaction, with no restart and no code change. Until then it runs on a built-in sample set.
- **Forgiving loader**: column names are normalised (`latitude`, `fire_type`, `acq_date`, … all resolve), missing optional fields are filled, and a broken file falls back to the sample data with the error shown.
- **Works offline**: fonts fall back to the system stack and nothing depends on a credential.

### Feed format

| Column | Status | Meaning |
|---|---|---|
| `lat`, `lon` | required | decimal degrees, WGS 84 |
| `type` | expected | Industrial Fire / Agricultural Burning / Other-Natural |
| `risk_level` | expected | Critical / High / Medium / Low |
| `confidence` | expected | 0–100, or FIRMS `l` / `n` / `h` |
| `distance_km` | optional | to the nearest mapped industrial site |
| `days_seen` | optional | distinct days the pixel returned |
| `detected_on` | optional | any parseable date |
| `state`, `source` | optional | free text, used for grouping |

---

## Running it

### Website

No build step. Serve the repo folder with any static server:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080/index.html>. Use a server rather than opening the files directly, because the hero video and live services need `http://`.

### Dashboard

```bash
cd dashboard
pip install -r requirements.txt
streamlit run final.py
```

It opens at <http://localhost:8501>. To use it from a phone on the same Wi-Fi, run `streamlit run final.py --server.address 0.0.0.0` and open the *Network URL* that Streamlit prints.

Requirements: Python 3.9+, `streamlit`, `folium`, `streamlit-folium`, `pandas`, `numpy`, `plotly`.

## Who it is for

- **District industrial-safety authorities**: a ranked morning list instead of a night of thermal points. Every row carries the satellite, the distance, the recurrence count and the rule that fired.
- **Pollution control boards**: persistent heat at a registered unit, counted across passes, with the history an inspection notice needs.
- **Plant operators**: a view of their own perimeter, so a flare or furnace running past its window is caught before somebody else reports it.

The rules work anywhere. FIRMS covers the globe and OpenStreetMap has industrial polygons on every continent. The sample feed includes India and a set of world sites.

## Status and roadmap

**Done:** website (11 pages + site-wide tools) and dashboard Release 1.0.

**Next:**
- Automatic daily download of new FIRMS hotspot data
- Host the dashboard online with a public link
- A pilot with one pollution control board or fire office

**Limits to know:** the sample detection feed uses realistic geography with synthetic readings. Traffic in Respond is a typical hour-of-day profile, not live congestion (live traffic is handed off to map apps). SOS prepares and sends messages through your own channels and does not connect to official control rooms.

## Credits

Data: NASA FIRMS (VIIRS, MODIS), NASA GIBS / Worldview, OpenStreetMap contributors, Open-Meteo. Basemaps © Esri, © OpenStreetMap contributors. Reference imagery: NASA Earth Observatory, Suomi NPP VIIRS, JPL MISR (public domain). Punjab alert figures via The Tribune.
