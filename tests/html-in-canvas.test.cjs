// The point of the page: the picture behaves like HTML and records like a canvas.
const { PAGE, OUT, launch, ok, settle } = require("./helper.cjs");
const path = require("node:path");
(async () => {
  const b = await launch(), errs = [];
  const c = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await c.route(/^https?:/, r => r.fulfill({ body: "<title>hn</title>", contentType: "text/html" }));
  const p = await c.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => /error|warning/.test(m.type()) && !/willReadFrequently/.test(m.text()) && errs.push(m.text()))   /* this test itself reads pixels back */;
  await p.goto(PAGE); await p.waitForTimeout(500);
  ok("supported and playing", await p.evaluate(() => LIVE && playing));
  const at = async q => { await p.evaluate(q => { pause(); progress = q; render(q, true); }, q); await settle(p); };
  await at(.83);
  ok("canvas grid matches device pixels", await p.evaluate(() => canvas.width === Math.round(canvas.getBoundingClientRect().width * devicePixelRatio)));
  ok("each row's box is where its pixels are", await p.evaluate(() => { const C = canvas.getBoundingClientRect(), k = C.width / W; return data.every(d => { const r = d.row.getBoundingClientRect(); return Math.abs(r.y - C.y - d.curY * k) < 1 && Math.abs(r.width - C.width) < 1 && Math.abs(r.height - ROW_H * k) < 1; }); }));
  ok("names are painted on the stage", await p.evaluate(() => { const C = canvas.getBoundingClientRect(); return data.every(d => { const r = d.link.getBoundingClientRect(); return r.left >= C.left && r.right <= C.right; }); }));
  // pixels, not just boxes: each name and each bar leaves ink where it should
  const ink = await p.evaluate(() => { const g = canvas.width / W; return data.flatMap(d => {
    const lit = (x, w) => { const px = ctx.getImageData(x * g, (d.curY + 6) * g, Math.max(1, w * g), (ROW_H - 12) * g).data; let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 240) n++; return n; };
    return [lit(NAME_RIGHT - 60, 60) > 20, lit(BAR_X + 12 + parseFloat(d.row.style.getPropertyValue("--len")), 40) > 10].every(Boolean) ? [] : [d.name]; }); });
  ok("every row has ink for its name and value", ink.length === 0, ink);
  ok("DOM order follows the ranking", await p.evaluate(() => [...$("rows").children].every((r, i) => r.querySelector(".rank").textContent === String(i + 1))));

  const pop = c.waitForEvent("page"); await p.click("#rows .name:text-is('chatgpt / gpt')"); const np = await pop; await np.waitForLoadState();
  const u = new URL(np.url()).searchParams;
  ok("a term opens that month's HN search", u.get("query") === '"chatgpt"' && u.get("dateStart") === String(Date.UTC(2025, 11) / 1000) && u.get("dateEnd") === String(Date.UTC(2026, 0) / 1000), np.url());
  await np.close();
  await p.locator("#rows .row").nth(2).locator(".val").dblclick();
  ok("a number can be selected", await p.evaluate(() => getSelection().toString() === data.find(d => d.row === $("rows").children[2]).value.textContent));
  ok("find in page reaches the chart", await p.evaluate(() => { getSelection().removeAllRanges(); return find("deepseek") && canvas.contains(getSelection().anchorNode); }));
  await at(.1); await p.focus("#rows .name:text-is('claude')"); await at(.9);
  ok("focus survives a rank change", await p.evaluate(() => document.activeElement.textContent === "claude" && $("rows").children[0].contains(document.activeElement)));
  await p.keyboard.press("Tab");
  ok("Tab goes to the next rank", await p.evaluate(() => $("rows").children[1].contains(document.activeElement)));
  const ax = (await (await c.newCDPSession(p)).send("Accessibility.getFullAXTree")).nodes.filter(n => n.role?.value === "link").map(n => n.name?.value);
  ok("rows are links to assistive tech", ["claude", "gemini", "minimax"].every(n => ax.includes(n)));

  await p.evaluate(() => { loadSnapshot("model"); pause(); duration = 1500; });
  const dl = p.waitForEvent("download", { timeout: 40000 }); await p.click("#download"); await p.waitForTimeout(500);
  ok("recording: 1920x1080 grid, rows inert, transport locked", await p.evaluate(() => canvas.width === 1920 && canvas.height === 1080 && $("rows").inert && $("play").disabled && $("replay").disabled));
  const file = path.join(OUT, "race.mp4"); await (await dl).saveAs(file); await settle(p);
  ok("afterwards: grid and controls restored", await p.evaluate(() => canvas.width < 1920 && !$("rows").inert && !$("play").disabled));
  const vid = await p.evaluate(async src => { const e = document.createElement("video"); e.muted = true; e.src = src; await new Promise(r => e.onloadeddata = r); e.currentTime = 1; await new Promise(r => e.onseeked = r); const k = document.createElement("canvas"); k.width = e.videoWidth; k.height = e.videoHeight; const x = k.getContext("2d"); x.drawImage(e, 0, 0); let lit = 0; { const d = x.getImageData(0, 0, k.width, k.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) lit++; } return { w: k.width, h: k.height, lit }; }, "data:video/mp4;base64," + require("node:fs").readFileSync(file).toString("base64"));
  ok("video is 1920x1080 with the HTML in it", vid.w === 1920 && vid.h === 1080 && vid.lit > 5000, JSON.stringify(vid));
  ok("no page errors or warnings", errs.length === 0, errs);

  // a browser without the API: explanation only, nothing throws, nothing is requested
  const c2 = await b.newContext({ viewport: { width: 1400, height: 900 } }), q = await c2.newPage(), e2 = []; let net = 0;
  q.on("pageerror", e => e2.push(e.message)); q.on("request", r => /^https?:/.test(r.url()) && net++);
  await q.addInitScript(() => { delete HTMLCanvasElement.prototype.content; delete CanvasRenderingContext2D.prototype.drawElementImage; });
  await q.goto(PAGE); await q.waitForTimeout(300); await q.click("[data-set-lang=zh]");
  ok("unsupported: explanation instead of the chart", await q.isVisible(".nope") && !(await q.isVisible("#canvas")) && !(await q.isVisible("#customForm")) && /還不支援/.test(await q.innerText(".nope")));
  ok("unsupported: no errors, no requests", e2.length === 0 && net === 0, e2);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
