// Draws preview.png (1200x630 share image): the last frame of the LLM race, centred on the stage colour.
const path = require("node:path");
const { PAGE, launch } = require("../tests/helper.cjs");
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });   // reduced motion: jumps to the last month
  await p.goto(PAGE);
  await p.evaluate(() => {
    document.body.replaceChildren(canvas);
    document.body.style.background = INK.bg;
    canvas.style.cssText = "width:auto;height:630px;margin:0 auto";
  });
  await p.screenshot({ path: path.join(__dirname, "..", "preview.png") });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
