// 「go」的程式語言用法：60 個月版（程式語言類別）用的 Go 每月則數。
// go 多半是英文動詞，不能直接數。做法：
//   1. 從 ClickHouse 公開的 HN 資料庫抓含 go 的貼文和留言，用規則分三層：
//      有明確線索（golang、goroutine、go.mod⋯）→ 直接算；明顯是動詞（to go、let's go、go ahead⋯）→ 直接不算；其他 → 交給判斷模型。
//   2. 模糊的那層附上所屬文章的標題，交給判斷模型（決策模型：只回傳機率，不生成文字）。
//      先用 TypeSafe 的 Jev，額度用完自動換 Perplexity 的 pplx-decider；兩者都按輸入 tokens 計費。
//   3. 每月則數＝直接算的＋模型判斷為是的，寫進 index.html 的 GO_COUNTS 區塊。
//
// 用法（需要 .env 裡的 TYPESAFE_API_KEY，或 PERPLEXITY_API_KEY）：
//   node scripts/go.mjs fetch    抓資料並分層（不花錢）
//   node scripts/go.mjs roots    找出每則留言所屬文章的標題（不花錢）
//   node scripts/go.mjs judge    判斷模糊的那層（會花錢；可中斷，重跑會接著做）
//   node scripts/go.mjs write    寫進 index.html（之後跑 npm run snapshot 更新快照）
// 中間結果都放在 scripts/go-cache/（不進 git）。
import fs from "node:fs";
import path from "node:path";

const DIR = import.meta.dirname;
const CACHE = path.join(DIR, "go-cache");
const HTML = path.join(DIR, "..", "index.html");
const ENDPOINT = "https://play.clickhouse.com/?user=play";
const FIRST = "2021-10";                 // 60 個月＋滾動窗口的 2 個月 lead-in
const THRESHOLD = 0.7;                   // 模型機率 ≥ 這個值算是 Go 語言（驗證：模糊層 300 則裡沒有誤判，只漏 1 則）
const BEGIN = "/* GO_COUNTS:BEGIN */", END = "/* GO_COUNTS:END */";
fs.mkdirSync(CACHE, { recursive: true });

const env = Object.fromEntries((fs.existsSync(path.join(DIR, "..", ".env")) ? fs.readFileSync(path.join(DIR, "..", ".env"), "utf8") : "")
  .split("\n").map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.trim().replace(/^["']|["']$/g, "")]));
const key = k => process.env[k] || env[k];
const writeFile = (file, text) => { fs.writeFileSync(file + ".tmp", text); fs.renameSync(file + ".tmp", file); };
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const readLines = f => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : []);

async function query(sql) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(ENDPOINT, { method: "POST", body: sql, signal: AbortSignal.timeout(280000) });
      const t = await r.text();
      if (!r.ok) throw new Error(t.slice(0, 300));
      return t;
    } catch (e) {
      if (i >= 4) throw e;
      console.log(`ClickHouse 重試（${e.message.slice(0, 80)}）`);
      await new Promise(res => setTimeout(res, 5000 * (i + 1)));
    }
  }
}

