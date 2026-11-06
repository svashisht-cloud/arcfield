# Placeholders to fill in

Every unfinished value in `index.html` is either `{{TODO: …}}` text or a `#TODO-…` link.
In the browser, text placeholders are highlighted in amber and unfilled links get a dashed
outline with a "TODO link" badge, so you can see them all at a glance.

Before launch, this should print nothing:

```sh
grep -n 'TODO[:-]' index.html
```

## Done
- [x] **Email**: shubhv2@gmail.com (hero and final CTA)
- [x] **Fleet ops dashboard result**: 2× faster vehicle reprogramming (React-based reprogramming view)
- [x] **Event-triggered data capture result**: 90% smaller ROS bags (selective recording of high-value topics); 50% less time to access data (bag recording and cloud-upload improvements)
- [x] **Robotic-arm card**: problem, what I built, ~85% visualization performance result
- [x] **Field reliability tooling result**: config-mismatch detection, selective log subscriptions, faster remote debugging

## Identity
- [ ] **Name / studio name**: search `{{TODO: name`. Appears in the `<title>`, the header brand and the footer ©.
- [ ] **Booking link** (Cal.com / Calendly): search `#TODO-booking-link`. Appears twice: hero and final CTA.
- [ ] **LinkedIn URL**: search `#TODO-linkedin` (footer).
- [ ] **GitHub URL**: search `#TODO-github` (footer).
- [ ] **Location / hours line**: search `{{TODO: e.g. "Remote` (About section).

## Case studies
Re-read the **Problem** lines on the first three case-study cards (Claude drafted them) and make sure they match what really happened.

## Demo
- [ ] **Demo video / GIF** (60–90s, simulated fleet dashboard): search `{{TODO: demo video`. The HTML comment right above it has ready-to-paste `<video>`, YouTube `<iframe>` and `<img>` snippets.

## Link previews (needed once you have a domain)
- [ ] **Canonical URL**: search `<link rel="canonical"`.
- [ ] **og:url**: search `og:url`.
- [ ] **og:image / twitter:image**: a 1200×630 PNG or JPG (LinkedIn does not show SVG previews). Add it to the repo as `og.png` and use the absolute URL, e.g. `https://your-domain.com/og.png`.
