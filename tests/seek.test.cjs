// The timeline is a native range input drawn into the canvas.
const { PAGE, launch, ok, settle } = require("./helper.cjs");
(async () => {
  const b = await launch(), errs = [];
  const open = async o => { const c = await b.newContext({ acceptDownloads: true, ...o }), p = await c.newPage(); p.on("pageerror", e => errs.push(e.message)); await p.goto(PAGE); await settle(p); return p; };
  // screen position of month i, computed from the year scale rather than from the slider itself
  const at = (p, i) => p.evaluate(i => { const C = canvas.getBoundingClientRect(), k = C.width / W; return { x: C.x + yearX(i) * k, y: C.y + (H - 44) * k }; }, i);
  const month = p => p.textContent("#cMonth");

  for (const [name, o] of [["desktop", { viewport: { width: 1400, height: 900 } }], ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const p = await open(o);
    await p.evaluate(() => pause());
    for (const i of [0, 13, 37, 59]) {
      const t = await at(p, i);
      await p.mouse.click(t.x, t.y); await settle(p);
      const got = await p.evaluate(() => progress * (labels.length - 1));
      ok(`${name}: click on month ${i}`, Math.abs(got - i) < .35, got.toFixed(2));
    }
    // thumb pixels sit where the value says (white disc, on the track line)
    await p.evaluate(() => { progress = 20 / 59; render(progress, true); }); await settle(p);
    ok(`${name}: thumb is drawn at its month`, await p.evaluate(() => { const g = canvas.width / W, [r, gg, bb] = ctx.getImageData(yearX(20) * g, (H - 44) * g, 1, 1).data; return r > 220 && gg > 220 && bb > 220; }));
    ok(`${name}: touch target at least 34 CSS px tall`, await p.evaluate(() => $("seek").getBoundingClientRect().height >= 34), await p.evaluate(() => $("seek").getBoundingClientRect().height));
    await p.context().close();
  }

  const p = await open({ viewport: { width: 1400, height: 900 } });
  ok("playback moves the slider", await p.evaluate(async () => { const a = +$("seek").value; await new Promise(r => setTimeout(r, 400)); return playing && +$("seek").value > a && Math.abs($("seek").value / 59 - progress) < .02; }));
  // drag while playing: pauses, follows the pointer, resumes on release
  const s = await at(p, 10), e = await at(p, 40);
  await p.mouse.move(s.x, s.y); await p.mouse.down(); await settle(p);
  ok("holding pauses playback", !(await p.evaluate(() => playing)));
  await p.mouse.move((s.x + e.x) / 2, s.y, { steps: 6 }); const mid = await month(p);
  await p.mouse.move(e.x, e.y, { steps: 6 }); await settle(p);
  ok("chart follows the drag", mid !== await month(p) && await p.evaluate(() => Math.abs(progress * 59 - 40) < .4), `${mid} -> ${await month(p)}`);
  await p.mouse.up(); await settle(p);
  ok("release resumes from there", await p.evaluate(() => playing && progress > 39 / 59 && progress < 45 / 59));
  await p.evaluate(() => pause());
  // paused: stays paused, rows glide to the new order and then stop painting
  const t = await at(p, 30); await p.mouse.click(t.x, t.y); await p.waitForTimeout(1200);
  ok("paused stays paused, rows settle", await p.evaluate(() => !playing && !gliding && data.every(d => Math.abs(d.curY - d.targetY) < .01)));
  await p.mouse.move(5, 5); await p.waitForTimeout(400);
  ok("idle chart does not keep painting", await p.evaluate(async () => { let n = 0; const f = () => n++; canvas.addEventListener("paint", f); await new Promise(r => setTimeout(r, 500)); canvas.removeEventListener("paint", f); return n <= 1; }));
  // keyboard
  await p.focus("#seek");
  const idx = () => p.evaluate(() => Math.round(progress * 59 * 100) / 100);
  await p.evaluate(() => { progress = 30 / 59; render(progress, true); });
  await p.keyboard.press("ArrowRight"); const a1 = await idx(); await p.keyboard.press("ArrowLeft"); await p.keyboard.press("ArrowLeft"); const a2 = await idx();
  await p.keyboard.press("PageUp"); const a3 = await idx(); await p.keyboard.press("Home"); const a4 = await idx(); await p.keyboard.press("ArrowLeft"); const a5 = await idx(); await p.keyboard.press("End"); const a6 = await idx();
  ok("arrows one month, PageUp one year, Home/End, clamped", [a1, a2, a3, a4, a5, a6].join() === "31,29,41,0,0,59", [a1, a2, a3, a4, a5, a6].join());
  await settle(p);
  ok("spoken value is the month", await p.getAttribute("#seek", "aria-valuetext") === await month(p) && /^2026-11/.test(await month(p)));
  await p.click("[data-set-lang=zh]"); ok("label is translated", await p.getAttribute("#seek", "aria-label") === "月份");
  await p.click("[data-set-lang=en]");
  ok("Play after End restarts cleanly", await p.evaluate(async () => { play(); await new Promise(r => setTimeout(r, 2100)); const f = playing && progress < .1; pause(); return f; }));
  // other window sizes: short race
  await p.evaluate(() => { startRace(["2026-01", "2026-02", "2026-03"], [{ name: "a", color: "#fff", values: [1, 2, 3] }, { name: "b", color: "#f00", values: [3, 2, 1] }], 3, null); pause(); });
  await settle(p); const u = await at(p, 1); await p.mouse.click(u.x, u.y); await settle(p);
  ok("range follows the data", await p.evaluate(() => $("seek").max === "2" && Math.abs(progress - .5) < .02));
  // recording
  await p.evaluate(() => { loadSnapshot("db"); pause(); duration = 800; });
  const dl = p.waitForEvent("download", { timeout: 40000 }); await p.click("#download"); await p.waitForTimeout(250);
  ok("locked while recording", await p.isDisabled("#seek"));
  await dl; await settle(p); ok("unlocked afterwards", !(await p.isDisabled("#seek")));

  const q = await open({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" });
  const z = await at(q, 12); await q.mouse.click(z.x, z.y);
  ok("reduced motion: jumps, no glide", await q.evaluate(() => !gliding && data.every(d => d.curY === d.targetY)));
  ok("no page errors", errs.length === 0, errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
