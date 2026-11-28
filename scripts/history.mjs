// 更新 index.html 內嵌的長期資料（2007 至今的程式語言、科技浪潮，2008 至今的硬體成長，加 2012 至今的徵才）。
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

// -------- 硬體：比成長，不比聲量 --------
// 每個詞的聲量（每百萬則，滾動 6 個月）÷ 12 個月前的聲量，存成 log2，頁面畫成對數刻度的倍數（×1、×2、×4…）。
// 分子分母都先加 GROW_FLOOR，小詞從 0 變 2 才不會變成「無限倍」。量大的老平台（x86、ARM、SSD）也收：它們討論多，但倍數不大
// 詞庫比 15 個多，頁面每個月只顯示前 15 名，掉出去的淡出、新進的從下面滑上來
// o 是原文（CUDA、TPU、HBM 這類要分大小寫），s 是小寫。詞的順序不影響顏色：顏色另外排，見 colorsFor()
const GROW_LAG = 12, GROW_FLOOR = 20;
const HW_MATCH = (col, re) => `match(${col},'${re.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')`;
const HW = {
  "x86": HW_MATCH("s", String.raw`\b(x86(_64|-64)?|amd64|x64)\b`),
  "arm": HW_MATCH("o", String.raw`\bARM(64|v[0-9]+)?\b|\b(aarch64|Arm Neoverse|Arm-based|Arm chips?|Arm cores?)\b`),
  "ssd": HW_MATCH("o", String.raw`\bSSDs?\b`),
  "multicore": HW_MATCH("s", String.raw`\b(multi-?core|many-?core)\b`),
  "itanium": HW_MATCH("s", String.raw`\bitanium\b`),
  "cell": HW_MATCH("o", String.raw`\bCell (processor|BE|B\.E\.|chip|SPEs?|SPUs?)\b|\bPS3.{0,40}\b(SPEs?|SPUs?)\b`),
  "larrabee / xeon phi": HW_MATCH("s", String.raw`\b(larrabee|xeon phi|knights landing)\b`),
  "cuda": HW_MATCH("o", String.raw`\bCUDA\b`),
  "fpga": HW_MATCH("s", String.raw`\bfpgas?\b`),
  "asic": HW_MATCH("o", String.raw`\bASICs?\b`),
  "nvme": HW_MATCH("s", String.raw`\bnvme\b`),
  "optane / 3d xpoint": HW_MATCH("s", String.raw`\b(optane|3d ?xpoint)\b`),
  "risc-v": HW_MATCH("s", String.raw`\b(risc-?v|riscv(32|64)?)\b`),
  // M1 之後的 Mac 晶片才算 M 系列；之前的「M7 chip」是 iPhone 的動作協同處理器
  "apple silicon": `(${HW_MATCH("o", String.raw`\b(Apple Silicon|apple silicon)\b`)} OR (time >= toDateTime('2020-06-01 00:00:00','UTC') AND ${HW_MATCH("o", String.raw`\bM[1-9] (Mac|Max|Pro|Ultra|chips?)\b`)}))`,
  "tpu": HW_MATCH("o", String.raw`\bTPUs?\b`),
  "npu": HW_MATCH("o", String.raw`\bNPUs?\b`),
  "ai accelerator": HW_MATCH("s", String.raw`\b(ai|ml|inference|training|neural) (chips?|accelerators?|asics?|processors?)\b`),
  "dram": HW_MATCH("o", String.raw`\b(DRAM|LPDDR[0-9]X?|DDR[45])\b`),
  "hbm": HW_MATCH("o", String.raw`\bHBM[0-9]?E?\b`),
  "chiplet": HW_MATCH("s", String.raw`\bchiplets?\b`),
  "cxl": HW_MATCH("o", String.raw`\bCXL\b`),
  "quantum computing": HW_MATCH("s", String.raw`\bquantum (comput\w*|computers?|processors?|chips?|supremacy|advantage)\b`),
  "neuromorphic": HW_MATCH("s", String.raw`\bneuromorphic\b`),
  "memristor": HW_MATCH("s", String.raw`\bmemristors?\b`),
  "photonics": HW_MATCH("s", String.raw`\b(silicon )?photonics?\b|\boptical (interconnects?|computing|compute)\b|\bco-?packaged optics\b`),
  "euv": HW_MATCH("o", String.raw`\bEUV\b`),
  "cheri": HW_MATCH("o", String.raw`\bCHERI(oT)?\b`),
  "cerebras / wafer-scale": HW_MATCH("s", String.raw`\b(cerebras|wafer-?scale)\b`),
  "groq": `(${HW_MATCH("s", String.raw`\bgroq\b`)} AND NOT ${HW_MATCH("s", String.raw`\bgrok\b`)})`,
  // LPU：Groq 的 language processing unit，2026 起 NVIDIA 也賣（Groq 3 LPU）；學界的 least publishable unit 不算
  "lpu": `(${HW_MATCH("o", String.raw`\bLPUs?\b`)} OR ${HW_MATCH("s", String.raw`\blanguage processing units?\b`)}) AND NOT ${HW_MATCH("s", String.raw`\bleast publishable\b`)}`,
  "tenstorrent": HW_MATCH("s", String.raw`\btenstorrent\b`),
  "taalas / model-on-chip": HW_MATCH("s", String.raw`\btaalas\b|\b(models? (etched|baked|hard-?wired) (in|into) (the )?silicon|model[- ]on[- ](a[- ])?chip|hard-?wired (llm|model|weights))\b`),
  "in-memory compute": HW_MATCH("s", String.raw`\b(in-memory comput\w*|compute-in-memory|processing[- ]in[- ]memory|near-memory comput\w*)\b`),
  "space datacenter": HW_MATCH("s", String.raw`\b(space|orbital|orbiting) data ?cent(er|re)s?\b|\bdata ?cent(er|re)s? in (space|orbit)\b`)
};
// 分三張：處理器（通用架構與新的運算方式）、AI 晶片（加速器）、記憶體與基礎設施（存資料、搬資料、製造與擺放晶片的東西）
// 每張都不超過 15 個詞，全部顯示、各有顏色。超過 15 個的話頁面只畫前 15 名（visible），並放慢播放
const HW_GROUPS = {
  cpuHist: ["x86", "arm", "risc-v", "apple silicon", "multicore", "itanium", "cell", "larrabee / xeon phi", "cheri", "quantum computing", "neuromorphic"],
  hwHist: ["cuda", "fpga", "asic", "tpu", "npu", "lpu", "ai accelerator", "cerebras / wafer-scale", "groq", "tenstorrent", "taalas / model-on-chip"],
  memHist: ["ssd", "nvme", "optane / 3d xpoint", "dram", "hbm", "cxl", "memristor", "in-memory compute", "chiplet", "euv", "photonics", "space datacenter"]
};
const VISIBLE = 15;                     // 與頁面的 VISIBLE 相同
// 顏色：詞庫比 15 色多，一定要重複用。兩個詞同時在前 15 名（而且都有長條）的月數越多，越不能同色；
// 越近的月份權重稍高；名次越近權重越高（÷ 名次差的平方），並排的同色最容易搞混。多種起始順序各自用貪婪法排，再換色、互換顏色直到不再改善，取最好的一組。
// 剩下的撞色會印出來
function colorsFor(data, labels, name) {
  const n = data.length, months = data[0][1].length, w = Array.from({ length: n }, () => new Array(n).fill(0));
  const onAt = k => data.map((d, i) => [d[1][k], i]).sort((a, b) => b[0] - a[0]).slice(0, VISIBLE).filter(x => x[0] > 0).map(x => x[1]);
  // 比成長時詞進出榜很頻繁，每個月幾乎都有同色，先避開並排的；只偏重最近的月份會讓早年的並排同色變三倍
  for (let k = 0; k < months; k++) {
    const on = onAt(k), weight = 1 + 10 * (k / (months - 1)) ** 2;      // 第一個月算 1，最近一個月算 11
    on.forEach((a, ra) => on.forEach((b, rb) => { if (a !== b) w[a][b] += weight / (ra - rb) ** 2; }));
  }
  const C = [...Array(VISIBLE).keys()];
  const cost = (i, c, color) => color.reduce((sum, cj, j) => sum + (cj === c && j !== i ? w[i][j] : 0), 0);
  const total = color => color.reduce((sum, c, i) => sum + cost(i, c, color), 0) / 2;
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);     // 固定種子：每次跑出同一組顏色
  let best = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const order = [...Array(n).keys()].map(i => [w[i].reduce((x, y) => x + y) * (attempt ? 0.5 + rand() : 1), i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    const color = new Array(n).fill(-1);
    for (const i of order) color[i] = C.reduce((b, c) => (cost(i, c, color) < cost(i, b, color) ? c : b), 0);
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < n; i++) {
        const c = C.reduce((b, c) => (cost(i, c, color) < cost(i, b, color) ? c : b), color[i]);
        if (cost(i, c, color) < cost(i, color[i], color)) { color[i] = c; changed = true; }
      }
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (color[a] === color[b]) continue;
        const before = total(color);
        [color[a], color[b]] = [color[b], color[a]];
        if (total(color) < before - 1e-9) changed = true; else [color[a], color[b]] = [color[b], color[a]];
      }
    }
    if (!best || total(color) < total(best)) best = color.slice();
  }
  // 回報：哪幾對同色，以及實際同時在榜上幾個月（不加權）、最後一次是哪個月
  const clash = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (best[a] === best[b] && w[a][b] > 0) {
    const both = [];
    for (let k = 0; k < months; k++) { const on = onAt(k); if (on.includes(a) && on.includes(b)) both.push(k); }
    clash.push(`${data[a][0]} ＝ ${data[b][0]}：${both.length} 個月（最後 ${labels[both.at(-1)].slice(0, 4)} 年）`);
  }
  console.log(`${name} 同色又同時在榜上：${clash.length ? clash.join("、") : "沒有"}`);
  return best;
}
{
  const terms = Object.keys(HW);
  const rows = await query(`SELECT formatDateTime(time,'%Y-%m','UTC') AS m, count(), ${terms.map(t => `countIf(${HW[t]})`).join(", ")}
    FROM (SELECT time, o, lower(o) AS s
          FROM (SELECT time, replaceRegexpAll(replaceRegexpAll(concat(title,' ',text),'<[^>]*>',' '),'&#x2F;','/') AS o
                FROM hackernews_history FINAL
                WHERE dead = 0 AND deleted = 0 AND type IN ('story','comment') AND time >= toDateTime('${FROM} 00:00:00','UTC')))
    GROUP BY m ORDER BY m`);
  addSet("hw", terms, rows, { from: FROM, least: 1000, per: 1e6, digits: 3 });
  const { labels, data } = sets.hw;
  delete sets.hw;
  const grown = data.map(([t, v]) => [t, v.slice(GROW_LAG).map((x, k) => +Math.log2((x + GROW_FLOOR) / (v[k] + GROW_FLOOR)).toFixed(3))]);
  // 全放一張時 34 個詞搶 15 格，看不出方向；每個詞都要分到某一張
  const grouped = Object.values(HW_GROUPS).flat();
  if (grouped.length !== terms.length || terms.some(t => !grouped.includes(t))) throw new Error("HW_GROUPS 要剛好包含 HW 的每個詞");
  for (const [name, list] of Object.entries(HW_GROUPS)) {
    const part = list.map(t => grown.find(g => g[0] === t)), at = labels.slice(GROW_LAG);
    // 詞比 15 個多時，每個月都有詞進出榜，播慢一點：每個月 0.9 秒。全部都在榜上的（記憶體）照其他長期排名，一共一分鐘
    sets[name] = { labels: at, data: part, unit: "growth", lag: GROW_LAG, colors: colorsFor(part, at, name),
      ...(part.length > VISIBLE ? { visible: VISIBLE, msPerMonth: 900 } : {}) };
    console.log(`${name}：${part.length} 詞，${GROW_LAG} 個月成長倍數，${at[0]} → ${at.at(-1)}`);
  }
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
