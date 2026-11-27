# M4 design directions: Findlay Masonic Bodies

The goal is a public site where a lodge member, often an older one, can find when their body meets and what is on at the Temple this week. A prospective member or a family should also be able to see who the bodies are. This file backs the mockup in `index.html` and the screenshots beside it. Each direction shows the home page and the Findlay Lodge No. 227 page at 1280px and 390px, in light and dark mode.

## What is real and what is sample

- Body names and numbers follow spec FR-9.2 (Lodge 227, Chapter 58, Council 50, Commandery 49, Eastern Star 23, Temple Board). The exact styling of each name is a guess.
- The schedule "2nd Tuesday of each month, 7:30 PM" comes from the spec. The other five schedules, every event, every news item and every officer name except Drew DeVore (Worshipful Master on the 2023 site) are sample content.
- The emblems are simplified SVG stand-ins drawn for this mockup. The real files (`image-1` to `image-5.png` on the 2023 Flywheel site) are not in `reference/`, and the network here cannot reach that site.
- The building is an SVG placeholder for `2023/03/image.jpeg`, labelled as a placeholder.
- Dates assume today is Monday, November 23, 2026. The Commandery's 4th Monday falls on that day, so it shows as "Tonight".

## Checks run

- **Contrast.** `design-src/report.mjs` computes WCAG ratios for every text and brand pair from the same palette file that generates the CSS. There are 0 failures across 3 directions and 2 modes. The tables are below.
- **axe-core 4.10.2.** The WCAG 2 A and AA rules ran on every direction at 1280px and 390px, in light and dark mode. All 12 runs were clean.
- **Layout.** No page scrolls sideways at 390px. Measured as `scrollWidth - clientWidth = 0` on every mockup page.
- **Fonts.** In the screenshots, Inter, JetBrains Mono, Source Serif 4 and Atkinson Hyperlegible Next all loaded from Google Fonts, confirmed with `document.fonts.check`.

## Shared across all three

- All three keep the template's frame: hairline rails, `.band` rules with crosshairs, and `.frame` content width.
- All three raise the type scale for older readers. `--font-size-sm` goes to 1rem (nav, buttons, chips), `--font-size-xs` goes to 0.875rem or more, and labels get larger. Body text is 17px in A and 18px in B and C. Buttons are at least 44px tall.
- None of them needs `tokens.css` edited. Every colour and size change is a `theme.css` override.
- The FR-1.4 empty state ("Contact the secretary for meeting times") appears on each body page as an annotated alternate state (the dashed magenta box). It also appears inline for the Temple Board in each home page's list of bodies.
- The month grid and agenda for FR-4.3 and FR-4.4 cost the same in every direction. The directions differ only in how each entry shows which body it belongs to.

---

## A. Framed Lodge

The template as it ships, recoloured. Royal blue from the 2023 site goes in `--color-brand`. The body page reuses the post page's three-column reading layout: meta rail with the meeting schedule, a 680px main column, and an officers rail.

**theme.css**

```css
:root {
	--color-brand: light-dark(#1200b8, #aaa5ff);
	--color-brand-hover: light-dark(#0d0090, #c9c6ff);
	--color-on-brand: light-dark(#ffffff, #0a0a0a);
	--font-size-label: 0.8125rem;
	--font-size-xs: 0.875rem;
	--font-size-sm: 1rem;
	--font-size-base: 1.0625rem;
}
```

**Beyond tokens.** Nothing. There are no `astro.config.mjs` font changes. New page layouts (body cards, agenda list, body page) live in the new route files.

**Body colour coding.** None. Each calendar entry carries a text label ("Lodge 227") in a neutral chip or mono caption. The single-accent rule holds unchanged. This does not meet FR-4.4 as written ("labelled and color-coded by body"). Choosing A means amending FR-4.4 to "labelled by body".

**Contrast (light / dark).** Text on canvas 17.18 / 16.91. Muted on canvas 5.11 / 6.12. Muted on fill 4.76 / 5.10. Brand on canvas 11.71 / 8.99. White on brand 12.22. Near-black on dark brand 8.99.

**Cost.** Lowest. Seven token lines plus the page work every direction needs.

**Risks.**
- It still reads as a technical blog. The mono uppercase labels are the least legible text on the page for older eyes, even after enlarging.
- The emblems do all the work of saying "Masonic". The page has no warmth of its own.
- FR-4.4 would need a spec change.

---

## B. Temple

Warm and traditional. Source Serif 4 at 18px for everything, an ivory canvas, navy brand, and gold used as ornament: the rail crosshairs, card top rules, a star divider and a ring around the emblem. The masthead is centred with the lodge emblem. The building photograph appears once, under the home intro, with a caption, no overlay and no text on it. Stated meetings for all six bodies appear as one table, like a lodge notice board. The body page centres on the emblem, shows the schedule on a "plaque" card, and lists officers with leader lines.

