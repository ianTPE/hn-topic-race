// 更新 index.html 內嵌的長期資料（2007 至今的兩個類別，加 2012 至今的徵才）。
// 用法：npm run history
//
// Algolia 要跑幾千次查詢，這裡改用 ClickHouse 公開的 HN 資料庫（免登入，每個類別一兩次請求、幾秒鐘）。
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
const sets = {};

// rows：[月份, 總數, 各詞則數…]。月份必須連續、每個月都有量，否則寧可不寫
function addSet(name, terms, rows, { from, least, per, digits, ...extra }) {
  const months = rows.map(r => r[0]), want = [];
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 7) <= thisMonth; d.setUTCMonth(d.getUTCMonth() + 1)) want.push(d.toISOString().slice(0, 7));
  // 月初徵才串還沒開的那一兩天，最後一個月可以缺
  if (months.join() !== want.join() && months.join() !== want.slice(0, -1).join()) throw new Error(`${name}：月份不完整（${months.length}／${want.length}），沒有改寫 index.html`);
  if (rows.some(r => Number(r[1]) < least && r[0] !== thisMonth)) throw new Error(`${name}：有月份的總則數太少，沒有改寫 index.html`);
  const labels = months.slice(WINDOW - 1).map(m => m + (m === thisMonth ? "*" : ""));
  const data = terms.map((t, i) => [t, labels.map((_, k) => {
    const sum = c => rows.slice(k, k + WINDOW).reduce((a, r) => a + Number(r[c]), 0);
    return +(sum(i + 2) / sum(1) * per).toFixed(digits);
  })]);
  sets[name] = { labels, data, ...extra };
  console.log(`${name}：${labels[0]} → ${labels.at(-1)}，${labels.length} 個月 × ${terms.length} 詞`);
}

for (const [name, terms] of Object.entries(GROUPS)) {
  const rows = await query(`SELECT formatDateTime(time,'%Y-%m','UTC') AS m, count(), ${terms.map(t => `countIf(${RULES[t] ?? word(t)})`).join(", ")}
    FROM (SELECT time, replaceRegexpAll(replaceAll(lower(concat(title,' ',replaceRegexpAll(text,'<[^>]*>',' '))),'&#x2f;','/'),'&[#a-z0-9]+;',' ') AS s
          FROM hackernews_history FINAL
          WHERE dead = 0 AND deleted = 0 AND type IN ('story','comment') AND time >= toDateTime('${FROM} 00:00:00','UTC'))
    GROUP BY m ORDER BY m`);
  addSet(name, terms, rows, { from: FROM, least: 1000, per: 1e6, digits: 0 });
}

// -------- 徵才：每月「Ask HN: Who is hiring?」底下第一層留言，一則就是一篇徵才文 --------
// 這裡的 react、go、ruby 不太會是別的意思，可以算；go 認大小寫，並先拿掉「Go to」這類句子
const HIRE_FROM = "2012-01-01";         // 2011 年有兩個月不是由 whoishiring 帳號開串
const HIRE = {
  "python": word("python"), "javascript / js": RULES["javascript / js"], "typescript": word("typescript"), "rust": word("rust"), "kotlin": word("kotlin"),
  "aws": word("aws"), "go": `(${word("golang")} OR match(replaceRegexpAll(o,'Go[ -]+(to|To|TO|here|check|ahead|through|beyond|visit|down|live|big|Big|http)',' '),'(^|[^A-Za-z0-9_])Go([^A-Za-z0-9_]|$)'))`,
  "ruby": word("ruby"), "c++": "position(s,'c++') > 0", "kubernetes": `(${word("kubernetes")} OR ${word("k8s")})`,
  "react": `(${word("react")} OR ${word("reactjs")})`, "java": word("java"), "php": RULES.php, "postgres": `(${word("postgres")} OR ${word("postgresql")})`, "llm / llms": RULES["llm / llms"]
};
{
  const NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const all = await query(`SELECT id, title FROM hackernews_history FINAL WHERE type = 'story' AND dead = 0 AND deleted = 0 AND by IN ('whoishiring','_whoishiring') AND title ILIKE 'Ask HN: Who is hiring? (%' ORDER BY id`);
  const monthOf = new Map();            // 串 → 月份（看標題，不看發文時間）
  for (const [id, title] of all) {
    const [, name, year] = title.match(/\((\w+) (\d{4})\)/) ?? [], k = NAMES.indexOf(name);
    if (k >= 0 && `${year}-${String(k + 1).padStart(2, "0")}-01` >= HIRE_FROM) monthOf.set(Number(id), `${year}-${String(k + 1).padStart(2, "0")}`);
  }
  const terms = Object.keys(HIRE), ids = [...monthOf.keys()];
  const perThread = await query(`SELECT parent, count(), ${terms.map(t => `countIf(${HIRE[t]})`).join(", ")}
    FROM (SELECT parent, o, lower(o) AS s
          FROM (SELECT parent, replaceRegexpAll(replaceAll(replaceRegexpAll(text,'<[^>]*>',' '),'&#x2F;','/'),'&[#a-zA-Z0-9]+;',' ') AS o
                FROM hackernews_history FINAL WHERE dead = 0 AND deleted = 0 AND type = 'comment' AND parent IN (${ids.join(",")})))
    GROUP BY parent`);
  // 同一個月偶爾重複開串：則數加總，連結用最大的那串
  const months = new Map(), biggest = new Map();
  for (const r of perThread) {
    const n = r.map(Number), m = monthOf.get(n[0]);
    const sum = months.get(m) ?? months.set(m, Array(terms.length + 1).fill(0)).get(m);
    sum.forEach((_, i) => { sum[i] += n[i + 1]; });
    if (n[1] > (biggest.get(m)?.[1] ?? 0)) biggest.set(m, n);
  }
  const rows = [...months].sort(([a], [b]) => (a < b ? -1 : 1)).map(([m, v]) => [m, ...v]);
  addSet("hireHist", terms, rows, { from: HIRE_FROM, least: 100, per: 100, digits: 1, unit: "jobs", threads: rows.slice(WINDOW - 1).map(r => biggest.get(r[0])[0]) });
}

const block = `${BEGIN}
const HISTORY = {
  generatedAt: ${JSON.stringify(generatedAt)},     // UTC 快照時間
  window: ${WINDOW},                                // 滾動窗口（月）
  sets: {
${Object.entries(sets).map(([g, { data, ...meta }]) => `    ${g}: {\n${Object.entries(meta).map(([k, v]) => `      ${k}: ${JSON.stringify(v)},\n`).join("")}` +
  `      data: {\n${data.map(([t, v]) => `        ${JSON.stringify(t)}: [${v.join(",")}]`).join(",\n")}\n      }\n    }`).join(",\n")}
  }
};
${END}`;
const now = fs.readFileSync(HTML, "utf8");
const i = now.indexOf(BEGIN), j = now.indexOf(END);
if (i < 0 || j < i) throw new Error("index.html 裡找不到 HISTORY 標記");
fs.writeFileSync(HTML + ".tmp", now.slice(0, i) + block + now.slice(j + END.length));
fs.renameSync(HTML + ".tmp", HTML);
console.log(`已寫入 index.html（長期資料 ${(block.length / 1024).toFixed(1)} KB）`);