// -------- 分層規則（ClickHouse 的 re2 語法）--------
// 線索：出現就直接算是 Go 語言
const CUE = String.raw`(?i)golang|goroutines?|gofmt|gopls|go\.mod|go\.sum|\bgo (mod|vet|fmt) |\bgo1\.[0-9]|\bgo 1\.[0-9]|written in go\b|rewr[io]te (it )?in go\b|\bpkg\.go\.dev|\bgo\.dev\b|golang\.org|\bgo (generics|compiler|runtime|modules?|stdlib|standard library|toolchain|binar(y|ies)|codebase)\b`;
// 動詞用法：先把這些拿掉，剩下沒有 go 的就直接算不是。只拿掉小寫 go：「switch to Go」「Rust or Go」的大寫 Go 多半是語言
// （驗證時發現 and／or 和不分大小寫會誤刪語言；go get／go build／go work 在英文裡也常見，所以不當線索，交給模型）
const VERB1 = String.raw`(?i:\b(to|let'?s|lets|we|you|i|they|he|she|it|will|would|can|could|should|might|must|may|gonna|wanna|gotta|don'?t|didn'?t|doesn'?t|won'?t|can'?t|cannot|never|please|ready to|good to|here we|there you|on the|way to|time to|have to|has to|had to|need to|want to|going to|got to|let me|let us|i'll|we'll|you'll|they'll|i'd|we'd|you'd|i'm|would rather|rather)) go\b`;
const VERB2 = String.raw`\bgo[ -]+(to|ahead|back|out|away|through|into|up|down|over|off|by|around|along|home|wrong|bad|bust|broke|public|live|viral|missing|crazy|nuts|figure|look|get|see|find|check|read|buy|try|play|watch|outside|beyond|deeper|further|far|faster|slower|wild|extinct|under|after|against|unnoticed|unpunished|unanswered|ballistic|belly|south|north|east|west|first|next|again|anywhere|everywhere|somewhere|nowhere)\b|\b(go|Go)-to\b|^Go\b|[.!?"] +Go\b|\b(AlphaGo|Pokemon Go|Pokémon Go|CS:GO)\b|\bthe game of go\b|\bgo board\b`;
const sqlStr = s => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const TIERS = `WITH ${sqlStr(CUE)} AS cue,
  replaceRegexpAll(replaceRegexpAll(o, ${sqlStr(VERB1)}, ' '), ${sqlStr(VERB2)}, ' ') AS o2,
  match(o, cue) AS accept,
  NOT accept AND NOT match(o2, '(?i)(^|[^A-Za-z0-9_])go([^A-Za-z0-9_]|$)') AS reject`;
const ITEMS = from => `FROM (SELECT id, type, parent, time, title,
    replaceRegexpAll(replaceRegexpAll(replaceRegexpAll(concat(title, ' ', text), '<[^>]*>', ' '), '&#x27;|&#39;', ''''), '&quot;', '"') AS o
  FROM hackernews_history FINAL
  WHERE dead = 0 AND deleted = 0 AND type IN ('story', 'comment')
    AND time >= toDateTime('${from}-01 00:00:00', 'UTC') AND time < addMonths(toDateTime('${from}-01 00:00:00', 'UTC'), 1)
    AND hasToken(lower(o), 'go'))`;

function months() {
  const out = [], now = new Date();
  for (let d = new Date(FIRST + "-01T00:00:00Z"); d <= now; d.setUTCMonth(d.getUTCMonth() + 1)) out.push(d.toISOString().slice(0, 7));
  return out;
}
// 送給模型的文字：每個 go 前後 150 個字元（最多 3 段），省 tokens
export function snippet(o) {
  const t = o.replace(/\s+/g, " ").trim(), spans = [];
  for (const m of t.matchAll(/(^|[^A-Za-z0-9_])go(?=[^A-Za-z0-9_]|$)/gi)) {
    const a = Math.max(0, m.index - 150), b = Math.min(t.length, m.index + 152);
    if (spans.length && a <= spans.at(-1)[1]) spans.at(-1)[1] = b; else spans.push([a, b]);
    if (spans.length > 3) break;
  }
  return spans.slice(0, 3).map(([a, b]) => t.slice(a, b)).join(" … ");
}

// -------- 1. 抓資料並分層 --------
async function fetchAll() {
  const counts = readJSON(path.join(CACHE, "counts.json"), {});
  const ms = months(), thisMonth = ms.at(-1);
  for (const m of ms) {
    const file = path.join(CACHE, `amb-${m}.jsonl`);
    if (counts[m] && fs.existsSync(file) && m !== thisMonth) continue;
    const [c] = JSON.parse(`[${(await query(`${TIERS} SELECT count(), countIf(accept), countIf(reject) ${ITEMS(m)} FORMAT JSONCompactEachRow`)).trim()}]`);
    const rows = await query(`${TIERS} SELECT id, type, parent, title, substring(o, 1, 6000) AS o ${ITEMS(m)} WHERE NOT accept AND NOT reject FORMAT JSONEachRow`);
    const amb = rows.split("\n").filter(Boolean).map(l => JSON.parse(l)).map(r => ({ id: r.id, type: r.type, parent: r.parent, title: r.title, s: snippet(r.o) }));
    writeFile(file, amb.map(r => JSON.stringify(r)).join("\n") + "\n");
    counts[m] = { go: +c[0], accept: +c[1], reject: +c[2], ambiguous: amb.length, partial: m === thisMonth };
    writeFile(path.join(CACHE, "counts.json"), JSON.stringify(counts, null, 1));
    console.log(m, counts[m]);
  }
}

