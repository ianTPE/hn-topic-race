# HN Topic Bar Chart Race

A bar chart race of what Hacker News talks about: mentions per million posts and comments, month by month, over five years.

**[Open the live page](https://iantpe.github.io/hn-topic-race/)**

[![Bar chart race frame ranking LLM names by Hacker News mentions](preview.png)](https://iantpe.github.io/hn-topic-race/)

**Needs Chrome 157 or later, or a current version of Edge.** Every term, number and bar is live HTML drawn into one `<canvas>` with [HTML-in-Canvas](https://github.com/WICG/html-in-canvas). That gives one picture two things that used to exclude each other:

- It behaves like HTML: drag the timeline (a native `<input type="range">`), click a term to read that month's HN threads, select a number, press Ctrl+F, tab through the rows, use a screen reader.
- It behaves like a canvas: `captureStream()` records the same pixels, CSS gradients and glow included, straight to a video.

Other browsers show a short explanation instead of the chart, with links to the [Firefox](https://github.com/mozilla/standards-positions/issues/1076) and [Safari](https://github.com/WebKit/standards-positions/issues/630) discussions. There is deliberately no fallback renderer.

One HTML file. No backend, no build step, no external scripts or fonts. Opening the page makes no network requests: the eight preset categories play from a snapshot embedded in the file.

- **Four long races**: programming languages since 2007 (Lisp leads first, Rust passes Python in 2026), tech waves since 2007 (Rails, iPhone, Android, Bitcoin, ChatGPT, LLMs), hardware growth since 2008, and skills in "Who is hiring?" posts since 2012. A caption, also HTML in the canvas, marks every new #1. All embedded.
- **Hardware growth since 2008** ranks how many times more a term is mentioned than a year earlier, so new directions (TPU, chiplets, Cerebras, space data centers, models etched into silicon) can pass old platforms that are simply used a lot. It draws from a pool of 34 terms and shows the top 15 at each moment, so terms enter and leave. See [Hardware](#hardware).
- **Compare your own terms**: up to 15, counted live through the [HN Search API](https://hn.algolia.com/api) and cached in your browser.
- **Check the numbers**: "Spot-check hits" lists the HN items behind a count, with links.
- **Fixed or dynamic axis**: one scale for the whole period by default; turn on Dynamic axis and the scale follows the leaders.
- **Share a link**: the address follows the chart. See [Links](#links).
- **Export a video**: 1920×1080 on desktop, portrait on phones.
- English and Traditional Chinese; follows your light/dark setting.

## Run it

Open `index.html` in Chrome 157 or later, or a current version of Edge. `preview.png` is only the image shown when the link is shared; the page does not load it.

## Links

| Parameter | Meaning |
|---|---|
| `cat=langHist` | a preset: `model`, `ai`, `lang`, `db`, `frontend`, `editor`, `cloud`, `infra`, `langHist`, `waveHist`, `hireHist` |
| `terms=rust,zig&m=60&w=3` | your own terms, months, rolling window. Nothing is fetched until the reader presses "Fetch data" |
| `view=3d` | open in 3D |
| `axis=dynamic` | dynamic axis |

Example: [Languages since 2007, in 3D](https://iantpe.github.io/hn-topic-race/?cat=langHist&view=3d).

## Make your own

Fork or clone it; the page is one file, [`index.html`](index.html), and there is nothing to build.

**Just want other terms?** No code needed: pick Custom on the page, or share a link such as `?terms=rust,zig&m=60&w=3`.

**Change a category:** edit its terms in `CATEGORIES` in `index.html` (up to 15), then run `npm run snapshot`.

**Add a category**, four places in `index.html`:

1. a line in `CATEGORIES`, for example `shell: ["zsh", "nushell"],`
2. an `<input type="radio" name="category" value="shell">` next to the others
3. its name in `cats`, once in English and once in Chinese

Then run `npm run snapshot` to fill in its numbers.

**Change a long race:** edit the terms and rules in `scripts/history.mjs`, then run `npm run history`. A race can have more than 15 terms, like `HW` (hardware): give its set `visible: 15` and the page shows the top 15 at each moment.

**Publish it:** on GitHub, Settings → Pages → Deploy from a branch → `main`, `/ (root)`. Replace the three `iantpe.github.io` addresses at the top of `index.html` with yours, and point the two "Source code" links at your repository.

## How the drawing works

1. `<canvas content="drawable">` lays out its children. Each row is an `<li drawable>` with a link, a bar and a value.
2. `render()` runs in `requestAnimationFrame` and only updates the DOM: text, a `--len` custom property, and the row order (`moveBefore()`, so focus and selection survive a rank change).
3. The `paint` event draws grid lines with plain Canvas 2D, then every element with `drawElementImage()`. The browser keeps hit testing and accessibility positions in sync.
4. A `ResizeObserver` on `device-pixel-content-box` keeps the canvas grid at one pixel per device pixel. While recording, the grid is fixed at 1920×1080.

### 3D

The **3D** switch moves the same elements to a second, WebGL 2 canvas with `moveBefore()`, so focus and selection survive, and turns the camera. There is no 3D library.

- Each row is uploaded with `texElementSubImage2D()`, only when it is in the paint event's `changedElements`.
- The matrix that draws a row is also passed to `updateElementGeometry()`, perspective included. Links, text selection, find-in-page and the screen reader follow the tilt.
- The front of each bar is still its CSS; WebGL adds the sides, a highlight and shadows on the wall behind.
- Drag empty space, or focus the chart and use the arrow keys, to rotate; double-click or press 0 to reset. You can rotate while recording.

2D stays the default because perspective makes lengths harder to compare.

## How mentions are counted

- Every value is a share: items mentioning the term ÷ all posts and comments, over a rolling window. Growth of HN itself cancels out.
- For large result sets the API returns an estimate (`exhaustiveNbHits=false`). An empty query over one month reported 136,281 items; the real count was 358,184. Totals therefore come from a query with `facets=_tags`, and terms are sent as quoted phrases.
- Only titles and text are matched, not usernames or URLs.
- Terms such as `chatgpt / gpt` are document unions, so an item that mentions both counts once.
- Failed months are dropped from both numerator and denominator, so they cannot create a fake spike.

The page's Methodology section has the details, including which ambiguous terms were left out of the presets.

### Go

"go" is usually an English verb, and most people write "Go", not "golang", so a search for it counts mostly verbs. The 60-month Languages preset counts Go with a decision model instead (a model that answers a yes/no question with a probability and writes no text). `scripts/go.mjs` does it in three steps:

1. It takes every post and comment containing "go" from [ClickHouse's public Hacker News dataset](https://clickhouse.com/docs/getting-started/playground) and sorts them with rules:
   - **counted**: clear signs of the language, such as golang, goroutine, go.mod, `go vet`, Go 1.22 or "written in Go";
   - **dropped**: every "go" is a lowercase verb, such as to go, let's go or go ahead;
   - **judged**: everything else.
2. For each judged item, the model gets about 300 characters around each "go" and the title of its thread. It counts as Go at a probability of 0.7 or more.
3. The monthly counts go into the `GO_COUNTS` block of `index.html`. The page divides them by the same monthly totals as every other term. "Fetch data" does not query `go`, and the current, unfinished month is left out of its bar.

From October 2021 to October 2026 (61 finished months), 886,281 items contained "go":

| Group | Items | Result |
|---|---|---|
| Counted by rule | 14,115 | all counted |
| Dropped by rule | 635,787 | none counted |
| Judged by the model | 236,278 | 62,428 counted |

**Accuracy.** Samples from each group were labeled by two other models (Kimi and MiniMax). Only items where both agreed were scored; in the judged samples they disagreed on 6 of 500, which were left out.

| Group | Sample | Result |
|---|---|---|
| Counted by rule | 54 | all were Go |
| Dropped by rule | 400 | 2 were Go (0.5%) |
| Judged, threshold 0.7 | 494 | precision 100% (127 of 127), recall 97.7% (127 of 130) |

So Go is slightly undercounted: about 1,500 missed by the model and about 3,000 dropped by the rules, against about 76,500 counted, roughly 6% in all. The dropped-group estimate comes from only two hits in 400 items, so treat it as rough. One of the three misses in the judged sample was in fact a verb ("Go look at…") that both labeling models got wrong.

**Cost.** The model was [Jev](https://openrouter.ai/docs/guides/community/jev) from TypeSafe, at $0.042 per million input tokens with free output. About 450 tokens per item made 107 million tokens, about **$4.50**, and about 80 minutes at 8 requests in parallel. The rules matter: judging all 886,281 items would cost about four times as much.

**Other decision models.** Four more were run on the same judged-group sample (494 items, threshold 0.7), with the same question, snippets and thread titles:

| Model | Precision | Recall | Tokens per item | Price per million input tokens | 236,278 items | Long race (about 570,000) |
|---|---|---|---|---|---|---|
| TypeSafe Jev (used) | 100% | 97.7% | 450 | $0.042 | $4.50 (paid) | about $11 |
| Perplexity `pplx-decider-v1.2` | 100% | 97.7% | 234 | $0.02 | about $1.10 | about $2.70 |
| Alibaba Model Studio `decision-model` | 99.2% | 99.2% | 223 | ¥0.30 | about $2.20 | about $5.30 |
| Volcengine Ark `doubao-seed-2-1-lite-260915` | 100% | 98.5% | 450 | ¥0.80 | about $12 | about $28 |
| Alibaba Model Studio `decision-model-preview` | 51.6% | 99.2% | 170 | not listed | not usable | not usable |

Costs other than Jev's are estimates from list prices and the measured tokens, at about ¥7.2 to the dollar; Perplexity's price is its OpenRouter list price. The preview model judged 121 verbs as Go. Ark's System One API needs the header `ark-beta-systemone-api: true`; Model Studio's endpoint includes your workspace ID (`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/systemone`).

An earlier, smaller test (80 items, whole texts) also found no mistakes from `microsoft/microsoft-decision-1.1` and `liquid/d1-ultra`, while `perplexity/pplx-decider-flash-v1.2`, `cloudflare/clef-flash` and Google's Gemini Decision 1 each counted a product named "Opencode Go" as the language. OpenRouter had no free version of the ones tried. Gemini Decision 1 is free in Google AI Studio, but limited to 10,000 requests a day.

**The long race could include Go too.** Since November 2009, 2.1 million items contain "go"; with the same rules about 570,000 would need the model. With Perplexity's decider that is roughly $3. It has not been done, only because it costs money.

To redo it, put `TYPESAFE_API_KEY` or `PERPLEXITY_API_KEY` in `.env` (the script uses Jev first and switches to Perplexity when the Jev balance runs out), then:

```sh
node scripts/go.mjs fetch    # free: SQL against ClickHouse, sorts items into the three groups
node scripts/go.mjs roots    # free: finds each comment's thread title
node scripts/go.mjs judge    # costs money; resumable, results cached in scripts/go-cache/
node scripts/go.mjs write    # rewrites only the GO_COUNTS block
npm run snapshot
```

### Hardware

The hardware race asks where hardware is heading, so it ranks **growth, not volume**:

- **Times as many as a year ago.** For each term: mentions per million (rolling 6 months) divided by the same figure 12 months earlier, so the race starts in 2008. Old, widely used platforms such as x86, ARM, SSD and Apple Silicon are talked about a lot but rarely grow fast, so they are in the pool and new directions can still pass them. 20 per million is added to both sides, so a term going from 0 to 2 isn't "infinitely" bigger.
- **Log scale.** The data holds log2 of the ratio, so bars are on a log axis (×1, ×4, ×16) and a term at ×1 or below has no bar.
- **More terms than bars.** The pool has 34 terms; the page shows the 15 fastest-growing at each moment. A term that drops out slides down and fades, and can't be clicked or tabbed to until it comes back.
- **Rules, not searches.** Counted with SQL on ClickHouse, like the other long races, so matching can be case-sensitive (CUDA, TPU, HBM, DRAM) and can join spellings (Cerebras and "wafer-scale"; Taalas and "model on a chip"; "space data center" and "orbital datacenter"; LPU and "language processing unit", but not "least publishable unit").
- **Colours repeat.** 34 terms share 15 colours, and with growth the chart changes often, so some month always has a repeat. `npm run history` picks colours so that neighbouring ranks rarely match (weighted by 1 ÷ rank gap squared, a little more in recent months), and prints the pairs that still meet.
- **Slower playback.** Growth changes every month and terms enter and leave often, so this race plays at 0.6 s a month (about 2 min 13 s) instead of fitting into one minute like the other long races. A set can set its own pace with `msPerMonth`.
- **Growth also catches endings.** A product being cancelled gets talked about too: Optane leads briefly in late 2022, when Intel wound it down.

What it shows, in short: SSDs, CUDA, memristors and ARM lead in 2008–2010; ASICs in 2013 (Bitcoin mining); RISC-V from 2014, then NVMe, HBM, Optane and TPU in 2015–2017; chiplets and Cerebras in 2018–2020; Apple Silicon in 2020; AI accelerators and Groq in 2023–2024; space data centers and Cerebras in 2025. In August 2026 models etched into silicon (Taalas) take first place at about ×7, ahead of space data centers, HBM and DRAM.

## Refresh the snapshot

```sh
npm run snapshot
```

This runs the page's own counting code under Node (22 or newer) and rewrites only the block between `SNAPSHOT:BEGIN` and `SNAPSHOT:END` in `index.html`. A first run sends about 6,450 requests and takes about 15 minutes; the API allows 10,000 requests per hour per IP. Finished months are cached in `scripts/snapshot.cache.json` for 30 days. If any request fails, nothing is written; run it again to fill the gaps.

The long races have their own command. It sends a few SQL queries to [ClickHouse's public Hacker News dataset](https://clickhouse.com/docs/getting-started/playground), takes seconds, and rewrites only the `HISTORY` block. The page itself never contacts ClickHouse.

```sh
npm run history
```

Then run `npm run preview` to redraw `preview.png` from the new data.

## Tests

```sh
npm install
npm test
```

Needs Google Chrome 157 or later, or set `CHROME_PATH`. `CHROME_ARGS` adds browser flags, for example `--use-angle=gl-egl --ignore-gpu-blocklist` to test on a real GPU. Takes about four minutes. All API calls are mocked.

## Credits

Inspired by [hackernewstrends.com](https://hackernewstrends.com/). Data from the HN Search API by Algolia. Not affiliated with Hacker News or Y Combinator.

## License

[MIT](LICENSE)
