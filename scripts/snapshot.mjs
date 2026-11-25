// 更新 index.html 內嵌的離線快照（8 個預設類別 × 60 個月，滾動 3 個月窗口）。
// 用法：npm run snapshot
//
// 直接執行 index.html 自己的程式（CATEGORIES、fetchSeries()），所以快照與頁面即時抓取是同一套算法。
// 第一次約 6,450 次 Algolia 查詢、15 分鐘左右（額度是每 IP 每小時 10,000 次，別連跑兩次全新的）；已完成月份快取在 snapshot.cache.json（30 天），
// 重跑只抓當月。有任何一格抓失敗就不寫檔，直接重跑即可補齊。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const DIR = import.meta.dirname;
const HTML = path.join(DIR, "..", "index.html");
const CACHE = path.join(DIR, "snapshot.cache.json");
const MONTHS = 60, WINDOW = 3;
const BEGIN = "/* SNAPSHOT:BEGIN */", END = "/* SNAPSHOT:END */";
// 先寫暫存檔再改名，中途被中斷也不會留下半個檔案
const writeFile = (file, text) => { fs.writeFileSync(file + ".tmp", text); fs.renameSync(file + ".tmp", file); };

// 以檔案當 localStorage，沿用頁面的快取規則（含 30 天期限）
const store = new Map(fs.existsSync(CACHE) ? Object.entries(JSON.parse(fs.readFileSync(CACHE, "utf8"))) : []);
const saveCache = () => writeFile(CACHE, JSON.stringify(Object.fromEntries(store)));
const localStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size; }
};

// 頁面程式需要的最小 DOM：只有 exact 勾選框會影響計算，其餘一律是無作用的替身
const stub = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? [][Symbol.iterator] : stub),
  set: () => true,
  apply: () => stub
});
const context = vm.createContext({
  document: {
    getElementById: id => (id === "exact" ? { checked: true } : stub),
    querySelectorAll: () => [],
    createElement: () => stub,
    documentElement: {}
  },
  localStorage, fetch, setTimeout, URLSearchParams, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false })
});

const html = fs.readFileSync(HTML, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const start = script.indexOf("// -------- 載入內嵌的離線快照");     // 從這裡開始是頁面啟動，不需要執行
if (start < 0) throw new Error("index.html 裡找不到啟動區段的標記");
vm.runInContext(script.slice(0, start), context, { filename: "index.html" });
const { CATEGORIES, CACHE_PREFIX, fetchSeries } = vm.runInContext("({ CATEGORIES, CACHE_PREFIX, fetchSeries })", context);
for (const k of store.keys()) if (!k.startsWith(CACHE_PREFIX)) store.delete(k);   // 舊計數規則的快取

const cats = Object.keys(CATEGORIES).filter(c => CATEGORIES[c].length);
const terms = [...new Set(cats.flatMap(c => [...CATEGORIES[c]]))];   // 跨類別重複的詞只抓一次
console.log(`${cats.length} 個類別、${terms.length} 個不重複詞`);
if (process.argv.includes("--check")) process.exit(0);          // 只確認頁面程式能在 Node 裡載入，不抓資料

let lastSave = Date.now();
const t0 = Date.now();
const generatedAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
const r = await fetchSeries(terms, MONTHS, WINDOW, (done, jobs) => {
  if (done % 200 === 0 || done === jobs) console.log(`${done}/${jobs}  ${Math.round((Date.now() - t0) / 1000)}s`);
  if (Date.now() - lastSave > 15000) { saveCache(); lastSave = Date.now(); }
});
saveCache();
console.log(`查詢 ${r.http} 次、快取命中 ${r.cached} 次`);
if (r.badMonths || r.badCells || r.gapCells) {
  console.error(`有資料抓失敗（分母 ${r.badMonths}、分子 ${r.badCells}、缺窗口 ${r.gapCells}），沒有改寫 index.html。請重跑。`);
  process.exit(1);
}

const values = new Map(r.data.map(d => [d.name, [...d.values].map(v => Math.round(v * 10) / 10)]));
const lines = cats.map(c => `    ${c}: {\n` +
  CATEGORIES[c].map(t => `      ${JSON.stringify(t)}: [${values.get(t).join(",")}]`).join(",\n") + "\n    }");
const block = `${BEGIN}
const SNAPSHOT = {
  generatedAt: ${JSON.stringify(generatedAt)},     // UTC 快照時間
  window: ${WINDOW},                                // 滾動窗口（月）
  labels: ${JSON.stringify([...r.labels])},
  data: {
${lines.join(",\n")}
  }
};
${END}`;
// 抓取要好幾分鐘，寫入前重讀一次，不蓋掉這段期間對 index.html 的修改
const now = fs.readFileSync(HTML, "utf8");
const i = now.indexOf(BEGIN), j = now.indexOf(END);
if (i < 0 || j < i) throw new Error("index.html 裡找不到 SNAPSHOT 標記");
writeFile(HTML, now.slice(0, i) + block + now.slice(j + END.length));
console.log(`已寫入 index.html（快照區 ${(block.length / 1024).toFixed(1)} KB）`);
