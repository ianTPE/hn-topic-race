// scripts/snapshot.mjs runs the page's own code under Node: page changes must not break that. No network, nothing written.
const { spawnSync } = require("node:child_process"), path = require("node:path");
const { ok } = require("./helper.cjs");
const r = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "snapshot.mjs"), "--check"], { encoding: "utf8" });
ok("snapshot script loads the page code", r.status === 0 && /8 個類別、95 個不重複詞/.test(r.stdout), r.stdout.trim() + r.stderr.slice(0, 200));
