// Draws preview.png (1200x630 share image): the last frame of the LLM race, centred on the stage colour.
const path = require("node:path");
const { PAGE, launch, settle } = require("../tests/helper.cjs");
(async () => {
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });   // reduced motion: jumps to the last month
  await p.goto(PAGE);
  // the canvas stays where it is in the DOM (its children draw it); only the rest of the page is hidden
  await p.addStyleTag({ content: `.wrap > :not(.stage), .stage > :not(.screen) { display:none !important; }
    .stage { position:fixed; inset:0; border-radius:0; outline:0; } canvas { width:1120px !important; margin:0 auto; }` });
  await settle(p);
  if (await p.evaluate(() => !LIVE || canvas.getBoundingClientRect().height !== 630)) throw new Error("preview: HTML-in-Canvas is not available or the layout is off");
  await p.screenshot({ path: path.join(__dirname, "..", "preview.png") });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
