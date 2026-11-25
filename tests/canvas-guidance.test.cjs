// Details from the HTML-in-Canvas guides: drawable children, missing paint records, resizable textures.
const { PAGE, launch, ok, settle } = require("./helper.cjs");
(async () => {
  const b = await launch(); const p = await b.newPage({ viewport: { width: 1400, height: 950 } }); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(PAGE + "?cat=langHist"); await p.waitForTimeout(400);
  ok("every direct child of the canvas is drawable", await p.evaluate(() => [...canvas.children].every(c => c.hasAttribute("drawable"))));
  ok("rows are still an accessible list", (await p.locator("#rows").ariaSnapshot()).startsWith("- list:") && await p.locator("#rows").getByRole("listitem").count() === 15);
  // 2D: one missing paint record costs one element for one frame
  const r2 = await p.evaluate(() => new Promise(res => {
    pause(); const real = ctx.drawElementImage; let calls = 0, paints = 0; const on = canvas.onpaint;
    ctx.drawElementImage = function (...a) { calls++; if (calls === 1) throw new DOMException("no record", "InvalidStateError"); return real.apply(this, a); };
    canvas.onpaint = e => { paints++; on.call(canvas, e); };
    canvas.requestPaint();
    setTimeout(() => { ctx.drawElementImage = real; canvas.onpaint = on; res([calls, paints]); }, 300);
  }));
  ok("2D retries after a missing paint record", r2[1] === 2 && r2[0] > 20, r2.join());
  await p.check("#mode3d", { force: true }); await p.waitForTimeout(1300);
  const r3 = await p.evaluate(() => new Promise(res => {
    const c = $("gl"), gl = scene.gl, real = gl.texElementSubImage2D, on = c.onpaint; let failed = null, paints = 0, again = false;
    gl.texElementSubImage2D = function (...a) { const node = a[4]; if (!failed) { failed = node; throw new DOMException("no record", "InvalidStateError"); } if (node === failed) again = true; return real.apply(this, a); };
    c.onpaint = e => { paints++; on.call(c, e); };
    progress = 0.5; render(0.5, true);
    setTimeout(() => { delete gl.texElementSubImage2D; c.onpaint = on; res([!!failed, again, paints, scene.tex.get(failed)?.stale]); }, 400);
  }));
  ok("3D uploads the missed element on the next paint", r3[0] && r3[1] && r3[2] >= 2 && r3[3] === false, r3.join());
  // resizing reuses the same texture object
  const same = await p.evaluate(async () => {
    const n = data[0].row, t = scene.tex.get(n), id = t.id, w = t.w; recording = true; fitGrid();
    await new Promise(r => setTimeout(r, 200)); const grown = [scene.tex.get(n).id === id, scene.tex.get(n).w > w, scene.gl.getError()];
    recording = false; fitGrid(); await new Promise(r => setTimeout(r, 200)); return [...grown, scene.tex.get(n).w === w];
  });
  ok("textures are resized in place", same[0] && same[1] && same[2] === 0 && same[3], same.join());
  // a hidden caption no longer takes clicks
  await p.uncheck("#mode3d", { force: true }); await p.waitForTimeout(1200);
  const hit = await p.evaluate(async () => {
    const at = async d => { const t = takeovers.at(-1); progress = (t.at + d) / (labels.length - 1); render(progress, true); await new Promise(r => setTimeout(r, 150)); };
    const box = $("cNews").firstElementChild; await at(4); scrollTo(0, 0); const q = box.getBoundingClientRect(), x = q.x + q.width / 2, y = q.y + q.height / 2;
    const on = box.contains(document.elementFromPoint(x, y)); progress = 0; render(0, true); await new Promise(r => setTimeout(r, 150)); return [on, box.contains(document.elementFromPoint(x, y))];
  });
  ok("caption takes the pointer only while shown", hit[0] && !hit[1], hit.join());
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
