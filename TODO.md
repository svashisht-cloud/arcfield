# Placeholders to fill in

Every unfinished value in `index.html` contains the string `TODO`. In the browser,
text placeholders are highlighted in amber and unfilled links get a dashed outline
with a "TODO link" badge, so you can see them all at a glance.

Before launch, this should print nothing:

```sh
grep -n TODO index.html
```

## Identity
- [ ] **Name / studio name**: search `{{TODO: name`. Appears in the `<title>`, the header brand and the footer ©.
- [ ] **Email**: search `TODO-email` (the `mailto:` href) and `{{TODO: email}}` (the visible text). Appears twice: hero and final CTA.
- [ ] **Booking link** (Cal.com / Calendly): search `#TODO-booking-link`. Appears twice: hero and final CTA.
- [ ] **LinkedIn URL**: search `#TODO-linkedin` (footer).
- [ ] **GitHub URL**: search `#TODO-github` (footer).
- [ ] **Location / hours line**: search `{{TODO: e.g. "Remote` (About section).

## Case study results (use real numbers only)
- [ ] **Fleet ops dashboard result**: search `{{TODO: real number` (e.g. yards or trucks it ran on).
- [ ] **Event-triggered data capture result**: first `{{TODO: result}}`.
- [ ] **Field reliability tooling result**: second `{{TODO: result}}`.

Also re-read the three **Problem** lines on the case-study cards and make sure they match what really happened.

## Demo
- [ ] **Demo video / GIF** (60–90s, simulated fleet dashboard): search `{{TODO: demo video`. The HTML comment right above it has ready-to-paste `<video>`, YouTube `<iframe>` and `<img>` snippets.

## Link previews (needed once you have a domain)
- [ ] **Canonical URL**: search `<link rel="canonical"`.
- [ ] **og:url**: search `og:url`.
- [ ] **og:image / twitter:image**: a 1200×630 PNG or JPG (LinkedIn does not show SVG previews). Add it to the repo as `og.png` and use the absolute URL, e.g. `https://your-domain.com/og.png`.
