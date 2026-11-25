// Layout of the HTML drawn into the canvas, in every category, on desktop and phone.
const { PAGE, launch, ok, settle } = require("./helper.cjs");
(async () => {
  const b = await launch(), errs = [];
  const open = async o => { const p = await (await b.newContext(o)).newPage(); p.on("pageerror", e => errs.push(e.message)); await p.goto(PAGE); await settle(p); return p; };

  let p = await open({ reducedMotion: "reduce", viewport: { width: 1400, height: 900 } });
  ok("reduced motion paused at end", await p.evaluate(() => !playing && progress === 1));
  await p.focus("input[name=category]:checked"); await p.keyboard.press("ArrowRight");
  ok("arrow key switches category", await p.evaluate(() => category.value === "ai" && chartCat === "ai"));
  ok("ticks: ascending, at least two", await p.evaluate(() => [1, 3.2, 9, 47, 300, 1426, 9999, 13979, 31028].every(m => { const t = niceTicks(m); return t.length >= 2 && t.every((v, i) => !i || v > t[i - 1]); })));

  // every value label stays inside the picture, names fit their column, header lines don't overlap the month
  const audit = p => p.evaluate(() => {
    const bad = new Set();
    for (const dyn of [false, true]) for (const k of Object.keys(SNAPSHOT.data)) {
      $("dynAxis").checked = dyn; loadSnapshot(k); pause();
      for (let q = 0; q <= 1; q += .05) {
        render(q, true);
        for (const d of data) {
          if (BAR_X + 10 + parseFloat(d.row.style.getPropertyValue("--len")) + d.value.offsetWidth > W) bad.add(`${k} ${d.name} value`);
          if (d.link.scrollWidth > d.link.clientWidth) bad.add(`${k} ${d.name} name`);
        }
        const h = $("cTitle").children[0];
        if (h.scrollWidth > h.clientWidth) bad.add(`${k} title`);
        for (const e of [...$("cTitle").children].slice(1)) if (e.scrollWidth > e.clientWidth) bad.add(`${k} ${e.textContent}`);
      }
    }
    return [...bad];
  });
  let bad = await audit(p); ok("desktop: nothing overflows", bad.length === 0, bad);
  await p.click("[data-set-lang=zh]"); bad = await audit(p); ok("desktop zh: nothing overflows", bad.length === 0, bad);

  p = await open({ viewport: { width: 360, height: 740 }, isMobile: true });
  ok("no horizontal scroll at 360px", await p.evaluate(() => document.documentElement.scrollWidth === 360));
  bad = await audit(p); ok("phone: nothing overflows", bad.length === 0, bad);
  await p.click("[data-set-lang=zh]"); bad = await audit(p); ok("phone zh: nothing overflows", bad.length === 0, bad);

  p = await open({ viewport: { width: 1400, height: 900 } });
  ok("every month index shows its own label", await p.evaluate(() => { pause(); return labels.every((l, i) => interpolated(i / (labels.length - 1)).month === l); }));
  ok("bars settle during hold", await p.evaluate(async () => { duration = 300; progress = .2; play(); await new Promise(r => setTimeout(r, 1300)); const t = [...data].sort((a, b) => b.curVal - a.curVal); return t.every((d, i) => Math.abs(d.curY - (TOP + i * ROW_H)) < .5); }));
  ok("no page errors", errs.length === 0, errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
