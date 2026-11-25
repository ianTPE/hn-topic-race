// Shared test helpers. Every Algolia call is answered by a mock; tests never touch the network.
const { chromium } = require("playwright-core");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { pathToFileURL } = require("node:url");
const PAGE = pathToFileURL(path.resolve(process.env.PAGE || path.join(__dirname, "..", "index.html"))).href;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "hn-topic-race-"));   // screenshots and recordings
const launch = () => chromium.launch({
  headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" })
});
const ok = (name, pass, detail = "") => {
  console.log(pass ? "PASS" : "FAIL", name, detail);
  if (!pass) process.exitCode = 1;
};
module.exports = { PAGE, OUT, launch, ok };
