// The long-run categories: embedded data, units, new-#1 captions, playback, form state, request-free.
const { PAGE, OUT, launch, ok, settle } = require("./helper.cjs");
(async () => {
  const b = await launch();
  for (const [name, viewport] of [["desktop", { width: 1400, height: 950 }], ["phone", { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport }); const errs = []; let reqs = 0;
    p.on("pageerror", e => errs.push(e.message));
    p.on("request", r => { if (!/^(file|blob|data):/.test(r.url())) reqs++; });
    await p.route(/hn\.algolia\.com/, r => r.fulfill({ json: { nbHits: 100, exhaustiveNbHits: true, hits: [] }, headers: { "access-control-allow-origin": "*" } }).catch(() => {}));
    await p.goto(PAGE); await p.waitForTimeout(300);
    if (name === "desktop") ok("categories fit on two lines", await p.$$eval(".cats label", l => new Set(l.map(x => Math.round(x.getBoundingClientRect().top))).size) === 2);
    for (const c of ["langHist", "waveHist", "hireHist"]) {
      await p.check(`input[name=category][value=${c}]`, { force: true });
      const r = await p.evaluate(c => ({
        n: data.length, colors: new Set(data.map(d => d.color)).size, months: labels.length, first: labels[0],
        contiguous: labels.every((l, i) => !i || ((+l.slice(0, 4) * 12 + +l.slice(5, 7)) - (+labels[i - 1].slice(0, 4) * 12 + +labels[i - 1].slice(5, 7)) === 1)),
        full: data.every(d => d.values.length === labels.length && d.values.every(v => Number.isFinite(v) && v >= 0)),
        dur: duration, playing, cat: category.value, mo: $("months").value, wnd: $("window").value, title: $("cTitle").children[0].textContent, status: $("status").textContent
      }), c);
      ok(`${name} ${c} data`, r.n === 15 && r.colors === 15 && r.first === (c === "hireHist" ? "2012-06" : "2007-07") && r.months > 160 && r.contiguous && r.full, JSON.stringify(r));
      ok(`${name} ${c} state`, r.playing && r.cat === c && r.dur <= 60000 && r.mo === "60" && r.wnd === "6" && /since 20(07|12)/.test(r.title) && /ClickHouse/.test(r.status));
      const gap = await p.$$eval("#years span", s => { const x = s.map(e => parseFloat(e.style.insetInlineStart)); return Math.min(...x.slice(1).map((v, i) => v - x[i])); });
      ok(`${name} ${c} year labels do not collide`, gap >= 44, gap);
      const t = await p.evaluate(() => { const h = $("cTitle").children[0]; return [h.scrollWidth, h.clientWidth, getComputedStyle(h).whiteSpace]; });
      ok(`${name} ${c} title fits`, t[0] <= t[1], t.join());
      for (const [at, tag] of [[.02, "start"], [.45, "mid"], [1, "end"]]) {
        await p.evaluate(x => { pause(); progress = x; render(x, true); }, at); await settle(p);
        await p.screenshot({ path: `${OUT}/${name}-${c}-${tag}.png` });
      }
    }
    // captions
    await p.check("input[name=category][value=langHist]", { force: true });
    const at = (d, i = -1) => p.evaluate(([d, i]) => { pause(); const t = takeovers.at(i); progress = (t.at + d) / (labels.length - 1); render(progress, true); }, [d, i]).then(() => settle(p));
    const cap = () => p.evaluate(() => [$("cNews").hidden, view.newsAlpha, $("cNews").innerText]);
    await at(4); let c = await cap();
    ok(`${name} caption shown, from the data`, !c[0] && c[1] === 1 && /2026-04 · new #1\s+rust passes python/i.test(c[2]), c.join());
    const px = await p.evaluate(() => { const r = $("cNews").firstElementChild.getBoundingClientRect(), s = surface.getBoundingClientRect(); return [r.left >= s.left, r.right <= s.right + 1, r.bottom <= s.bottom, r.width > 60]; });
    ok(`${name} caption is inside the canvas`, px.every(Boolean), px.join());
    await at(-0.5, 0); c = await cap(); ok(`${name} no caption before the first takeover`, c[0] && c[1] === 0, c.join());
    await at(20, 1); c = await cap(); ok(`${name} caption goes away`, c[0], c.join());
    ok(`${name} every caption matches the numbers`, await p.evaluate(() => Object.keys(HISTORY.sets).every(s => { loadSnapshot(s); return takeovers.length >= 3 && takeovers.every(t =>
      data.every(d => d.values[t.i] <= t.who.values[t.i]) && data.every(d => d.values[t.i - 1] <= t.over.values[t.i - 1]) && t.at >= t.i - 1 && t.at <= t.i); })));
    // hardware: a pool larger than 15, only the top 15 drawn; others slide out, can't be focused, and come back
    await p.check("input[name=category][value=hwHist]", { force: true });
    const hw = await p.evaluate(() => {
      const shown = () => data.filter(d => d.alpha > 0 && !d.row.inert).length;
      const frame = x => { pause(); progress = x; render(x, true); return data.filter(d => !d.row.inert).map(d => d.name).sort().join(); };
      const sets = [0.05, 0.3, 0.6, 0.9, 1].map(frame);
      return { n: data.length, shown: shown(), inertHidden: data.filter(d => d.row.inert).every(d => d.alpha === 0), sets: new Set(sets).size,
        input: parseTerms().length, cat: category.value, title: $("cTitle").children[0].textContent, status: $("status").textContent,
        rowH: ROW_H, fits: TOP + 15 * ROW_H <= PLOT_BOTTOM + 0.5, colorsOk: data.every(d => /^#[0-9a-f]{6}$/.test(d.color)),
        first: labels[0], times: data.every(d => /^×\d+(\.\d)?$/.test(d.value.textContent)), ticks: [...$("ticks").children].map(t => t.textContent),
        noBarAtOne: data.filter(d => d.curVal <= 0).every(d => d.row.style.getPropertyValue("--len") === "0px") };
    });
    ok(`${name} hardware growth: ×N values, log ticks, starts a year in`, hw.first === "2008-07" && hw.times && hw.ticks[0] === "×1" && hw.ticks.length >= 3 && hw.ticks.every(t => /^×\d+(\.\d)?$/.test(t)) && hw.noBarAtOne, JSON.stringify([hw.first, hw.ticks]));
    ok(`${name} hardware pool, top 15 drawn`, hw.n > 15 && hw.shown === 15 && hw.inertHidden && hw.fits && hw.colorsOk, JSON.stringify(hw));
    ok(`${name} hardware terms come and go`, hw.sets >= 4, hw.sets);
    ok(`${name} hardware form and status`, hw.input === 15 && hw.cat === "hwHist" && /Hardware growth since 2008/.test(hw.title) && /top 15 shown each month/.test(hw.status), hw.status);
    ok(`${name} hardware tab order skips terms off the chart`, await p.evaluate(() => [...$("rows").children].slice(15).every(r => r.inert) && [...$("rows").children].slice(0, 15).every(r => !r.inert)));
    for (const [at, tag] of [[.02, "start"], [.45, "mid"], [1, "end"]]) {
      await p.evaluate(x => { pause(); progress = x; render(x, true); }, at); await settle(p);
      await p.screenshot({ path: `${OUT}/${name}-hwHist-${tag}.png` });
    }
    // mid-transition: a row that left keeps fading, and nothing is drawn under the plot
    await p.check("#mode3d", { force: true }); await p.waitForTimeout(1500);
    const g3 = await p.evaluate(() => [surface.id, scene.gl.getError(), data.filter(d => d.row.inert).every(d => !scene.tex.has(d.row) || d.alpha === 0)]);
    ok(`${name} hardware in 3D`, g3[0] === "gl" && g3[1] === 0 && g3[2], g3.join());
    await p.screenshot({ path: `${OUT}/${name}-hwHist-3d.png` });
    await p.uncheck("#mode3d", { force: true }); await p.waitForTimeout(1200);
    // hiring: percentages, and links into that month's thread
    await p.check("input[name=category][value=hireHist]", { force: true });
    await p.evaluate(() => { pause(); progress = 1; render(1, true); }); await settle(p);
    const h = await p.evaluate(() => ({ v: data.map(d => d.value.textContent), max: maxVal, ticks: [...$("ticks").children].map(t => t.textContent), href: decodeURIComponent(data[0].link.href), threads: new Set(chartSet.threads).size, n: labels.length }));
    ok(`${name} hiring shows percentages`, h.v.every(v => /^\d+\.\d%$/.test(v)) && h.max < 100 && h.ticks.every(t => t.endsWith("%")), JSON.stringify(h.ticks));
    ok(`${name} hiring links to the thread`, /"python"\+story:\d{8}/.test(h.href) && h.threads === h.n, h.href);
    await p.check("input[name=category][value=db]", { force: true });
    ok(`${name} back to plain counts`, await p.evaluate(() => takeovers.length === 0 && $("cNews").hidden && data.every(d => !d.value.textContent.includes("%")) && [...$("ticks").children].every(t => !t.textContent.includes("%"))));
    await p.check("input[name=category][value=langHist]", { force: true }); await at(4);
    await p.check("#mode3d", { force: true }); await p.waitForTimeout(1500);
    c = await p.evaluate(() => [surface.id, scene.tex.has($("cNews")), scene.gl.getError()]);
    ok(`${name} caption in 3D`, c[0] === "gl" && c[1] && c[2] === 0, c.join());
    await p.uncheck("#mode3d", { force: true }); await p.waitForTimeout(1200);
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
