"""Write simulated site/data/service.json for previewing the drawing without OpenAlex.

Per-doctor totals are approximate OpenAlex figures from November 2026. Papers,
shared papers and weekly citations are invented. The output is flagged
"simulated": true and the image caption says so.
Usage: python scripts/make_demo_data.py [seed]
"""
import json
import math
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOP_N = 60
# name: (total citations, works, approximate first-publication year)
APPROX = {
    "Mark Awad": (35605, 1269, 2010), "Kathryn C. Arbour": (12838, 317, 2014),
    "Jamie E. Chaft": (36004, 533, 2009), "Joseph M. Chan": (8501, 83, 2015),
    "Robert Daly": (473, 79, 2016), "Alexander Drilon": (44182, 1233, 2011),
    "Juliana Eng": (2246, 88, 2014), 
    "Afsheen Iqbal": (1704, 59, 2016), "Justin Jee": (1607, 184, 2012),
    "Mark Jeng": (528, 55, 2018), "Mark G. Kris": (109057, 1251, 1980),
    "Yonit Lavin": (10269, 27, 2011), "Jake June-Koo Lee": (21544, 167, 2010),
    "Piro Lito": (10962, 95, 2010), "Kenneth K. Ng": (2240, 64, 2016),
    "Michael D. Offin": (9309, 395, 2016), "Paul K. Paik": (21102, 407, 2008),
    "Isabel Preeshagul": (2061, 115, 2015), "Gregory J. Riely": (104345, 1132, 2003),
    "Jessica Ross": (145, 19, 2015),
    "Rachel Rosenblum": (235, 19, 2015), "Charles M. Rudin": (96680, 1534, 1993),
    "Fernando C. Santini": (1726, 60, 2013), "Adam J. Schoenfeld": (9168, 641, 2015),
    "Cardinale B. Smith": (4280, 318, 2008), "Helena A. Yu": (19691, 571, 2010),
}


def main():
    rng = random.Random(sys.argv[1] if len(sys.argv) > 1 else "demo")
    roster = json.loads((ROOT / "roster.json").read_text())["doctors"]
    doctors, works = [], []
    own = []
    for i, d in enumerate(roster):
        cites, nworks, start = APPROX[d["name"]]
        doctors.append({"name": d["name"], "start": start, "works": nworks, "cites": cites})
        n = min(nworks, TOP_N)
        raw = sorted((rng.lognormvariate(0, 1.3) for _ in range(n)), reverse=True)
        scale = cites * 0.65 / sum(raw)
        ids = []
        for r in raw:
            wid = f"W{rng.randrange(10**9, 10**10)}"
            year = rng.randint(max(start, 1985), 2026)
            works.append([wid, year, max(1, round(r * scale)), 0, [i]])
            ids.append(len(works) - 1)
        own.append(ids)

    # Collaboration: bigger, more senior doctors share more papers
    weight = [math.log10(d["cites"] + 10) for d in doctors]
    for i in range(len(doctors)):
        for j in range(i + 1, len(doctors)):
            p = (weight[i] * weight[j]) / 25
            k = sum(1 for _ in range(6) if rng.random() < p * 0.55)
            for _ in range(k):
                w = works[rng.choice(own[i][: max(3, len(own[i]) // 2)])]
                if j not in w[4]:
                    w[4].append(j)
                if rng.random() < 0.25:
                    m = rng.randrange(len(doctors))
                    if m not in w[4]:
                        w[4].append(m)
    for w in works:
        w[4].sort()
        w[3] = 1 + int(rng.random() * rng.random() * 12) if rng.random() < 0.18 else 0

    out = ROOT / "site" / "data" / "service.json"
    out.write_text(json.dumps({
        "snapshot_date": "2026-11-23",
        "simulated": True,
        "top_n": TOP_N,
        "doctors": doctors,
        "new_citations_this_week": sum(w[3] for w in works),
        "fields": ["id", "year", "cites", "new_this_week", "doctors"],
        "works": works,
    }, separators=(",", ":")))
    print(len(works), "works,", sum(1 for w in works if len(w[4]) > 1), "shared")


if __name__ == "__main__":
    main()