**theme.css**

```css
:root {
	--color-bg: light-dark(#f8f5ee, #0d1322);
	--color-surface: light-dark(#fffdf8, #141b2e);
	--color-fill: light-dark(#f0ebdf, #1b2338);
	--color-fill-strong: light-dark(#e6dfcf, #243050);
	--color-text: light-dark(#1f1b16, #ece7dc);
	--color-text-secondary: light-dark(#4a443b, #bfb8a9);
	--color-muted: light-dark(#665d4e, #a39c8c);
	--color-border: light-dark(#e4dccb, #262f47);
	--color-border-subtle: light-dark(#eee8da, #1c2438);
	--color-border-strong: light-dark(#b8963e, #8c7338); /* gold crosshairs */
	--color-brand: light-dark(#1b2a5c, #e0bd66);
	--color-brand-hover: light-dark(#2a3d7a, #ecd08c);
	--color-on-brand: light-dark(#ffffff, #0d1322);
	--temple-gold: light-dark(#a8862f, #e0bd66); /* ornament only, never text */
	--font-heading: "Source Serif 4", Georgia, serif;
	--font-size-base: 1.125rem;
	--font-size-label: 0.875rem;
	--font-size-xs: 0.9375rem;
	--font-size-sm: 1rem;
	--font-weight-display: 500;
	--tracking-tight: -0.015em;
	--tracking-snug: -0.01em;
	--radius-xl: 10px;
	--radius-lg: 6px;
	--card-padding: 4px;
}
.eyebrow { font-family: var(--font-body); letter-spacing: 0.12em; font-weight: 600; }
```

**Beyond tokens.**
- `astro.config.mjs` changes the `--font-body` entry from Inter to Source Serif 4. The intake marks `astro.config.*` as human-confirm.
- One class rule in `theme.css` re-faces `.eyebrow`, because the mono face is hard-wired in `Base.astro`.
- The centred masthead **requires editing `Base.astro`**, since the header markup and styles live there. The alternative is the template header with a serif face, which loses most of B's character.
- `--temple-gold` is a new custom property. It bends the single-accent rule, because gold is a second colour, but only as non-interactive ornament.

**Body colour coding.** The UI adds no per-body colours. Each calendar entry shows the body's emblem in miniature, and the emblem already carries the body's traditional colour (red triple tau, purple Cryptic triangle, OES star). This partly meets FR-4.4. The colour comes from an image at 22px, and the text label carries the meaning.

**Contrast (light / dark).** Text on canvas 15.72 / 15.03. Muted on canvas 5.95 / 6.79. Muted on fill 5.45 / 5.72. Brand on canvas 12.59 / 10.27. White on navy 13.70. Navy-black on gold 10.27. Gold on ivory is ornament only (about 3:1) and never carries text.

**Cost.** Medium. Expect a font swap, a header change in `Base.astro`, a new masthead component, the meetings table with a stacked mobile layout, and an art-directed photo crop.

**Risks.**
- Breaks the "don't edit Base.astro for visual changes" rule for the masthead.
- The only building photo is 800×600, too small for a 1200px banner at 2x. The lodge needs new photography or the band shrinks.
- The placeholder crop shows the wide banner cutting the building's lettering at 390px. A real photo needs a mobile crop chosen by hand.
- Ivory and serif can read as dated rather than dignified if spacing or photography is weak.

---

## C. Noticeboard

Calendar first. The home page opens on "This week at the Temple": seven day cards with a body filter, previous and next week links, and an "Add the Temple calendar to my phone" link to the ICS feed. Next come the next stated meeting for each body, notices (news) and the newsletter signup. The body page opens on the next meeting as a large date tile with "Add to my calendar". Below sit the body's own month grid (a list at 390px), the officers and the news. The type is Atkinson Hyperlegible Next, designed for low-vision readers, with sentence-case labels instead of mono capitals. The brand is neutral navy-ink.

**theme.css**

```css
:root {
	--color-brand: light-dark(#14213d, #e6ebf5);
	--color-brand-hover: light-dark(#24365f, #ffffff);
	--color-on-brand: light-dark(#ffffff, #0a0a0a);
	--body-lodge: light-dark(#1d4ed8, #8fb0ff);
	--body-chapter: light-dark(#b91c1c, #ff9e9e);
	--body-council: light-dark(#6d28d9, #c4abff);
	--body-commandery: light-dark(#334155, #cbd5e1);
	--body-oes: light-dark(#047857, #5fdcb0);
	--body-temple: light-dark(#92400e, #f2b56b);
	--on-body: light-dark(#ffffff, #0a0a0a);
	--font-size-label: 0.875rem;
	--font-size-xs: 0.875rem;
	--font-size-sm: 1rem;
	--font-size-base: 1.125rem;
}
.eyebrow { font-family: var(--font-body); text-transform: none; letter-spacing: 0; font-weight: 700; font-size: var(--font-size-sm); }
```

