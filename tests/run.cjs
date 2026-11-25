// Runs every *.test.cjs in its own process; exits non-zero if any check fails.
const { spawnSync } = require("node:child_process"), fs = require("node:fs"), path = require("node:path");
let bad = 0;
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.cjs")).sort()) {
  console.log(`\n# ${f}`);
  if (spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit" }).status !== 0) bad++;
}
console.log(bad ? `\n${bad} test file(s) failed` : "\nAll tests passed");
process.exit(bad ? 1 : 0);
