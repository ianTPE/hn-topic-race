// 更新 index.html 內嵌的長期資料（2007 至今的兩個類別）。
// 用法：npm run history
//
// Algolia 要跑幾千次查詢，這裡改用 ClickHouse 公開的 HN 資料庫（免登入，每個類別一次請求、幾秒鐘）。
// 頁面本身不依賴它；哪天關掉了，已內嵌的資料照樣能播。
import fs from "node:fs";
import path from "node:path";

const HTML = path.join(import.meta.dirname, "..", "index.html");
const ENDPOINT = "https://play.clickhouse.com/?user=play";
const FROM = "2007-02-01";              // HN 2007-02 才公開，之前每月只有零星幾則
const WINDOW = 6;
const BEGIN = "/* HISTORY:BEGIN */", END = "/* HISTORY:END */";

const word = w => `hasToken(s,'${w}')`;
// 規則與頁面的 termQueryPlan() 一致：js、php 不算 node.js、.php 這類寫法；llm 與 llms 同一則只算一次
const RULES = {
  "javascript / js": `(${word("javascript")} OR match(s,'(^|[^a-z0-9_./-])js([^a-z0-9_]|$)'))`,
  "php": "match(s,'(^|[^a-z0-9_./])php([^a-z0-9_]|$)')",
  "llm / llms": `(${word("llm")} OR ${word("llms")})`,
  // 護欄、金流、鐵軌不算 Ruby on Rails
  "rails": "match(replaceRegexpAll(s,'(guard|payments?|banking|financial|card|crypto|train) ?-?rails',' '),'(^|[^a-z0-9_])rails([^a-z0-9_]|$)')"
};
// 同一個詞沿用 Languages 的順序，顏色才會一樣（顏色依順序取自 PALETTE）
const GROUPS = {
  langHist: ["python","javascript / js","typescript","rust","kotlin","elixir","zig","clojure","haskell","scala","lisp","java","php","perl","erlang"],
  waveHist: ["rails","ajax","iphone","android","nosql","hadoop","bitcoin","blockchain","docker","kubernetes","vr","iot","nft","chatgpt","llm / llms"]
};

async function query(sql) {
  const r = await fetch(ENDPOINT, { method: "POST", body: sql + " FORMAT JSONCompact", signal: AbortSignal.timeout(90000) });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 300));
  return JSON.parse(text).data;
}

const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const thisMonth = generatedAt.slice(0, 7);
let labels = null;
const out = {};
for (const [group, terms] of Object.entries(GROUPS)) {
  const t0 = Date.now();
  const rows = await query(`SELECT formatDateTime(time,'%Y-%m','UTC') AS m, count(), ${terms.map(t => `countIf(${RULES[t] ?? word(t)})`).join(", ")}
    FROM (SELECT time, replaceRegexpAll(replaceAll(lower(concat(title,' ',replaceRegexpAll(text,'<[^>]*>',' '))),'&#x2f;','/'),'&[#a-z0-9]+;',' ') AS s
          FROM hackernews_history FINAL
          WHERE dead = 0 AND deleted = 0 AND type IN ('story','comment') AND time >= toDateTime('${FROM} 00:00:00','UTC'))
    GROUP BY m ORDER BY m`);
  const months = rows.map(r => r[0]);
  // 月份必須連續、不缺、每個月都有量，否則寧可不寫
  const want = [];
  for (let d = new Date(FROM + "T00:00:00Z"); d.toISOString().slice(0, 7) <= thisMonth; d.setUTCMonth(d.getUTCMonth() + 1)) want.push(d.toISOString().slice(0, 7));
  if (months.join() !== want.join()) throw new Error(`${group}：月份不完整（${months.length}／${want.length}），沒有改寫 index.html`);
  if (rows.some(r => Number(r[1]) < 1000 && r[0] !== thisMonth)) throw new Error(`${group}：有月份的總則數太少，沒有改寫 index.html`);

  labels = months.slice(WINDOW - 1).map(m => m + (m === thisMonth ? "*" : ""));
  out[group] = terms.map((t, i) => [t, labels.map((_, k) => {
    const win = rows.slice(k, k + WINDOW);
    const sum = c => win.reduce((a, r) => a + Number(r[c]), 0);
    return Math.round(sum(i + 2) / sum(1) * 1e6);
  })]);
  console.log(`${group}：${months.length} 個月 × ${terms.length} 詞，${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

const block = `${BEGIN}
const HISTORY = {
  generatedAt: ${JSON.stringify(generatedAt)},     // UTC 快照時間
  window: ${WINDOW},                                // 滾動窗口（月）
  labels: ${JSON.stringify(labels)},
  data: {
${Object.entries(out).map(([g, list]) => `    ${g}: {\n${list.map(([t, v]) => `      ${JSON.stringify(t)}: [${v.join(",")}]`).join(",\n")}\n    }`).join(",\n")}
  }
};
${END}`;
const now = fs.readFileSync(HTML, "utf8");
const i = now.indexOf(BEGIN), j = now.indexOf(END);
if (i < 0 || j < i) throw new Error("index.html 裡找不到 HISTORY 標記");
fs.writeFileSync(HTML + ".tmp", now.slice(0, i) + block + now.slice(j + END.length));
fs.renameSync(HTML + ".tmp", HTML);
console.log(`已寫入 index.html（長期資料 ${(block.length / 1024).toFixed(1)} KB）`);