**Beyond tokens.**
- `astro.config.mjs` changes the `--font-body` entry to Atkinson Hyperlegible Next (human-confirm).
- One class rule in `theme.css` makes `.eyebrow` sentence case.
- Six `--body-*` custom properties. Each `bodies` entry needs a way to pick its colour. A fixed select of the six keys (`lodge`, `chapter` and so on) suits this, not a free colour picker, so an editor can never choose a colour that fails contrast. That is an M1 schema question for the human.
- No `Base.astro` change. The header is the template header with the emblem as the site logo.

**Body colour coding.** This is where the rule bends, and I argue it should, for body identity only. FR-4.4 asks for colour coding, and members already know the bodies by their colours (Blue Lodge blue, Royal Arch red, Cryptic purple). The six colours appear in only four places: a 4px bar and 12% tint on calendar entries, a swatch beside the body name in filters and tags, a top rule on meeting and notice cards, and the next-meeting date tile. Buttons, links and focus rings stay on the single ink brand. A colour never appears without the body's name beside it, so colour-blind readers lose nothing.

**Contrast (light / dark).**

| Pair | Light | Dark |
|---|---|---|
| Text on canvas | 17.18 | 16.91 |
| Muted on canvas | 5.11 | 6.12 |
| Brand on canvas | 15.30 | 16.56 |
| On-brand on brand | 15.97 | 16.56 |
| Text on body tint, lowest (Chapter, Commandery) | 14.63 | 12.10 |
| On-body text on date tile, lowest (OES, Chapter) | 5.48 | 9.26 |
| Body colour as text on surface, lowest | 5.48 (OES) | 8.62 (Lodge) |

Every body colour also clears the 3:1 non-text minimum for bars and swatches. The full table is in `design-src/report.out`.

**Cost.** Medium. Expect a font swap, the colour field on `bodies`, and a week view on the home page that runs the recurrence expansion (needed for `/calendar` anyway). The body page leads with the next occurrence, which FR-1.1 already requires.

**Risks.**
- The home page changes every day ("Today", "Tonight"), so its cache must expire at local midnight. The same applies to A's and B's "this week" lists, but C depends on it most.
- A quiet week needs a designed empty state, for example "Nothing at the Temple this week. Next: Tue, Dec 8, Stated meeting, Lodge 227". The mockup shows only a busy week.
- Red (Chapter) and green (OES) are close for deuteranopes. The text labels cover it, but nobody should be told "look for the green ones".
- At 390px the six filter chips take about 200px before the first day. Collapsing them to "Showing all six bodies. Change" is a reasonable refinement.
- A seventh body later means choosing a seventh accessible colour.

---

## Recommendation

**C, the Noticeboard.** The site's core loop is "when does my body meet, and what is on this week". C is the only direction whose first screen answers that, on both the home page and the body page. It is also the only one that meets FR-4.4 as written without a spec change, and its typeface is the best fit for the older half of the audience. It needs no `Base.astro` edit, which B does. It costs more than A, but the extra is mostly the week view, and that reuses the calendar code M4 must build anyway.

Two things from the others are worth keeping as cheap options. First, B's token palette (ivory, navy, gold crosshairs) can sit on top of C's layout, because both are `theme.css` overrides. If the lodge finds C too plain, "C layout with B colours" costs one palette swap, not a redesign. Second, B's officer roster with leader lines reads more like a lodge trestle board than C's two-column grid, and can be swapped in on its own.

A is the right fallback only if the budget for M4 shrinks. If the lodge picks it, amend FR-4.4.

## Open questions only the lodge can answer

1. Which site name to use: "Findlay Masonic Bodies", "Findlay Masonic Complex" or "Findlay Masonic Temple". All three appear on the 2023 site.
2. The official display name of each body. Examples: "Findlay Chapter No. 58, R.A.M." and the Eastern Star chapter's own name. Also, should the Temple Board be listed alongside the five bodies or apart from them?
3. Each body's real stated-meeting schedule and any standing note (dinner times, dark months such as July and August).
4. For C, whether the bodies accept these colours. Some may already use a traditional colour that should win (the Commandery's black and red, the OES's own choice).
5. High-resolution emblem files for all six bodies, with permission to publish them.
6. A current high-resolution photograph of the building, with permission. This decides whether B's photo band is viable.
7. Current officers for each body, and whether officers want their photos shown.
8. The tone they want strangers to meet first: traditional and dignified (B) or practical and community-minded (C).
9. Where "Becoming a Mason" should lead: a page on this site, a contact form for Lodge 227, or the Grand Lodge of Ohio.
