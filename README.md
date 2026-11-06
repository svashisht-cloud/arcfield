# Robotics fleet software: consulting site

A one-page static site in a single `index.html` file, with CSS and one small script inline. No framework, no build step, no dependencies. The only external requests are two Google Fonts (VT323 and IBM Plex Mono).

## Edit

1. Open `index.html` in any editor.
2. Fill in every placeholder listed in [`TODO.md`](TODO.md). Each one is `{{TODO: …}}` text or a `#TODO-…` link.
3. Before publishing, run `grep -n 'TODO[:-]' index.html`. It should print nothing. (Plain `grep TODO` also matches the CSS that highlights placeholders.)

Unfilled placeholders are highlighted in amber on the rendered page, so they're hard to miss.

Where things are:
- **Theme**: dark terminal only. Colors are CSS custom properties in `:root` at the top of `<style>` (`--accent` is the phosphor green, `--amber` is used for warnings). The scanline/vignette overlay is `body::after`.
- **Fonts**: VT323 (`--display`) is for large display text only: headings, big numbers and the brand. IBM Plex Mono (`--mono`) is for everything else. They're loaded from Google Fonts in `<head>`.
- **Sections**: each has an `id` (`top`, `work`, `demo`, `services`, `process`, `about`, `contact`) and plain HTML structure. Copy a `.card` to add a case study.
- **Demo** (`#demo`): a small simulation in the `<script>` at the bottom of the page drives the yard SVG, the telemetry panel and the logs from a single state.
  - The route is the `#route` path in the SVG.
  - Speeds are set in `targetSpeed()`.
  - Log messages are in `startMission()`, `events()` and `finishMission()`.
  - Parked and hitched trailers both use the `#trailer` drawing, so editing it changes all of them.
  - Without JS, or with reduced motion, the initial `transform`s and the snapshot values in the HTML show as a still frame.
  - To use a real recording instead, replace the `<svg>` with one of the snippets in the HTML comment above `.sim`.

## Preview locally

```sh
open index.html                 # macOS: opens in your default browser
# or serve it (closer to production):
python3 -m http.server 8000     # then visit http://localhost:8000
```

To check mobile, use your browser's device toolbar (Chrome DevTools → Toggle device toolbar → 375px wide).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to <https://vercel.com/new> and **Import** the repository.
3. Settings: **Framework Preset: Other**. Leave the Build Command and Install Command empty, and keep the Output Directory as the default (the repo root).
4. Click **Deploy**. You'll get a `*.vercel.app` URL.

Every push to `main` redeploys automatically. Other branches get preview URLs.

## Add a custom domain

1. In Vercel, open the project → **Settings → Domains** → add `your-domain.com` (and `www.your-domain.com`).
2. At your registrar, add the DNS records Vercel shows you. Usually:
   - Apex (`your-domain.com`): **A** record → `76.76.21.21`
   - `www`: **CNAME** → `cname.vercel-dns.com`

   Or point the domain's nameservers at Vercel. Always use the exact values Vercel displays.
3. HTTPS is issued automatically once DNS resolves (minutes to a few hours).
4. Update `<link rel="canonical">`, `og:url`, `og:image` and `twitter:image` in `index.html` to the real domain and push.

## Link previews

LinkedIn, Slack and email clients read the Open Graph tags in `<head>`. For a good preview:
- Add a 1200×630 `og.png` to the repo root (a plain card with your name plus "Fleet software for robotics teams" works fine).
- Point `og:image` and `twitter:image` at its absolute URL.
- After deploying, check the result with LinkedIn's [Post Inspector](https://www.linkedin.com/post-inspector/). It also refreshes LinkedIn's cache.
