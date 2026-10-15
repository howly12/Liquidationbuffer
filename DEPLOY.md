# LiquidationBuffer — Deployment Guide (fully static rebuild)

## 0. What changed
This version has **no backend at all** — no Cloudflare Pages Functions,
no `/functions` folder, no API keys, no KYC, nothing that can 502 or
get rate-limited. It's pure HTML/CSS/JS. The calculator runs entirely
in the visitor's browser: they type in their own exchange's numbers
(maintenance margin rate, fee, funding rate), and the math runs
locally. Nothing is sent to any server.

This means deployment is now the simple path that failed earlier only
because the old version needed Functions support.

---

## 1. Domain
`liquidationbuffer.com` is already on Cloudflare (bought directly
through Cloudflare, full DNS control, no external registrar involved).

---

## 2. Deploy via direct upload (simplest path)
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages**
   tab → **Upload assets** (sometimes labeled "Upload static files").
2. Drag in the *contents* of this folder — `index.html`, `robots.txt`,
   `sitemap.xml`, `legal.html`, `privacy.html`, `terms.html`, the `assets/`
   folder, and the `guides/` folder — not the outer folder itself.
3. Give the project a name (e.g. `liquidationbuffer`) and deploy.
4. Once deployed, go to the project → **Custom domains** → **Set up a
   custom domain** → enter `liquidationbuffer.com` and
   `www.liquidationbuffer.com`. Since the domain is already a
   Cloudflare zone, this activates in minutes, no external DNS changes
   needed.

No build command, no output directory setting, no GitHub connection
required for this version — though Git integration still works fine
too, if preferred for version history (Settings would just show empty
build command / `/` output directory, same as before).

---

## 3. Verify
Open `https://www.liquidationbuffer.com/` in an incognito window.
The calculator should render immediately with default sample values
already filled in and a result showing — there's no loading state to
wait for, since nothing is fetched.

---

## 4. Search Console + analytics
1. Add the domain in **Google Search Console**, verify ownership
   (one-click DNS verification since the domain is on Cloudflare
   nameservers).
2. Submit `https://www.liquidationbuffer.com/sitemap.xml`.
3. Cloudflare Web Analytics: dashboard → domain → **Analytics & Logs**
   → **Web Analytics** → enable. Cookieless, automatic setup.

---

## 5. Adding a new guide article (the established template)
**URLs have no `.html`.** Cloudflare serves `/guides/foo.html` as `/guides/foo`
and 307-redirects the `.html` form to it. So in every place a URL appears —
`<link rel="canonical">`, `og:url`, JSON-LD, breadcrumbs, `sitemap.xml`, and every
internal `href` — write `https://www.liquidationbuffer.com/guides/foo` and
`/guides/foo`, never `…foo.html` (the *file* is still `foo.html`). Using the
`.html` form makes each canonical point at a redirect, which Google reports as
"Alternative page with proper canonical tag" / "Crawled – currently not indexed".
`legal`, `privacy` and `terms` are `noindex`, so they stay out of the sitemap.
The operator is shown only as "Copperleaf LLC, a Wyoming limited liability
company" plus the contact email (no address, name or registration number); keep
it that way. The site-wide footer reads `© 2026 Copperleaf LLC · Legal · Privacy ·
Terms` and must be copied to every new page. `_redirects` keeps 301s from the two
previous legal URLs.

Every article in `/guides/` follows the same structure — use the most
recent one as your template for the next:

1. Duplicate an existing `/guides/*.html` file.
2. Keep `<title>` to 60 characters at most (add ` | LiquidationBuffer` only if it
   still fits) and the meta description to 155; Google cuts both off beyond that.
   Update: `<title>`, meta description, canonical URL, all three
   `og:`/`twitter:` tags, the `Article` JSON-LD block (headline,
   description, dates), the `BreadcrumbList` JSON-LD block, and the
   `FAQPage` JSON-LD block (write 2–3 real questions the article
   answers).
3. Keep the structure: kicker → H1 → lede → "Last updated" date → TOC
   → H2 sections with anchor IDs matching the TOC links → FAQ section
   → CTA back to the calculator → related-articles block.
4. Aim for 700–1000+ words of genuinely useful content, not padding —
   each H2 should teach something a shorter version couldn't.
5. Add the new article to `/guides/index.html` under the right
   category (or create a new category block if it doesn't fit an
   existing one).
6. Add the new article's URL to `sitemap.xml`.
7. If it's evergreen and important, also link it from the homepage's
   guide teaser list in `index.html`.

At article 15–20, consider whether any category needs splitting into
two, or whether the homepage teaser list needs to feature different
articles than the original four.

---

## 5a. Page-level conventions added October 2026
- **Social image:** every indexable page carries `og:image`
  (`/assets/og-image.png`, 1200�630), `og:image:width/height/alt`, `twitter:image` and
  `twitter:card` = `summary_large_image`. Copy those lines from an existing guide
  into new indexable pages. `legal`, `privacy`, `terms`, `404` and the embed do not need them.
- **Homepage schema:** `index.html` carries `Organization` + `WebSite` JSON-LD (no `sameAs`
  yet; add the X profile URL there once the account exists) and an FAQPage block that
  must match the four visible FAQ items.
- **FAQ schema:** the FAQPage JSON-LD of a page is generated from its visible `faq-item`
  blocks. If you edit an FAQ answer, update the JSON-LD with the same text.
- **Leverage comparison:** the calculator pages and the embed contain a
  `<details class="compare">` block with `#compareTable`, filled by `renderCompare()` in
  `assets/calculator.js` (levels in `COMPARE_LEVERAGES`). It uses the same MMR for every
  level, which the note under the table says. Keep the block on every page that loads
  `calculator.js`; the script skips it silently if the table is missing.
- **Mobile:** grids that hold the calculator use `minmax(0,1fr)` so inputs cannot widen
  the page; test new layouts at 375 px for horizontal scroll.
- **Keyword map:** see the "LiquidationBuffer SEO" memory note for the target keywords of
  each guide. Exchange pages beyond the five existing ones were checked in October 2026
  and have about 10 searches/month each, so they are not worth building.

---

## 5b. Git integration (Cloudflare Workers)
This repo is connected to a Cloudflare Workers service (`billowing-lab-7d25`)
via GitHub integration on the `main` branch. Every push to `main` triggers
an automatic `npx wrangler deploy` build using the `wrangler.toml` static
assets config — no manual dashboard upload needed anymore.

## 6. Ongoing maintenance
- Nothing to keep alive — there's no live data source to break.
- `security.txt` (root and `/.well-known/`) has an `Expires` date — currently
  2027-09-25. Renew it before then (bump the date another year) or scanners
  treat the file as invalid/absent again.
- If you want to reintroduce live exchange data later (auto-filling
  the form instead of manual entry), that would mean bringing back a
  `/functions` backend — treat that as a deliberate, separate project
  phase, not a quick add-on, given how much debugging that path took
  last time.
