// The two long-run categories: embedded data, playback, form state, request-free.
const { PAGE, OUT, launch, ok, settle } = require("./helper.cjs");
(async () => {
  const b = await launch();
  for (const [name, viewport] of [["desktop", { width: 1400, height: 950 }], ["phone", { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport }); const errs = []; let reqs = 0;
    p.on("pageerror", e => errs.push(e.message));
    p.on("request", r => { if (!/^(file|blob|data):/.test(r.url())) reqs++; });
    await p.route(/hn\.algolia\.com/, r => r.fulfill({ json: { nbHits: 100, exhaustiveNbHits: true, hits: [] }, headers: { "access-control-allow-origin": "*" } }).catch(() => {}));
    await p.goto(PAGE); await p.waitForTimeout(300);
    if (name === "desktop") ok("categories fit on one line", await p.$$eval(".cats label", l => new Set(l.map(x => Math.round(x.getBoundingClientRect().top))).size) === 1);
    for (const c of ["langHist", "waveHist"]) {
      await p.check(`input[name=category][value=${c}]`, { force: true });
      const r = await p.evaluate(c => ({
        n: data.length, colors: new Set(data.map(d => d.color)).size, months: labels.length, first: labels[0],
        contiguous: labels.every((l, i) => !i || ((+l.slice(0, 4) * 12 + +l.slice(5, 7)) - (+labels[i - 1].slice(0, 4) * 12 + +labels[i - 1].slice(5, 7)) === 1)),
        full: data.every(d => d.values.length === labels.length && d.values.every(v => Number.isFinite(v) && v >= 0)),
        dur: duration, playing, cat: category.value, mo: $("months").value, wnd: $("window").value, title: $("cTitle").children[0].textContent, status: $("status").textContent
      }), c);
      ok(`${name} ${c} data`, r.n === 15 && r.colors === 15 && r.first === "2007-07" && r.months > 220 && r.contiguous && r.full, JSON.stringify(r));
      ok(`${name} ${c} state`, r.playing && r.cat === c && r.dur <= 60000 && r.mo === "60" && r.wnd === "6" && /since 2007/.test(r.title) && /ClickHouse/.test(r.status));
      const gap = await p.$$eval("#years span", s => { const x = s.map(e => parseFloat(e.style.insetInlineStart)); return Math.min(...x.slice(1).map((v, i) => v - x[i])); });
      ok(`${name} ${c} year labels do not collide`, gap >= 44, gap);
      const t = await p.evaluate(() => { const h = $("cTitle").children[0]; return [h.scrollWidth, h.clientWidth, getComputedStyle(h).whiteSpace]; });
      ok(`${name} ${c} title fits`, t[0] <= t[1], t.join());
      for (const [at, tag] of [[.02, "start"], [.45, "mid"], [1, "end"]]) {
        await p.evaluate(x => { pause(); progress = x; render(x, true); }, at); await settle(p);
        await p.screenshot({ path: `${OUT}/${name}-${c}-${tag}.png` });
      }
    }
    ok(`${name} no requests`, reqs === 0, reqs);
    await p.check("input[name=category][value=langHist]", { force: true });
    const same = await p.evaluate(() => Object.fromEntries(data.map(d => [d.name, d.color])));
    await p.check("input[name=category][value=lang]", { force: true });
    ok(`${name} shared languages keep their colour`, await p.evaluate(s => data.filter(d => s[d.name]).every(d => d.color === s[d.name]), same));
    ok(`${name} years back to every year`, await p.$$eval("#years span", s => s.length) === 5);
    await p.check("input[name=category][value=langHist]", { force: true });
    await p.check("input[name=category][value=custom]", { force: true });
    ok(`${name} custom keeps the long chart`, await p.evaluate(() => chartCat === "langHist" && $("terms").value === ""));
    await p.click("#demoBtn");
    ok(`${name} offline button returns to it`, await p.evaluate(() => category.value === "langHist" && chartCat === "langHist" && labels.length > 220));
    await p.click("[data-set-lang=zh]");
    ok(`${name} Chinese`, /2007 至今/.test(await p.evaluate(() => $("cTitle").children[0].textContent)) && /ClickHouse/.test(await p.textContent("#status")));
    await p.click("[data-set-lang=en]");
    await p.selectOption("#months", "12"); await p.click("#load");
    await p.waitForFunction(() => !$("load").disabled, null, { timeout: 60000 }); await p.waitForTimeout(50);
    ok(`${name} live fetch of the same terms is Custom, not "since 2007"`, await p.evaluate(() => chartCat === null && category.value === "custom" && labels.length === 12 && !/2007/.test($("cTitle").children[0].textContent)));
    ok(`${name} no page errors`, errs.length === 0, errs.join());
    await p.close();
  }
  console.log(OUT);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