// -------- 2. 留言所屬文章的標題（沿 parent 往上找）--------
async function roots() {
  const amb = months().flatMap(m => readLines(path.join(CACHE, `amb-${m}.jsonl`)));
  const titles = readJSON(path.join(CACHE, "roots.json"), {});   // 留言 id → 文章標題
  const parent = new Map();                                        // 查過的節點 id → { parent, type, title }
  let todo = amb.filter(r => r.type === "comment" && !(r.id in titles));
  console.log(`要找標題的留言 ${todo.length} 則`);
  let frontier = new Map(todo.map(r => [r.id, r.parent]));         // 留言 id → 目前往上走到的節點
  for (let round = 0; frontier.size && round < 80; round++) {
    const need = [...new Set(frontier.values())].filter(id => !parent.has(id));
    for (let i = 0; i < need.length; i += 20000) {
      const rows = await query(`SELECT id, parent, type, title FROM hackernews_history FINAL WHERE id IN (${need.slice(i, i + 20000).join(",")}) FORMAT JSONEachRow`);
      for (const l of rows.split("\n").filter(Boolean)) { const r = JSON.parse(l); parent.set(r.id, r); }
    }
    const next = new Map();
    for (const [id, at] of frontier) {
      const n = parent.get(at);
      if (!n) titles[id] = "";                                     // 鏈斷了：沒有標題
      else if (n.type === "story" || n.type === "poll" || n.type === "job" || !n.parent) titles[id] = n.title || "";
      else next.set(id, n.parent);
    }
    frontier = next;
    console.log(`第 ${round + 1} 輪：還有 ${frontier.size} 則`);
  }
  writeFile(path.join(CACHE, "roots.json"), JSON.stringify(titles));
}

