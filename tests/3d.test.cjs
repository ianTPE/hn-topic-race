// 3D mode: the same HTML elements as WebGL textures, still clickable, selectable and recordable.
const { PAGE, OUT, launch, ok, settle } = require("./helper.cjs");
const fs = require("node:fs"), path = require("node:path");
(async () => {
  const b = await launch(), errs = [];
  const open = async (o = {}, init) => {
    const c = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, ...o }), p = await c.newPage();
    await c.route(/^https?:/, r => r.fulfill({ body: "<title>hn</title>", contentType: "text/html" }));
    p.on("pageerror", e => errs.push(e.message));
    p.on("console", m => /error|warning/.test(m.type()) && !/ReadPixels|willReadFrequently/.test(m.text()) && errs.push(m.text()));
    if (init) await p.addInitScript(init);
    await p.goto(PAGE); await settle(p); await p.evaluate(() => { pause(); progress = .83; render(.83, true); }); await settle(p);
    return p;
  };
  const turn = async (p, on = true) => { await p.setChecked("#mode3d", on); await p.waitForTimeout(1100); await settle(p); };
  // pixels of whichever canvas is on, copied inside its paint event (a WebGL buffer is gone afterwards)
  const grab = p => p.evaluate(() => new Promise(r => { surface.addEventListener("paint", () => {
    const k = document.createElement("canvas"); k.width = surface.width; k.height = surface.height;
    const x = k.getContext("2d"); x.drawImage(surface, 0, 0); window.shot = x; r();
  }, { once: true }); surface.requestPaint(); }));
  const lit = (p, sel) => p.evaluate(sel => { const C = surface.getBoundingClientRect(), g = surface.width / C.width; return [...document.querySelectorAll(sel)].map(e => {
    const r = e.getBoundingClientRect(), d = shot.getImageData((r.x - C.x) * g, (r.y - C.y) * g, Math.max(1, r.width * g), Math.max(1, r.height * g)).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) > 130) n++; return n; }); }, sel);

  let p = await open();
  ok("starts in 2D", await p.evaluate(() => surface.id === "canvas" && tilt === 0 && !$("mode3d").checked));
  await grab(p); await p.evaluate(() => { window.flat2d = shot.canvas.toDataURL(); });
  await p.focus("#rows .name:text-is('gemini')");
  await p.evaluate(() => { $("mode3d").checked = true; set3d(true); }); await p.waitForTimeout(1100); await settle(p);
  ok("3D on: elements moved, WebGL clean", await p.evaluate(() => surface.id === "gl" && tilt === 1 && $("gl").contains($("rows")) && canvas.children.length === 0 && scene.gl.getError() === 0));
  ok("focus survives the move", await p.evaluate(() => document.activeElement.textContent === "gemini"));
  ok("only the WebGL canvas takes the pointer", await p.evaluate(() => getComputedStyle(canvas).pointerEvents === "none" && getComputedStyle($("gl")).pointerEvents === "auto"));
  ok("rows are tilted, header is not", await p.evaluate(() => Math.abs($("gl").getElementTransform(data[0].row).b) > .01 && $("gl").getElementTransform($("cTitle")).b === 0));
  await grab(p);
  let n = await lit(p, "#rows .name"); ok("every name has ink where the browser says it is", n.length === 12 && n.every(v => v > 8), n.join());
  n = await lit(p, "#rows .val"); ok("every value has ink where the browser says it is", n.every(v => v > 8), n.join());
  const hits = () => p.evaluate(() => data.filter(d => { const r = d.link.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== d.link; }).map(d => d.name));
  let miss = await hits(); ok("every link can be hit", miss.length === 0, miss);
  for (const [y, x] of [[-30, -22], [30, 22], [30, -22], [-30, 22]]) {
    await p.evaluate(([y, x]) => { yaw = y; pitch = x; clampTilt(); }, [y, x]); await settle(p); await grab(p);
    miss = await hits(); n = await lit(p, "#rows .name");
    ok(`yaw ${y} pitch ${x}: hit and inked`, miss.length === 0 && n.every(v => v > 4), `${miss} ${n}`);
    ok(`yaw ${y} pitch ${x}: plot stays between header and timeline`, await p.evaluate(() => { const C = surface.getBoundingClientRect(), k = C.width / W; return data.every(d => [d.link, d.value].every(e => { const r = e.getBoundingClientRect(); return r.left >= C.left && r.right <= C.right && r.top >= C.top + (TOP - 40) * k && r.bottom <= C.top + (H - 60) * k; })); }));
  }
  await p.evaluate(() => resetTilt()); await settle(p);

  const c = p.context();
  const pop = c.waitForEvent("page"); await p.click("#rows .name:text-is('claude')"); const np = await pop; await np.waitForLoadState();
  ok("a tilted term still opens HN", /claude/.test(np.url())); await np.close();
  await p.locator("#rows .row").nth(1).locator(".val").dblclick();
  ok("a tilted number can be selected", await p.evaluate(() => getSelection().toString()) === "10,329");
  ok("double-clicking a number does not reset the view", await p.evaluate(() => yaw === TILT.yaw));
  ok("find in page reaches the 3D chart", await p.evaluate(() => { getSelection().removeAllRanges(); return find("deepseek") && $("gl").contains(getSelection().anchorNode); }));
  await p.evaluate(() => getSelection().removeAllRanges());
  await p.focus("#rows .name:text-is('claude')"); await p.keyboard.press("Tab");
  ok("Tab follows the ranking", await p.evaluate(() => document.activeElement.textContent === "chatgpt / gpt"));

  // orbit
  const spot = await p.evaluate(() => { const C = surface.getBoundingClientRect(); return { x: C.x + C.width * .75, y: C.y + C.height * .6 }; });
  await p.mouse.move(spot.x, spot.y); await p.mouse.down(); await p.mouse.move(spot.x + 60, spot.y + 30, { steps: 5 });
  const during = await p.evaluate(() => [yaw, pitch]); await p.mouse.up();
  ok("dragging empty space rotates", Math.abs(during[0] - (-18 + 13.2)) < .5 && Math.abs(during[1] - (-12 - 6.6)) < .5, during.join());
  await p.mouse.move(spot.x - 200, spot.y); ok("released: no more rotation", (await p.evaluate(() => yaw)) === during[0]);
  await p.mouse.move(spot.x, spot.y); await p.mouse.down(); await p.mouse.move(spot.x + 900, spot.y + 900, { steps: 8 }); await p.mouse.up();
  ok("rotation is limited", await p.evaluate(() => yaw === TILT.yawMax && pitch === -TILT.pitchMax));
  ok("dragging selected nothing", await p.evaluate(() => getSelection().isCollapsed));
  await p.mouse.dblclick(spot.x, spot.y); ok("double-click resets", await p.evaluate(() => yaw === TILT.yaw && pitch === TILT.pitch));
  await p.focus("#gl"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowUp");
  ok("arrow keys rotate", await p.evaluate(() => yaw === TILT.yaw + 3 && pitch === TILT.pitch + 3));
  await p.keyboard.press("0"); ok("0 resets", await p.evaluate(() => yaw === TILT.yaw));

  // timeline, playback, categories
  const t = await p.evaluate(() => { const C = surface.getBoundingClientRect(), k = C.width / W; return { x: C.x + yearX(40) * k, y: C.y + (H - 44) * k }; });
  await p.mouse.click(t.x, t.y); await p.waitForTimeout(900);
  ok("timeline works in 3D and does not rotate", await p.evaluate(() => Math.abs(progress * 59 - 40) < .4 && yaw === TILT.yaw));
  await p.evaluate(() => play());
  const perf = await p.evaluate(async () => { const d = []; let l, n = 0; await new Promise(r => { const f = t => { if (l) d.push(t - l); l = t; ++n < 120 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); return d.reduce((a, b) => a + b) / d.length; });
  ok("playable even on a software GPU", perf < 120, perf.toFixed(1) + " ms/frame");
  for (const k of ["db", "lang", "frontend", "model"]) { await p.click(`.cats label:has([value=${k}])`); await settle(p); }
  await p.evaluate(() => { pause(); }); await p.waitForTimeout(700); await settle(p);
  ok("no leaked textures, GL still clean", await p.evaluate(() => scene.tex.size <= data.length + 5 + $("ticks").children.length && scene.gl.getError() === 0), await p.evaluate(() => scene.tex.size));
  await p.mouse.move(5, 5); await p.waitForTimeout(300);
  ok("idle 3D does not keep painting", await p.evaluate(async () => { let n = 0; const f = () => n++; $("gl").addEventListener("paint", f); await new Promise(r => setTimeout(r, 500)); $("gl").removeEventListener("paint", f); return n <= 1; }));
  await p.click("[data-set-lang=zh]"); await settle(p);
  ok("translated", /方向鍵/.test(await p.getAttribute("#gl", "aria-label")) && /HN 話題/.test(await p.textContent("#cTitle"))); await p.click("[data-set-lang=en]");

  // recording, rotating meanwhile
  await p.evaluate(() => { loadSnapshot("model"); pause(); duration = 1800; });
  const dl = p.waitForEvent("download", { timeout: 60000 }); await p.click("#download"); await p.waitForTimeout(500);
  ok("recording in 3D: 1920x1080, toggle locked", await p.evaluate(() => $("gl").width === 1920 && $("gl").height === 1080 && $("mode3d").disabled && $("rows").inert));
  await p.mouse.move(spot.x, spot.y); await p.mouse.down(); await p.mouse.move(spot.x + 40, spot.y, { steps: 4 }); await p.mouse.up();
  ok("the camera can move while recording", await p.evaluate(() => yaw > TILT.yaw));
  const file = path.join(OUT, "3d.mp4"); await (await dl).saveAs(file); await settle(p);
  const vid = await p.evaluate(async src => { const e = document.createElement("video"); e.muted = true; e.src = src; await new Promise(r => e.onloadeddata = r); e.currentTime = 1.2; await new Promise(r => e.onseeked = r); const k = document.createElement("canvas"); k.width = e.videoWidth; k.height = e.videoHeight; const x = k.getContext("2d"); x.drawImage(e, 0, 0); const d = x.getImageData(0, 0, k.width, k.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++; return { w: k.width, h: k.height, n }; }, "data:video/mp4;base64," + fs.readFileSync(file).toString("base64"));
  ok("3D video has the picture in it", vid.w === 1920 && vid.h === 1080 && vid.n > 5000, JSON.stringify(vid));

  // back to 2D
  await turn(p, false);
  await p.evaluate(() => { pause(); progress = .83; render(.83, true); }); await settle(p); await p.mouse.move(5, 5); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(400); await grab(p);
  ok("back in 2D the picture is exactly what it was", await p.evaluate(() => surface.id === "canvas" && tilt === 0 && shot.canvas.toDataURL() === flat2d));
  ok("links work after coming back", (await hits()).length === 0);
  for (let i = 0; i < 4; i++) await p.click("#mode3d");
  await p.waitForTimeout(1200); await settle(p);
  ok("rapid toggling ends where the switch says", await p.evaluate(() => !$("mode3d").checked && surface.id === "canvas" && tilt === 0 && canvas.contains($("rows"))));
  // context loss
  await turn(p); await p.evaluate(() => scene.gl.getExtension("WEBGL_lose_context").loseContext()); await p.waitForTimeout(400); await settle(p);
  ok("losing the WebGL context falls back to 2D", await p.evaluate(() => surface.id === "canvas" && !$("mode3d").checked && canvas.contains($("rows"))));

  p = await open({ reducedMotion: "reduce" }); await p.check("#mode3d"); await settle(p);
  ok("reduced motion: switches at once", await p.evaluate(() => tilt === 1 && surface.id === "gl"));
  p = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await turn(p); await grab(p);
  n = await lit(p, "#rows .name"); ok("phone: small tilt, names inked, no horizontal scroll", n.every(v => v > 1) && await p.evaluate(() => Math.abs(yaw) <= 18 && document.documentElement.scrollWidth === 390), n.join());
  ok("no page errors or warnings", errs.length === 0, errs);
  errs.length = 0;
  p = await open({}, () => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === "webgl2" ? null : o.call(this, t, ...a); }; });
  await p.click("#mode3d"); await settle(p);
  ok("no WebGL: stays in 2D and says so", await p.evaluate(() => surface.id === "canvas" && !$("mode3d").checked && $("mode3d").disabled) && /WebGL 2/.test(await p.textContent("#status")) && errs.length === 0, errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
