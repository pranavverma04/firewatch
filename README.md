# FireWatch

Industrial fire and persistent thermal source intelligence. A static site that screens NASA FIRMS thermal hotspots against mapped industrial sites, tests them for recurrence, and gives district safety authorities a ranked worklist.

## Pages

- `index.html` home
- `dashboard.html` map, filters, escalation queue with priority trend
- `regions.html` one area analysed inside its boundary and in the neighbourhood around it
- `compare.html` raw NASA feed against the screened result
- `thermal-dna.html` is this heat normal here, with a seven-day threat history
- `respond.html` route and arrival time to an incident
- `report.html` print or save a situation report (PDF, HTML, Word, Excel, CSV, JSON, Markdown, text)
- `problem.html`, `how-it-decides.html`, `architecture.html`, `faq.html`

Site-wide: Therma (English and Hindi guide), the satellite evidence viewer, the Emergency SOS brief, and the alert centre.

## Running it

No build step. Serve the folder with any static server, for example:

```
python3 -m http.server 8080
```

then open `http://localhost:8080/index.html`.

## Live services used (all keyless)

NASA FIRMS VIIRS via the Esri/NASA Living Atlas feed, NASA GIBS imagery, Open-Meteo, OpenStreetMap Nominatim and Overpass, OSRM and Valhalla routing, Esri basemaps.