// -------- 3. 判斷 --------
const QUESTION = {
  type: "noul",
  instructions: "Does this Hacker News text refer to Go, the programming language (also called golang), at least once?",
  criteria: {
    true: "Go is used as the name of the programming language, its toolchain, runtime or ecosystem",
    false: "every go is the ordinary English verb or noun (let's go, go ahead, on the go), the board game, or part of another name such as a product called 'Something Go'"
  }
};
export const state = (r, titles) => ({ story_title: r.type === "story" ? r.title : (titles[r.id] ?? ""), text: r.s });
const PROVIDERS = [
  { name: "typesafe/jev", key: "TYPESAFE_API_KEY", url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" },
  { name: "perplexity/pplx-decider-v1.2", key: "PERPLEXITY_API_KEY", url: "https://api.perplexity.ai/v1/decisions", model: "pplx-decider-v1.2" }
];
// 回傳 { p, tokens }；額度用完丟出 "exhausted"
export async function decide(provider, st) {
  for (let i = 0; ; i++) {
    let r;
    try {
      r = await fetch(provider.url, {
        method: "POST", signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${key(provider.key)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: provider.model, state: st, questions: { go: QUESTION } })
      });
    } catch (e) { if (i >= 6) throw e; await new Promise(res => setTimeout(res, 2000 * (i + 1))); continue; }
    const text = await r.text();
    if (r.ok) { const j = JSON.parse(text); return { p: j.answers.go.noul, tokens: j.usage?.input_tokens ?? 0 }; }
    if (r.status === 402 || /insufficient|balance|credit|quota exceeded|payment/i.test(text)) throw new Error("exhausted: " + text.slice(0, 200));
    if ((r.status === 429 || r.status >= 500) && i < 8) { await new Promise(res => setTimeout(res, Math.min(30000, 1000 * 2 ** i))); continue; }
    throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
}
async function judge() {
  const titles = readJSON(path.join(CACHE, "roots.json"), {});
  const file = path.join(CACHE, "judged.jsonl");
  const done = new Set(readLines(file).map(r => r.id));
  const todo = months().flatMap(m => readLines(path.join(CACHE, `amb-${m}.jsonl`))).filter(r => !done.has(r.id));
  console.log(`待判斷 ${todo.length} 則（已完成 ${done.size}）`);
  const out = fs.openSync(file, "a");
  let pi = PROVIDERS.findIndex(p => key(p.key)), tokens = {}, n = 0, t0 = Date.now(), next = 0;
  if (pi < 0) throw new Error("沒有 TYPESAFE_API_KEY 或 PERPLEXITY_API_KEY");
  async function worker() {
    while (next < todo.length && pi < PROVIDERS.length) {
      const r = todo[next++], prov = PROVIDERS[pi];
      try {
        const a = await decide(prov, state(r, titles));
        fs.writeSync(out, JSON.stringify({ id: r.id, p: a.p, m: prov.name }) + "\n");
        tokens[prov.name] = (tokens[prov.name] || 0) + a.tokens;
        if (++n % 2000 === 0) console.log(`${n}/${todo.length}  ${Math.round((Date.now() - t0) / 1000)}s  tokens ${JSON.stringify(tokens)}`);
      } catch (e) {
        if (String(e.message).startsWith("exhausted") && PROVIDERS[pi] === prov) {
          console.log(`${prov.name} 額度用完，改用下一個（${e.message.slice(0, 120)}）`);
          do pi++; while (pi < PROVIDERS.length && !key(PROVIDERS[pi].key));
        } else if (!String(e.message).startsWith("exhausted")) console.log(`#${r.id} 失敗，下次重跑再判斷：${e.message.slice(0, 160)}`);
        if (pi < PROVIDERS.length && String(e.message).startsWith("exhausted")) todo.push(r);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  fs.closeSync(out);
  console.log(`完成 ${n} 則，tokens ${JSON.stringify(tokens)}`);
}

// -------- 4. 寫進 index.html --------
function write() {
  const counts = readJSON(path.join(CACHE, "counts.json"), {});
  const judged = new Map(readLines(path.join(CACHE, "judged.jsonl")).map(r => [r.id, r.p]));
  const out = {}, models = new Set(readLines(path.join(CACHE, "judged.jsonl")).map(r => r.m));
  for (const m of months()) {
    const c = counts[m], amb = readLines(path.join(CACHE, `amb-${m}.jsonl`));
    if (!c || c.partial) continue;                                  // 當月還沒結束：不寫，頁面會排除這個月
    const missing = amb.filter(r => !judged.has(r.id)).length;
    if (missing) throw new Error(`${m} 還有 ${missing} 則沒判斷，先跑 judge`);
    out[m] = c.accept + amb.filter(r => judged.get(r.id) >= THRESHOLD).length;
  }
  const block = `${BEGIN}
const GO_COUNTS = {
  generatedAt: ${JSON.stringify(new Date().toISOString().replace(/\.\d+Z$/, "Z"))},
  models: ${JSON.stringify([...models])},
  months: ${JSON.stringify(out)}
};
${END}`;
  const html = fs.readFileSync(HTML, "utf8"), i = html.indexOf(BEGIN), j = html.indexOf(END);
  if (i < 0 || j < i) throw new Error("index.html 裡找不到 GO_COUNTS 標記");
  writeFile(HTML, html.slice(0, i) + block + html.slice(j + END.length));
  console.log(`已寫入 ${Object.keys(out).length} 個月`, out);
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "fetch") await fetchAll();
  else if (cmd === "roots") await roots();
  else if (cmd === "judge") await judge();
  else if (cmd === "write") write();
  else console.log("用法：node scripts/go.mjs fetch | roots | judge | write");
}
