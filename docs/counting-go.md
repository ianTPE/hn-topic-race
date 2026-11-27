# Counting "Go" on Hacker News, using a Jev-like decision model

I built a bar chart race of what Hacker News talks about ([2D](https://iantpe.github.io/hn-topic-race/?cat=lang), [3D](https://iantpe.github.io/hn-topic-race/?cat=lang&view=3d)). For a long time, the programming languages chart left out Go.

The reason is obvious: "go" is one of the most common verbs in English. In October 2026 alone, HN had 357,093 posts and comments. 13,807 contained the word "go", while only 147 wrote "golang". In a random sample of 80 "go" items, only 4 were about the language (roughly 5%, though the sample is small).

## My guess was wrong

Before checking the data, I assumed people used to write "go" loosely, and as the language got popular, more people switched to "golang" to avoid confusion. That is what I do myself, so it seemed likely.

The numbers showed the opposite. Among posts with clear Go signals (`golang`, `goroutine`, `go.mod`, and similar), the share containing "golang" was 12–13% in 2010–2011, rose to 21–24% from 2012 through 2019, and dropped back to 12% in 2026 (Jan–Nov).

Two things probably explain it: the official site moved from `golang.org` to `go.dev`, and Go became well-known enough on HN that people stopped feeling the need to clarify it. Either way, counting "golang" alone would not work, and neither would a plain keyword search.

## Rules plus a decision model

I pulled every post and comment containing "go" from October 2021 to October 2026 (61 months, 886,281 items) from [ClickHouse's public HN dataset](https://clickhouse.com/docs/getting-started/playground) and split them into three buckets with regex rules:

- **Count directly (14,115):** clear language cues like `golang`, `goroutine`, `go.mod`, or "written in Go".
- **Drop directly (635,787):** lowercase verb phrases only, like `to go`, `let's go`, or `go ahead`.
- **Send to a model (236,278, or 27%):** everything else.

Instead of a regular LLM, I used a **decision model**. You give it a yes/no question and it returns a probability, with no generated text. You pay only for input tokens; output is free.

For each of the 236,278 remaining items, I sent about 300 characters around "go" along with the thread's root title (walking up `parent` IDs, up to 50 levels deep). Anything scoring 0.7 or higher counted as Go. That added 62,428 items, for 76,543 in total.

## Spot-checking before the full run saved me

Before the full run, I checked samples from the two rule buckets. It caught problems in both.

My first auto-count regex tried to match Go CLI commands, so it also matched phrases like "go get a job" and "go work at". Out of 82 items in that sample, 26 were normal English (a 32% error rate).

The drop rules had the opposite problem. They threw out phrases like "Rust or Go" and "Swift or Go", missing about 1% of real Go mentions. Because the dropped bucket is huge, even a 1% leak adds up.

After fixing the rules, the auto-count sample was 54 for 54, and the dropped bucket missed only 2 out of 400 (0.5%). Catching that before the full run saved both money and a redo.

## Accuracy

To check the model, I had two other models (Kimi and MiniMax) label a 500-item sample from the judged bucket and kept the 494 items where both agreed.

At threshold 0.7, TypeSafe's Jev had 100% precision (127 of 127) and 97.7% recall (127 of 130). Combining model misses with the small leak from the dropped bucket, Go is undercounted by roughly 6% overall.

One limitation: the labels came from models, not humans. Looking at Jev's three misses, two of them were actually mislabeled by both Kimi and MiniMax: "Go look at…" is a verb, and "the book is officially a go" is an English idiom.

## Comparing five decision models

I ran four other decision models on the same 494-item sample with the same snippets and threshold:

| Model | Precision | Recall | Tokens per item | Price per million input tokens | 236,278 items | Long race (about 570,000) |
|---|---|---|---|---|---|---|
| TypeSafe Jev (used) | 100% | 97.7% | 450 | $0.042 | $4.50 (paid) | about $11 |
| Perplexity `pplx-decider-v1.2` | 100% | 97.7% | 234 | $0.02 | about $1.10 | about $2.70 |
| Alibaba Model Studio `decision-model` | 99.2% | 99.2% | 223 | ¥0.30 | about $2.20 | about $5.30 |
| Volcengine Ark `doubao-seed-2-1-lite-260915` | 100% | 98.5% | 450 | ¥0.80 | about $12 | about $28 |
| Alibaba Model Studio `decision-model-preview` | 51.6% | 99.2% | 170 | not listed | not usable | not usable |

Costs other than Jev's $4.50 are estimates from list prices and measured tokens (at about ¥7.2 per dollar). Perplexity's price is its OpenRouter list price.

Accuracy was almost identical across the four working models, while price varied by more than 10x. Perplexity's `pplx-decider-v1.2` was the cheapest at roughly $1.10 for the 60-month run, compared to about $12 on Volcengine Ark. Alibaba's preview model flagged 121 verbs as Go, so it is not usable.

## Results and cost

The full Jev run processed 107 million input tokens, cost about **$4.50**, and took about 80 minutes.

With Go added, it ranks **#4** among programming languages in the 3-month rolling window ending October 2026 (August–October). Its share is about 40% of Rust's, right alongside Java. Running the long race back to 2009 is doable too (around $3 with Perplexity); I just have not done it yet.

## Tools

I wrote the scripts and ran the analysis with Claude Code, used Jev for the main classification run, and used Kimi and MiniMax for validation labels. My native language is Chinese, so I also used AI to help translate my notes into English. The pipeline is in [`scripts/go.mjs`](../scripts/go.mjs), with setup and notes in the [README](../README.md).
