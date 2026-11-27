# Counting "Go" on Hacker News, using a Jev-like decision model

I made a bar chart race of Hacker News topics ([2D](https://iantpe.github.io/hn-topic-race/?cat=lang), [3D](https://iantpe.github.io/hn-topic-race/?cat=lang&view=3d)). The programming languages chart was missing Go, and that bothered me. A language chart without Go just looked incomplete (and after adding it, Go turned out to be #4). I am a bit obsessive about things like this, so I wanted to find a way to include it.

Running a regular LLM over years of HN comments did not make sense. It would be slow and wasteful. I knew a Jev-like decision model might work here, because it only returns a yes/no probability instead of generating text, and you only pay for input tokens. So I talked it through with Claude Code. Claude wrote the scripts and bounced the design and validation off Gemini, Kimi, and MiniMax along the way.

## Why "go" is hard to count

Searching for "go" on Hacker News is like trying to count mentions of the band "The Who" by searching for "who". Almost everything you get back is ordinary English. In October 2026, nearly 14,000 posts and comments contained the word "go", while fewer than 150 wrote "golang". In a quick sample of 80 "go" posts, only 4 were about the programming language, roughly 1 in 20.

At first I assumed people wrote "go" loosely in the early days and gradually switched to "golang" to avoid confusion, because that is what I do myself. When we checked the data, that was not true. Among posts that clearly talk about Go (mentioning `golang`, `goroutine`, `go.mod`, and similar), "golang" only showed up in about 1 in 8 posts at the start, rose to roughly a quarter during the 2010s, and by 2026 (Jan–Nov) fell back to 1 in 8. Moving the official site from `golang.org` to `go.dev` probably played a part, and Go is familiar enough on HN now that people just call it "Go". So counting "golang" alone would miss most of the picture.

## Filtering first, then using a decision model

We pulled five years of HN posts and comments containing "go" (October 2021 to October 2026, nearly 900,000 items) from [ClickHouse's public HN dataset](https://clickhouse.com/docs/getting-started/playground).

Before paying a model to read all of them, we used regex as a coarse sieve. Obvious Go posts (`golang`, `goroutine`, `go.mod`, "written in Go") went straight into the yes pile. Obvious lowercase verb phrases (`to go`, `let's go`, `go ahead`) went straight into the trash, which cleared out almost three-quarters of the data. Only the messy quarter in the middle (about 236,000 items) went to the decision model.

Checking a small sample before the full run caught some funny bugs in our first rules. The rule for Go CLI commands thought "go get a job" and "go work at" were about Go, so nearly a third of that sample (26 of 82) was just normal English. On the other side, the verb filter accidentally threw out "Rust or Go" and "Swift or Go". After tightening both rules, the auto-count sample was clean (54 of 54), and the verb filter only missed 2 out of 400.

For the remaining 236,000 items, we did not send full comments. We clipped a short window around "go" (about 300 characters) and attached the thread's root title by walking up `parent` IDs (sometimes 50 replies deep). A comment saying "go" under a thread about Go compilers means something very different from one under a thread about travel. Anything scoring 0.7 or higher counted as Go, bringing the five-year total to about 76,500 mentions.

## Accuracy and comparing models

To see how well TypeSafe's Jev actually did, we had Kimi and MiniMax label 500 items from the ambiguous pile and scored the 494 where both agreed. At threshold 0.7, Jev had no false positives (127 of 127) and caught 127 of 130 real Go mentions. Adding in the tiny leak from the verb filter, Go is probably undercounted by around 6% overall.

One caveat: those test labels came from models, not humans. Looking at Jev's three misses, two were actually mislabeled by both Kimi and MiniMax: "Go look at…" is a verb, and "the book is officially a go" is an idiom.

We also ran four other decision models on the same 494-item sample with the same snippets and threshold:

| Model | Precision | Recall | Tokens per item | Price per million input tokens | 236,278 items | Long race (about 570,000) |
|---|---|---|---|---|---|---|
| TypeSafe Jev (used) | 100% | 97.7% | 450 | $0.042 | $4.50 (paid) | about $11 |
| Perplexity `pplx-decider-v1.2` | 100% | 97.7% | 234 | $0.02 | about $1.10 | about $2.70 |
| Alibaba Model Studio `decision-model` | 99.2% | 99.2% | 223 | ¥0.30 | about $2.20 | about $5.30 |
| Volcengine Ark `doubao-seed-2-1-lite-260915` | 100% | 98.5% | 450 | ¥0.80 | about $12 | about $28 |
| Alibaba Model Studio `decision-model-preview` | 51.6% | 99.2% | 170 | not listed | not usable | not usable |

Costs other than Jev's $4.50 are estimates from list prices and measured tokens (at about ¥7.2 per dollar). Perplexity's price is its OpenRouter list price.

All four working models had almost the same accuracy, while the cost varied by more than 10x (roughly $1.10 with Perplexity vs. around $12 with Volcengine Ark). Alibaba's preview model called 121 verbs "Go", so it was not usable.

## Result

The full Jev run processed about 107 million input tokens, cost roughly $4.50, and finished in about 80 minutes.

In the 3-month rolling window ending October 2026 (August–October), Go lands at #4 among programming languages, at about 40% of Rust's share and right next to Java. That confirmed it really did not belong off the chart. Doing the long race back to 2009 is doable too (around $3 with Perplexity); I just have not run it yet.

The script is in [`scripts/go.mjs`](../scripts/go.mjs), with the full breakdown in the [README](../README.md). My native language is Chinese, so I used AI to help translate my notes into English.
