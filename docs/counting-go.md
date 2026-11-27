# Counting "Go" on Hacker News, using a Jev-like decision model

I made a bar chart race of Hacker News topics ([2D](https://iantpe.github.io/hn-topic-race/?cat=lang), [3D](https://iantpe.github.io/hn-topic-race/?cat=lang&view=3d)). The programming languages chart was missing Go, and that bothered me. A language chart without Go just looked incomplete (and after adding it, Go turned out to be #4). I am a bit obsessive about things like this, so I wanted to find a way to include it.

Running a regular LLM over years of HN comments did not make sense. It would be slow and wasteful. I knew a Jev-like decision model might work here, because it only returns a yes/no probability instead of generating text, and you only pay for input tokens. So I talked it through with Claude Code. Claude wrote the scripts and bounced the design and validation off Gemini, Kimi, and MiniMax along the way.

## Why "go" is hard to count

"go" is mostly a verb. In October 2026, HN had 357,093 posts and comments. 13,807 contained the word "go", and only 147 wrote "golang". In a random sample of 80 "go" items, only 4 were about the language (about 5%, though the sample is small).

At first I thought people used to write "go" loosely and switched to "golang" later to avoid confusion, since that is what I do myself. When we checked the data, that was not true. Among posts with clear Go clues (`golang`, `goroutine`, `go.mod`, and similar), the share containing "golang" was 12–13% in 2010–2011, went up to 21–24% in 2012–2019, and fell back to 12% in 2026 (Jan–Nov). My guess is the move from `golang.org` to `go.dev` mattered, and Go is well-known enough on HN now that people just write "Go". Either way, counting "golang" alone was not an option.

## Filtering first, then using a decision model

We pulled every post and comment containing "go" from October 2021 to October 2026 (61 months, 886,281 items) from [ClickHouse's public HN dataset](https://clickhouse.com/docs/getting-started/playground).

Before calling any model, regex rules split the data into three groups:
- 14,115 items with clear language clues (`golang`, `goroutine`, `go.mod`, "written in Go", etc.) were counted directly.
- 635,787 items where "go" only appeared in lowercase verb phrases (`to go`, `let's go`, `go ahead`, etc.) were dropped.
- 236,278 items (27%) were sent to the decision model.

Before running the full batch, we spot-checked samples from the two rule groups. That caught some ugly bugs in the first version. The auto-count regex tried to catch Go CLI commands, so it matched "go get a job" and "go work at" (26 out of 82 were wrong, 32%). On the other side, the drop rules threw out "Rust or Go" and "Swift or Go", losing about 1% of real Go mentions. After tightening the rules, the auto-count sample was 54/54, and the dropped sample missed 2 out of 400 (0.5%).

For the 236,278 remaining items, we sent about 300 characters around "go" plus the root thread title (walking up `parent` IDs, up to 50 levels deep). At a probability threshold of 0.7, TypeSafe's Jev marked 62,428 as Go, giving 76,543 total.

## Accuracy and comparing models

To check accuracy, Kimi and MiniMax each labeled a 500-item sample from the judged group, and we kept the 494 items where they agreed. At threshold 0.7, Jev got 127/127 precision (100%) and 127/130 recall (97.7%). Including the small leak from the dropped group, Go is undercounted by about 6% overall.

One caveat is that the labels came from models, not humans. Looking at Jev's three misses, two were actually mislabeled by both Kimi and MiniMax: "Go look at…" is a verb, and "the book is officially a go" is an idiom.

We also tested four other decision models on the same 494-item sample with the same snippets and threshold:

| Model | Precision | Recall | Tokens per item | Price per million input tokens | 236,278 items | Long race (about 570,000) |
|---|---|---|---|---|---|---|
| TypeSafe Jev (used) | 100% | 97.7% | 450 | $0.042 | $4.50 (paid) | about $11 |
| Perplexity `pplx-decider-v1.2` | 100% | 97.7% | 234 | $0.02 | about $1.10 | about $2.70 |
| Alibaba Model Studio `decision-model` | 99.2% | 99.2% | 223 | ¥0.30 | about $2.20 | about $5.30 |
| Volcengine Ark `doubao-seed-2-1-lite-260915` | 100% | 98.5% | 450 | ¥0.80 | about $12 | about $28 |
| Alibaba Model Studio `decision-model-preview` | 51.6% | 99.2% | 170 | not listed | not usable | not usable |

Costs other than Jev's $4.50 are estimates from list prices and measured tokens (at about ¥7.2 per dollar). Perplexity's price is its OpenRouter list price.

The four working models had very similar accuracy, while the cost differed by more than 10x (Perplexity is around $1.10 for the 60-month run, Volcengine Ark around $12). Alibaba's preview model marked 121 verbs as Go, so it was not usable.

## Result

The Jev run used 107 million input tokens, cost about $4.50, and took around 80 minutes.

In the 3-month rolling window ending October 2026 (August–October), Go lands at #4 among programming languages, at about 40% of Rust's share and right next to Java. That confirms it really did not belong off the chart. The long race back to 2009 is doable too (around $3 with Perplexity); I just have not run it yet.

The script is in [`scripts/go.mjs`](../scripts/go.mjs), with more details in the [README](../README.md). My native language is Chinese, so I used AI to help translate my notes into English.
