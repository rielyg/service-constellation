// Service constellation: one spiral cluster per doctor, one point per paper.
// Papers shared by two or more doctors on the service sit between them and are
// tied to each doctor's core, so collaboration shows as bridges.
// Runs in the browser (GitHub Pages) and in headless Chromium (GitHub Actions).
(function () {
  // Sunrise order: the most senior doctors take the violet and rose end,
  // the most junior the gold end.
  const STOPS = ["#a77bf3", "#e86bc4", "#ff6f91", "#ff8c6b", "#ffa552", "#ffc65c", "#ffe08a", "#fff1b8"];
  const sunrise = d3.interpolateRgbBasis(STOPS);
  const BG = "#160e22";
  const NOW = 2027;

  function weekIndex(dateStr) {
    return Math.floor(Date.parse(dateStr + "T00:00:00Z") / (7 * 864e5));
  }

  function render(canvas, raw, opts = {}) {
    const W = canvas.width, H = canvas.height, S = Math.min(W, H);
    const ctx = canvas.getContext("2d");
    const week = weekIndex(raw.snapshot_date);

    // Stable layout seed (who sits where changes only when the roster changes);
    // weekly seed for everything that should shimmer from week to week.
    const layoutRng = new Math.seedrandom("layout|" + raw.doctors.map((d) => d.name).join("|"));
    const rng = new Math.seedrandom(opts.seed || `${raw.snapshot_date}|${raw.works.length}`);
    const rand = (a, b) => a + (b - a) * rng();

    const docs = raw.doctors.map((d, i) => ({ ...d, i, own: 0, shared: 0 }));
    const works = raw.works.map(([id, year, cites, fresh, members, lead]) => ({ id, year, cites, fresh, members, lead }));
    works.forEach((w) => w.members.forEach((m) => {
      docs[m].own += w.cites;
      if (w.members.length > 1) docs[m].shared += 1;
    }));

    // Each paper lives in its lead author's cluster. Older data files have no
    // lead field: fall back to the most junior service author on the paper.
    works.forEach((w) => {
      if (w.lead == null || !w.members.includes(w.lead)) {
        w.lead = w.members.reduce((a, b) => (docs[b].start > docs[a].start ? b : a));
      }
    });

    // Colors by seniority
    const order = docs.slice().sort((a, b) => a.start - b.start || b.cites - a.cites);
    order.forEach((d, k) => {
      const t = order.length > 1 ? k / (order.length - 1) : 0.5;
      d.color = d3.hsl(sunrise(0.04 + 0.9 * t));
    });

    // Cluster size by citations of the papers shown
    const maxOwn = d3.max(docs, (d) => d.own) || 1;
    docs.forEach((d) => (d.R = 0.045 + 0.14 * Math.sqrt(d.own / maxOwn)));

    // Pairwise shared-paper counts pull collaborators together
    const pair = new Map();
    works.forEach((w) => {
      const m = w.members;
      for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) {
        const k = m[a] + "-" + m[b];
        pair.set(k, (pair.get(k) || 0) + 1);
      }
    });
    const links = [...pair].map(([k, n]) => {
      const [s, t] = k.split("-").map(Number);
      return { source: s, target: t, n };
    });
    const maxN = d3.max(links, (l) => l.n) || 1;

    docs.forEach((d) => { d.x = layoutRng() - 0.5; d.y = layoutRng() - 0.5; });
    const sim = d3.forceSimulation(docs)
      .randomSource(layoutRng)
      .force("link", d3.forceLink(links)
        .distance((l) => (l.source.R + l.target.R) * 2.1)
        .strength((l) => 0.01 + 0.15 * Math.sqrt(l.n / maxN)))
      .force("charge", d3.forceManyBody().strength(-0.004))
      .force("collide", d3.forceCollide((d) => d.R * 1.7).strength(1))
      .force("x", d3.forceX(0).strength(0.04))
      .force("y", d3.forceY(0).strength(0.04))
      .stop();
    for (let i = 0; i < 500; i++) sim.tick();

    // Slow weekly rotation of the whole sky, then fit to the canvas
    const rot = (week * 7 * Math.PI) / 180;
    docs.forEach((d) => {
      const x = d.x, y = d.y;
      d.x = x * Math.cos(rot) - y * Math.sin(rot);
      d.y = x * Math.sin(rot) + y * Math.cos(rot);
    });
    const m = Math.round(S * 0.035);
    const footer = opts.caption === false ? 0 : Math.round(H * 0.045);
    const box = { x0: m, y0: m, x1: W - m, y1: H - m - footer };
    const ext = {
      x0: d3.min(docs, (d) => d.x - d.R), x1: d3.max(docs, (d) => d.x + d.R),
      y0: d3.min(docs, (d) => d.y - d.R), y1: d3.max(docs, (d) => d.y + d.R),
    };
    const pad = 0.04 * S;
    const k = Math.min((box.x1 - box.x0 - 2 * pad) / (ext.x1 - ext.x0), (box.y1 - box.y0 - 2 * pad) / (ext.y1 - ext.y0));
    const ox = (box.x0 + box.x1) / 2 - ((ext.x0 + ext.x1) / 2) * k;
    const oy = (box.y0 + box.y1) / 2 - ((ext.y0 + ext.y1) / 2) * k;
    docs.forEach((d) => { d.px = ox + d.x * k; d.py = oy + d.y * k; d.pr = d.R * k; });

    // Each doctor's papers trail out along spiral arms, newest near the core
    docs.forEach((d) => {
      d.arms = 2 + Math.floor(rng() * 3);
      d.phase = rng() * Math.PI * 2;
      d.twist = (rng() < 0.5 ? -1 : 1) * rand(1.6, 2.8);
    });
    const maxCites = d3.max(works, (w) => w.cites) || 1;
    const rScale = (c) => S * (0.0016 + 0.0105 * Math.sqrt(c / maxCites));
    works.forEach((w) => {
      w.r = rScale(w.cites);
      {
        const d = docs[w.lead];
        const span = Math.max(4, NOW - d.start);
        const age = Math.min(1, Math.max(0, (NOW - w.year) / span));
        const arm = Math.floor(rng() * d.arms);
        const a = d.phase + (arm * 2 * Math.PI) / d.arms + age * d.twist + rand(-0.32, 0.32);
        const dist = d.pr * (0.1 + 0.9 * Math.pow(age, 0.85)) * rand(0.82, 1.12);
        w.x = d.px + Math.cos(a) * dist;
        w.y = d.py + Math.sin(a) * dist;
      }
    });

    // ---- draw ----
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    const sky = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, S * 0.75);
    sky.addColorStop(0, "#2b1940");
    sky.addColorStop(1, "rgba(22,14,34,0)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const dawn = ctx.createLinearGradient(0, H, 0, H * 0.6);
    dawn.addColorStop(0, "rgba(255,120,90,0.16)");
    dawn.addColorStop(1, "rgba(255,120,90,0)");
    ctx.fillStyle = dawn;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    ctx.clip();

    // Background dust
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(255,244,230,${rand(0.08, 0.45)})`;
      const s = rand(0.4, 1.6) * S / 1600;
      ctx.fillRect(rand(box.x0, box.x1), rand(box.y0, box.y1), s, s);
    }

    ctx.globalCompositeOperation = "lighter";

    // Nebula around each doctor
    docs.forEach((d) => {
      const g = ctx.createRadialGradient(d.px, d.py, 0, d.px, d.py, d.pr * 1.35);
      g.addColorStop(0, rgba(d.color, 0.22));
      g.addColorStop(0.5, rgba(d.color, 0.08));
      g.addColorStop(1, rgba(d.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(d.px, d.py, d.pr * 1.35, 0, Math.PI * 2); ctx.fill();
    });

    // Arcs: each doctor's three strongest collaborations, width by shared papers
    const shown = new Set();
    docs.forEach((d) => {
      links.filter((l) => l.source === d || l.target === d)
        .sort((a, b) => b.n - a.n).slice(0, 3).forEach((l) => shown.add(l));
    });
    [...shown].forEach((l) => {
      const a = l.source, b = l.target;
      const g = ctx.createLinearGradient(a.px, a.py, b.px, b.py);
      g.addColorStop(0, rgba(a.color, 0.34));
      g.addColorStop(0.5, rgba(d3.interpolateRgb(a.color, b.color)(0.5), 0.1));
      g.addColorStop(1, rgba(b.color, 0.34));
      ctx.strokeStyle = g;
      ctx.lineWidth = S * (0.0008 + 0.006 * Math.sqrt(l.n / maxN));
      const dx = b.px - a.px, dy = b.py - a.py;
      const bend = rand(0.08, 0.2) * (rng() < 0.5 ? -1 : 1);
      const mx = (a.px + b.px) / 2 - dy * bend, my = (a.py + b.py) / 2 + dx * bend;
      ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.quadraticCurveTo(mx, my, b.px, b.py); ctx.stroke();
    });

    // Papers
    works.forEach((w) => {
      const col = docs[w.lead].color;
      const glow = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.r * 3);
      glow.addColorStop(0, rgba(col, 0.32));
      glow.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
    works.forEach((w) => {
      const col = docs[w.lead].color;
      const core = d3.hsl(col.h, Math.min(1, col.s * 1.05), Math.min(0.86, col.l + 0.04));
      ctx.fillStyle = rgba(core, 0.92);
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
    });

    // New citations this week: one ray per citation
    works.filter((w) => w.fresh > 0).forEach((w) => flare(ctx, w, rng, S));

    // Doctor cores
    docs.forEach((d) => {
      const r = S * 0.0045;
      ctx.save();
      ctx.shadowColor = d.color.formatHex();
      ctx.shadowBlur = r * 4;
      ctx.fillStyle = "#fffaf0";
      ctx.beginPath(); ctx.arc(d.px, d.py, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = d.color.formatHex();
      ctx.lineWidth = Math.max(1.5, S / 900);
      ctx.beginPath(); ctx.arc(d.px, d.py, r * 2.2, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();

    if (opts.caption !== false) {
      ctx.fillStyle = "#f4f1ff";
      ctx.font = `${Math.round(footer * 0.42)}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      const label = `week of ${raw.snapshot_date}` + (raw.simulated ? " (simulated data)" : "");
      ctx.fillText(label, W - m, H - m * 0.7 - footer / 2);
    }

    return { docs, works };
  }

  function rgba(c, a) {
    const r = d3.rgb(c);
    return `rgba(${Math.round(r.r)},${Math.round(r.g)},${Math.round(r.b)},${a})`;
  }

  function flare(ctx, w, rng, S) {
    ctx.save();
    ctx.strokeStyle = "#fffbe6";
    ctx.shadowColor = "#fff36b";
    ctx.shadowBlur = S * 0.004;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, S / 1400);
    const len = w.r * 2.2 + S * 0.006 + Math.sqrt(w.fresh) * S * 0.0025;
    const off = rng() * Math.PI * 2;
    for (let i = 0; i < w.fresh; i++) {
      const a = off + (i / w.fresh) * Math.PI * 2;
      const l = len * (0.65 + 0.35 * rng());
      ctx.beginPath();
      ctx.moveTo(w.x + Math.cos(a) * w.r * 1.2, w.y + Math.sin(a) * w.r * 1.2);
      ctx.lineTo(w.x + Math.cos(a) * l, w.y + Math.sin(a) * l);
      ctx.stroke();
    }
    ctx.restore();
  }

  window.Constellation = { render };
})();
