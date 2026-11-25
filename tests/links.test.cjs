// Shareable links: the address follows the chart, opening a link restores it, nothing is fetched on open.
const { PAGE, OUT, launch, ok, settle } = require("./helper.cjs");
const http = require("node:http"), fs = require("node:fs"), { fileURLToPath } = require("node:url");
(async () => {
  // clipboard needs a secure context, so serve the page from localhost
  const srv = http.createServer((_, r) => { r.setHeader("content-type", "text/html; charset=utf-8"); r.end(fs.readFileSync(fileURLToPath(PAGE))); });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const ROOT = `http://localhost:${srv.address().port}/`;
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const p = await ctx.newPage(); const errs = []; let reqs = 0;
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text() + m.location().url)) errs.push(m.text()); });
  await p.route(/hn\.algolia\.com/, r => { reqs++; r.fulfill({ json: { nbHits: 100, exhaustiveNbHits: true, hits: [] }, headers: { "access-control-allow-origin": "*" } }).catch(() => {}); });
  const open = async q => { await p.goto(ROOT + q); await p.waitForTimeout(300); };
  const q = () => p.evaluate(() => location.search);
  const st = () => p.evaluate(() => ({ cat: category.value, chart: chartCat, d3: $("mode3d").checked, surf: surface.id, axis: $("dynAxis").checked, terms: $("terms").value, m: $("months").value, w: $("window").value, ex: $("exact").checked }));

  await open(""); ok("default address stays clean", await q() === "");
  await p.check("input[name=category][value=langHist]", { force: true }); ok("category in the address", await q() === "?cat=langHist", await q());
  await p.check("#mode3d", { force: true }); await p.check("#dynAxis", { force: true }); ok("view and axis in the address", await q() === "?cat=langHist&view=3d&axis=dynamic", await q());
  await p.waitForTimeout(1100);
  await p.reload(); await p.waitForTimeout(1500);
  let s = await st(); ok("reload restores it", s.cat === "langHist" && s.chart === "langHist" && s.d3 && s.surf === "gl" && s.axis, JSON.stringify(s));
  await p.uncheck("#mode3d", { force: true }); await p.uncheck("#dynAxis", { force: true }); await p.check("input[name=category][value=model]", { force: true }); ok("back to clean", await q() === "", await q());
  for (const c of ["ai", "hireHist", "waveHist", "infra"]) { await open(`?cat=${c}`); s = await st(); ok(`opens ${c}`, s.cat === c && s.chart === c && await q() === `?cat=${c}`, await q()); }
  for (const bad of ["?cat=nope", "?cat=custom", "?cat=constructor", "?cat=__proto__", "?cat=%22%5D", "?view=4d&axis=x&m=7", "?terms=", "?terms=,,"]) {
    await open(bad); s = await st(); ok(`bad link falls back ${bad}`, s.chart === "model" && s.cat === "model" && !s.d3 && !s.axis && /claude/.test(s.terms) && await q() === "", await q());
  }
  await open("?utm_source=x&cat=db#top"); ok("other parameters and hash survive", await p.evaluate(() => location.search + location.hash) === "?utm_source=x&cat=db#top", await q());

  await open('?terms=rust,"sublime text",c%2B%2B&m=12&w=6&exact=0&view=3d'); await p.waitForTimeout(1200); s = await st();
  ok("terms link fills the form", s.cat === "custom" && s.terms === 'rust, "sublime text", c++' && s.m === "12" && s.w === "6" && !s.ex && s.d3, JSON.stringify(s));
  ok("terms link fetches nothing by itself", reqs === 0, reqs);
  ok("terms link says what to do", /rust.*12 months.*Fetch data/.test(await p.textContent("#status")) && await p.evaluate(() => document.activeElement.id) === "load", await p.textContent("#status"));
  const kept = await q(); ok("terms link stays in the address", /terms=rust,%22sublime\+text%22,c%2B%2B&m=12&w=6&exact=0&view=3d/.test(kept), kept);
  await p.keyboard.press("Enter"); await p.waitForFunction(() => !$("load").disabled && labels.length === 12, null, { timeout: 60000 });
  ok("Enter fetches it", reqs > 0 && await p.evaluate(() => data.map(d => d.name).join("|")) === "rust|sublime text|c++" && await q() === kept, await q());
  await p.check("#exact"); await p.fill("#terms", "zig"); ok("typing does not change the address", await q() === kept);
  await p.click("#load"); await p.waitForFunction(() => data.length === 1, null, { timeout: 60000 }); ok("fetching does", /\?terms=zig&m=12&w=6&view=3d$/.test(await q()), await q());
  await p.click("#demoBtn"); ok("offline button returns to the preset link", await q() === "?view=3d", await q());
  await open("?terms=" + Array.from({ length: 30 }, (_, i) => "t" + i).join(",")); ok("at most 15 terms", await p.evaluate(() => parseTerms().length) === 15);
  await open("?terms=%3Cimg%20src%3Dx%20onerror%3D%22window.pwned%3D1%22%3E,x"); await p.waitForTimeout(200); ok("markup in a link stays text", await p.evaluate(() => !window.pwned && !document.querySelector("img")));

  await open("?cat=langHist&view=3d"); await p.waitForTimeout(1200);
  await p.click("#share"); await p.waitForTimeout(150);
  ok("copy link", await p.evaluate(() => navigator.clipboard.readText()) === ROOT + "?cat=langHist&view=3d" && (await p.textContent("#shareTip")).trim() === "Link copied" && await p.getAttribute("#share", "data-copied") === "");
  await p.screenshot({ path: OUT + "/copied.png" });
  await p.waitForTimeout(2200); ok("tip clears", await p.textContent("#shareTip") === "" && await p.getAttribute("#share", "data-copied") === null);
  await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("denied")); });
  await p.click("[data-set-lang=zh]"); await p.click("#share"); await p.waitForTimeout(150);
  ok("copy refused: link is shown", (await p.textContent("#shareTip")).trim() === "複製失敗" && (await p.textContent("#status")).includes(ROOT + "?cat=langHist&view=3d"));

  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); m.on("pageerror", e => errs.push(e.message));
  await m.goto(ROOT + "?cat=hireHist&view=3d"); await m.waitForTimeout(1500);
  ok("phone", await m.evaluate(() => chartCat === "hireHist" && surface.id === "gl" && document.documentElement.scrollWidth <= innerWidth));
  ok("phone: the chosen category is in view", await m.evaluate(() => { const r = document.querySelector("label:has([name=category]:checked)").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  ok("phone: page itself not scrolled", await m.evaluate(() => scrollY === 0));
  await m.screenshot({ path: OUT + "/phone.png" });
  const f = await b.newPage(); f.on("pageerror", e => errs.push(e.message)); await f.goto(PAGE + "?cat=db"); await f.waitForTimeout(300);
  ok("works from a local file", await f.evaluate(() => chartCat === "db"));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  console.log(OUT); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
