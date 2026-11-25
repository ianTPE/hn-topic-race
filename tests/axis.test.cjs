// Dynamic axis: bars never leave the axis, tick labels never collide, the toggle works and is locked while recording.
const { PAGE, launch, ok, settle } = require("./helper.cjs");
(async () => {
  const b = await launch(), errs = [];
  const open = async o => { const p = await (await b.newContext(o)).newPage(); p.on("pageerror", e => errs.push(e.message)); await p.goto(PAGE); await p.evaluate(() => pause()); p.wasOn = await p.isChecked("#dynAxis"); await p.check("#dynAxis"); return p; };
  const scan = p => p.evaluate(() => {
    let over = 0, low = 9, hits = new Set(), ticks = new Set();
    for (const k of Object.keys(SNAPSHOT.data)) {
      loadSnapshot(k); pause();
      for (let i = 0; i <= 1500; i++) {
        const q = i / 1500, m = axisMax(q), lead = Math.max(...interpolated(q).items.map(o => o.val));
        if (lead > m * (1 + 1e-9)) over++;
        low = Math.min(low, lead / m);
        ctx.font = `${COMPACT ? 16 : 13}px ${getComputedStyle(canvas).getPropertyValue("--mono")}`;
        const t = axisTicks(m).filter(o => o.alpha > .02).sort((x, y) => x.v - y.v)
          .map(o => ({ s: fmtTick(o.v), x: o.v / m * BAR_MAX, w: ctx.measureText(fmtTick(o.v)).width }));
        t.slice(1).forEach((o, j) => { if (o.x - o.w / 2 < t[j].x + t[j].w / 2 + 2) hits.add(`${k} ${t[j].s}/${o.s}`); });
        if (t.length < 2) ticks.add(`${k} ${m}`);
      }
    }
    return { over, low, hits: [...hits], few: [...ticks] };
  });
  for (const [name, o] of [["desktop", { viewport: { width: 1400, height: 900 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true }]]) {
    const p = await open(o), r = await scan(p);
    ok(`${name}: bars stay on the axis`, r.over === 0, r.over);
    ok(`${name}: leader fills most of the axis`, r.low > .55, r.low.toFixed(2));
    ok(`${name}: tick labels never collide`, r.hits.length === 0, r.hits);
    ok(`${name}: always at least two ticks`, r.few.length === 0, r.few);
    await p.close();
  }

  const p = await open({ viewport: { width: 1400, height: 900 } });
  const drawn = () => p.evaluate(() => { render(progress, true); return $("cTitle").textContent; });
  await p.evaluate(() => { loadSnapshot("model"); pause(); progress = .1; render(.1, true); });
  ok("off by default", p.wasOn === false);
  ok("stated on the chart when on", /axis rescales/.test(await drawn()));
  const shot = async () => { await settle(p); return p.evaluate(() => canvas.toDataURL()); };
  const before = await shot(); await p.uncheck("#dynAxis");
  ok("toggle redraws while paused", await shot() !== before && !/axis rescales/.test(await drawn()));
  ok("fixed: one scale for the whole period", await p.evaluate(() => [0, .3, .7, 1].every(q => axisMax(q) === maxVal)));
  await p.click(".cats label:has([value=db])");
  ok("choice survives a category switch", !(await p.isChecked("#dynAxis")));
  await p.check("#dynAxis");
  ok("same frame whatever came before", await (async () => {
    const at = async q => { await p.evaluate(q => { pause(); progress = q; render(q, true); }, q); return shot(); };
    const a = await at(.4), other = await at(.9);
    return a !== other && a === await at(.4);
  })());
  ok("edge data: zeros, flat, two months", await p.evaluate(() => [[0, 0, 0], [5, 5], [0, 900], [.2, .4, .1]].every(v => {
    startRace(v.map((_, i) => `2026-0${i + 1}`), [{ name: "x", color: "#fff", values: v }], 3, null); pause();
    return [0, .25, .5, 1].every(q => { render(q, true); const m = axisMax(q); return Number.isFinite(m) && m >= 1 && interpolated(q).items[0].val <= m * (1 + 1e-9) && axisTicks(m).length > 1; });
  })));
  await p.evaluate(() => { loadSnapshot("db"); pause(); duration = 800; });
  const dl = p.waitForEvent("download"); await p.click("#download"); await p.waitForTimeout(200);
  ok("locked while recording", await p.isDisabled("#dynAxis"));
  await dl; await p.waitForTimeout(200);
  ok("unlocked after recording", !(await p.isDisabled("#dynAxis")));
  ok("no page errors", errs.length === 0, errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
