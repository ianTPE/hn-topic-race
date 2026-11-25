# HN Topic Bar Chart Race

A bar chart race of what Hacker News talks about: mentions per million posts and comments, month by month, over five years.

**[Open the live page](https://iantpe.github.io/hn-topic-race/)**

[![Bar chart race frame ranking LLM names by Hacker News mentions](preview.png)](https://iantpe.github.io/hn-topic-race/)

One HTML file. No backend, no build step, no external scripts or fonts. Opening the page makes no network requests: the eight preset categories play from a snapshot embedded in the file.

- **Compare your own terms**: up to 15, counted live through the [HN Search API](https://hn.algolia.com/api) and cached in your browser.
- **Check the numbers**: "Spot-check hits" lists the HN items behind a count, with links.
- **Export a video**: 1920×1080 on desktop, portrait on phones.
- English and Traditional Chinese; follows your light/dark setting.

## Run it

Open `index.html` in a browser. `preview.png` is only the image shown when the link is shared; the page does not load it.

## How mentions are counted

- Every value is a share: items mentioning the term ÷ all posts and comments, over a rolling window. Growth of HN itself cancels out.
- For large result sets the API returns an estimate (`exhaustiveNbHits=false`). An empty query over one month reported 136,281 items; the real count was 358,184. Totals therefore come from a query with `facets=_tags`, and terms are sent as quoted phrases.
- Only titles and text are matched, not usernames or URLs.
- Terms such as `chatgpt / gpt` are document unions, so an item that mentions both counts once.
- Failed months are dropped from both numerator and denominator, so they cannot create a fake spike.

The page's Methodology section has the details, including which ambiguous terms were left out of the presets.

## Refresh the snapshot

```sh
npm run snapshot
```

This runs the page's own counting code under Node (22 or newer) and rewrites only the block between `SNAPSHOT:BEGIN` and `SNAPSHOT:END` in `index.html`. A first run sends about 6,450 requests and takes about 15 minutes; the API allows 10,000 requests per hour per IP. Finished months are cached in `scripts/snapshot.cache.json` for 30 days. If any request fails, nothing is written; run it again to fill the gaps.

Then run `npm run preview` to redraw `preview.png` from the new data.

## Tests

```sh
npm install
npm test
```

Needs Google Chrome, or set `CHROME_PATH`. Takes about three minutes. All API calls are mocked.

## Credits

Inspired by [hackernewstrends.com](https://hackernewstrends.com/). Data from the HN Search API by Algolia. Not affiliated with Hacker News or Y Combinator.

## License

[MIT](LICENSE)
