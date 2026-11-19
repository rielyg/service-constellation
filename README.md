# Service Constellation

Generative art from the publication and citation record of the Thoracic Oncology Service at Memorial Sloan Kettering. Each week a GitHub Action pulls every doctor's works from OpenAlex, draws a new image, adds it to the gallery, and publishes the site to GitHub Pages.

## How the image encodes the data

- Each doctor is a spiral cluster. Cluster size scales with the citations of the papers shown.
- Each point is one of that doctor's most cited papers (60 per doctor by default). Point size scales with citations.
- Within a cluster, recent papers sit near the core and older papers trail out along the arms, so a long career makes a long spiral.
- A paper with two or more service doctors as authors sits in the cluster of the service member who led it: the first author if they are on the service, otherwise the last author, otherwise the service member listed earliest. Arcs join each doctor to their three most frequent coauthors on the service, with width scaled to the number of shared papers. Doctors who publish together are pulled toward each other by the layout.
- Color follows seniority by first publication year, from violet for the longest-publishing doctors through rose, coral and orange to gold for the newest.
- Rays mark papers that gained citations since the last weekly run, one ray per new citation. This layer starts after the second real run.
- Randomness: where each doctor sits is seeded by the roster, so it changes only when the roster changes. The whole sky rotates 7 degrees each week, and paper positions along the arms, the curve of each bridge and the background dust are seeded by the snapshot date. Any past image can be regenerated exactly.

The image carries no names. The interactive page shows names, citation counts and shared papers on hover.

## Roster

`roster.json` lists each doctor with one or more OpenAlex author IDs. Some people have their work split over two profiles (add both IDs), and some profiles are mixed with other people of the same name (marked `verify`). Works outside Life Sciences and Health Sciences are dropped, which removes most stray papers from mixed profiles. For a profile that still holds someone else's papers, add `"since": YEAR` to drop everything published before that year, or `"exclude": ["W..."]` to drop specific OpenAlex work IDs. The lasting fix is for the person to claim their OpenAlex profile and remove the wrong works, which corrects it at the source. To add, remove or correct someone, edit this file. The layout reshuffles when the roster changes.

## Layout

```
roster.json            doctors and OpenAlex author IDs
site/                  published to GitHub Pages
  index.html           interactive page
  gallery.html         all past weeks
  constellation.js     drawing code, shared by the page and the renderer
  vendor/              d3, seedrandom
  data/service.json    current data
  images/              weekly PNGs, latest.png, index.json
data/snapshots/        one citation-count snapshot per run
scripts/
  fetch_openalex.py    OpenAlex -> site/data/service.json
  make_demo_data.py    simulated data for previewing without OpenAlex
  render.mjs           headless Chromium -> PNG
.github/workflows/weekly.yml
```

## Running locally

```
python scripts/fetch_openalex.py        # or: python scripts/make_demo_data.py
npm install --no-save playwright && npx playwright install chromium
node scripts/render.mjs --size 2400
python -m http.server -d site 8000      # then open http://localhost:8000
```

Add `?seed=anything` to the page URL to see other random arrangements of the same week.
