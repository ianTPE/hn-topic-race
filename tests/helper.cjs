// Shared test helpers. Every Algolia call is answered by a mock; tests never touch the network.
const { chromium } = require("playwright-core");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { pathToFileURL } = require("node:url");
const PAGE = pathToFileURL(path.resolve(process.env.PAGE || path.join(__dirname, "..", "index.html"))).href;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "hn-topic-race-"));   // screenshots and recordings
const launch = () => chromium.launch({
  headless: true, args: (process.env.CHROME_ARGS || "").split(" ").filter(Boolean), ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" })
});
const ok = (name, pass, detail = "") => {
  console.log(pass ? "PASS" : "FAIL", name, detail);
  if (!pass) process.exitCode = 1;
};
// render() only updates the DOM; the canvas is painted in a later paint event
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
module.exports = { PAGE, OUT, launch, ok, settle };
