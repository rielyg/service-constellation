"""Fetch every roster doctor's works from OpenAlex and write site/data/service.json.

For each doctor, the TOP_N most cited works are kept. A work that lists two or
more roster doctors as authors is a shared paper and becomes a bridge in the
constellation. One snapshot of citation counts is saved per run in
data/snapshots/ so the next run can compute new citations per paper.

Environment variables (all optional):
  OPENALEX_API_KEY  OpenAlex API key, if your usage needs one
  OPENALEX_MAILTO   contact email for the OpenAlex polite pool
  TOP_N             most-cited works kept per doctor (default 60)

Per-doctor options in roster.json, for OpenAlex profiles that include another
person's papers:
  "since": 2010            drop works published before this year
  "exclude": ["W123..."]   drop these OpenAlex work IDs
"""
import datetime as dt
import json
import os
import pathlib
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

TOP_N = int(os.environ.get("TOP_N", "60"))
SKIP_TYPES = {"erratum", "paratext", "retraction", "peer-review"}
# Keep Life Sciences (1) and Health Sciences (4). This drops works that a
# mixed OpenAlex profile picked up from an unrelated person in another field.
KEEP_DOMAINS = {"1", "4"}

ROOT = pathlib.Path(__file__).resolve().parent.parent
ROSTER = ROOT / "roster.json"
OUT = ROOT / "site" / "data" / "service.json"
SNAP_DIR = ROOT / "data" / "snapshots"


def get(url, params):
    headers = {"User-Agent": "service-constellation"}
    key = os.environ.get("OPENALEX_API_KEY", "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    if os.environ.get("OPENALEX_MAILTO"):
        params["mailto"] = os.environ["OPENALEX_MAILTO"]
    full = url + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers=headers), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            body = e.read().decode("utf-8", "replace")[:500]
            hint = "" if key else " No OPENALEX_API_KEY secret is set; list requests from GitHub runners need one."
            raise SystemExit(f"OpenAlex returned HTTP {e.code} for {url}: {body}{hint}")


def keep(w):
    if w.get("type") in SKIP_TYPES:
        return False
    topic = w.get("primary_topic") or {}
    dom = ((topic.get("domain") or {}).get("id") or "").rsplit("/", 1)[-1]
    return not dom or dom in KEEP_DOMAINS


def fetch_works(doc):
    ids = doc["ids"]
    since = doc.get("since", 0)
    exclude = set(doc.get("exclude", []))
    works, cursor = [], "*"
    while cursor:
        page = get("https://api.openalex.org/works", {
            "filter": f"authorships.author.id:{'|'.join(ids)},is_retracted:false",
            "select": "id,publication_year,cited_by_count,primary_topic,type",
            "per-page": "200",
            "cursor": cursor,
        })
        works.extend(page["results"])
        cursor = page["meta"].get("next_cursor")
        if not page["results"]:
            break
    return [
        w for w in works
        if keep(w)
        and (w.get("publication_year") or 0) >= since
        and w["id"].rsplit("/", 1)[-1] not in exclude
    ]


def latest_snapshot(today):
    snaps = sorted(p for p in SNAP_DIR.glob("*.json") if p.stem < today)
    return json.loads(snaps[-1].read_text()) if snaps else {}


def main():
    today = dt.date.today().isoformat()
    roster = json.loads(ROSTER.read_text())["doctors"]

    info = {}        # work id -> (year, cites)
    members = {}     # work id -> set of doctor indices
    per_doc = []     # list of work ids per doctor, most cited first
    doctors = []
    for i, d in enumerate(roster):
        ws = fetch_works(d)
        ws.sort(key=lambda w: w["cited_by_count"], reverse=True)
        ids = []
        for w in ws:
            wid = w["id"].rsplit("/", 1)[-1]
            info[wid] = (w.get("publication_year") or 0, w["cited_by_count"])
            members.setdefault(wid, set()).add(i)
            ids.append(wid)
        per_doc.append(ids)
        years = sorted(info[x][0] for x in ids if info[x][0])
        # Third-earliest year: resists one or two stray early papers from a
        # mis-merged profile without pulling prolific careers toward the present
        start = years[min(2, len(years) - 1)] if years else today[:4]
        doctors.append({
            "name": d["name"],
            "start": int(start),
            "works": len(ids),
            "cites": sum(info[x][1] for x in ids),
        })
        print(f"{d['name']}: {len(ids)} works")

    included = []
    seen = set()
    for ids in per_doc:
        for wid in ids[:TOP_N]:
            if wid not in seen:
                seen.add(wid)
                included.append(wid)

    prev = latest_snapshot(today)
    rows, counts = [], {}
    for wid in included:
        year, cites = info[wid]
        counts[wid] = cites
        fresh = max(0, cites - prev[wid]) if wid in prev else 0
        rows.append([wid, year, cites, fresh, sorted(members[wid])])

    shared = sum(1 for r in rows if len(r[4]) > 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "snapshot_date": today,
        "simulated": False,
        "top_n": TOP_N,
        "doctors": doctors,
        "new_citations_this_week": sum(r[3] for r in rows),
        "fields": ["id", "year", "cites", "new_this_week", "doctors"],
        "works": rows,
    }, separators=(",", ":")))

    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    (SNAP_DIR / f"{today}.json").write_text(json.dumps(counts, separators=(",", ":")))
    print(f"{len(rows)} works ({shared} shared), {sum(r[3] for r in rows)} new citations since last snapshot")


if __name__ == "__main__":
    main()
