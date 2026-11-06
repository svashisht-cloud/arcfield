# Placeholders to fill in

Every unfinished value in `index.html` is either `{{TODO: …}}` text or a `#TODO-…` link.
In the browser, text placeholders are highlighted in amber and unfilled links get a dashed
outline with a "TODO link" badge, so you can see them all at a glance.

Before launch, this should print nothing:

```sh
grep -n 'TODO[:-]' index.html
```

## Done
- [x] **Name**: Arcfield (title, header, footer, og:site_name)
- [x] **Email**: shubhv2@gmail.com (hero and final CTA)
- [x] **Booking link**: https://calendly.com/shubhv2/30min (both buttons; copy says 30-min call)
- [x] **LinkedIn**: https://www.linkedin.com/in/shubh-vashisht/
- [x] **GitHub**: https://github.com/svashisht-cloud (footer)
- [x] **Location line**: removed from About (by choice)
- [x] **Demo**: live simulation of an AV (yard truck) + trailer with a sensor cone, plus telemetry and log panels. Optional later: swap for a real 60–90s screen recording (snippets in the HTML comment above the SVG).
- [x] **Fleet ops dashboard result**: 2× faster vehicle reprogramming (React-based reprogramming view)
- [x] **Event-triggered data capture result**: 90% smaller ROS bags (selective recording of high-value topics); 50% less time to access data (bag recording and cloud-upload improvements)
- [x] **Robotic-arm card**: problem, what I built, ~85% visualization performance result
- [x] **Field reliability tooling result**: config-mismatch detection, selective log subscriptions, faster remote debugging

## Case studies
Re-read the **Problem** lines on the first three case-study cards (Claude drafted them) and make sure they match what really happened.

## Link previews (needed once you have a domain)
- [ ] **Canonical URL**: search `<link rel="canonical"`.
- [ ] **og:url**: search `og:url`.
- [ ] **og:image / twitter:image**: a 1200×630 PNG or JPG (LinkedIn does not show SVG previews). Match the site: near-black background, VT323 headline in phosphor green. Add it to the repo as `og.png` and use the absolute URL, e.g. `https://your-domain.com/og.png`.
