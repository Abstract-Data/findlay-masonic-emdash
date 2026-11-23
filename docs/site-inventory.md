# Findlay Masonic site inventory

Source: <https://findlay-masonic.flywheelsites.com/>
Captured: 2026-11-23, from the live site (HTML, WordPress REST API, sitemap, Elementor CSS) and cross-checked against the local export in `reference/findlay-masonic/` (`app/sql/local.sql`, dated 2024-10-04).

The raw ordered widget tree for the homepage, with Elementor element IDs, is in [`site-inventory-elementor-tree.txt`](./site-inventory-elementor-tree.txt).

## 1. Site at a glance

| Item | Value |
|---|---|
| Platform | WordPress 7.1.5 on Flywheel, theme `hello-elementor` |
| Page builder | Elementor 3.15.3 + Elementor Pro |
| Site title (live) | Findlay Masonic Complex |
| Site title (local export `blogname`) | Findlay Masonic Bodies |
| Tagline | *(empty)* |
| Front page | Static page "Homepage" (ID 7), template `elementor_canvas` (no theme header/footer) |
| Published pages | Homepage `/`, Sample Page `/sample-page/` |
| Published posts | "Hello world!" `/hello-world/` (category: Uncategorized) |
| Drafts (local export only) | Privacy Policy (WP boilerplate) |
| Media library | 39 items, all uploaded March 2023, none with alt text |
| Author archive | `/author/johnsfriend/` |
| Admin email (local export) | webmaster@abstractdata.io |
| Navigation menu | None. The homepage has no nav links; only an anchor (`#down`) and buttons. |
| Favicon / app icon | Square-and-compasses emblem, `2023/03/image-1-e1678849267995.png` |

**Real content vs. leftovers.** Only the homepage carries real content, and even it is partly placeholder. The Sample Page, Hello World post, and its sample comment are WordPress defaults. Most of the media library (26 of 39 items) is from a fitness/personal-trainer Elementor template kit and is not used on the live site.

## 2. Design system

### Colors

| Role | Value | Where used |
|---|---|---|
| Primary (kit global) | `#1200B8` royal blue | Section backgrounds, hero overlay, card backgrounds, button text |
| Secondary (kit global) | `#FFE218` yellow | Button backgrounds |
| Eyebrow / accent yellow | `#FFDE01` | Small "kicker" headings above section titles, button backgrounds |
| Gold | `#AE9802` | "2B1ASK1" headline, alternating leader cards |
| Dark slate | `#1B252F` | Section backgrounds, overlay on "Make Good Men Better" band |
| Footer | `#2D2C2F` | Footer background |
| Text (kit global) | `#FFFFFF` | Body text on dark backgrounds |
| Light gray | `#E5E5E5` | Body copy and footer text in the bottom sections |
| Kit accent (unused) | `#61CE70` green | Elementor default, not seen on the page |

### Typography (Google Fonts)

| Font | Use |
|---|---|
| **Racing Sans One** 400 | Section titles (uppercase, 33–70px, line-height 0.8em), card titles, icon-box titles, buttons |
| **Helvetica** 300 | Eyebrow headings (22–30px, capitalized, yellow), testimonial text (16px/200) |
| **Noto Serif Toto** 400 | Hero H1 "Findlay Masonic Bodies" (61px) |
| **Sora** 400/600 | "2B1ASK1" headline (86px, gold), "Get Started" button |
| **Inter** 300 | "Learn more about how to become a Mason." body text, footer copyright |
| Roboto / Roboto Slab | Elementor kit defaults, loaded but not used by visible content |

Recurring pattern: a small yellow Helvetica eyebrow ("Get to know", "Check out our", "Heads of Bodies") sits above a large white uppercase Racing Sans One title, with a divider to the right.

### Effects
- Hero: background scale "in-out" motion effect on scroll.
- Header bar: sticky to top, fades with scroll.
- Several sections use Elementor "tilt" shape dividers top/bottom.
- Organization and leader cards: background zoom-in on hover.
- "2B1ASK1" down-arrow icon: slide-in-down entrance animation, links to `#next`.

## 3. Homepage, section by section

Headings styled with `text-transform: uppercase` or `capitalize` render that way regardless of the source casing shown here.

### 3.1 Hero (`#19bc13f`)
- Background photo: `2023/03/image.jpeg` (Findlay Masonic Complex building exterior, tan block wall with "FINDLAY MASONIC COMPLEX" lettering and lamps, lawn and hedge in front), blue `#1200B8` overlay, scale-on-scroll.
- H4 (yellow eyebrow): **Believe in Yourself**
- H1: **Findlay Masonic Bodies**

### 3.2 Header bar (`#4e38465`, sticky, blue)
- Logo: square-and-compasses emblem (`image-1-e1678849267995.png`, gold square & compasses with "G" on navy)
- H5: **Findlay Masonic Temple**
- Menu anchor (ID `down`)
- Button: **Subscribe to our Newsletter** (hand-pointer icon), links to `#` (not wired up)

### 3.3 Three points (`#849d860`, blue)
Three icon boxes, placeholder copy:
| Title | Tagline |
|---|---|
| POINT 1 | Tagline 1 |
| Point 2 | Tagline 2 |
| Point 3 | Tagline 3 |

### 3.4 Our Organizations (`#9caf7c9`, dark slate)
- Eyebrow: **Get to know**
- H2: **OUR Organizations**
- Five image cards (call-to-action widgets, blue background, emblem image, title only):

| Card title | Emblem image | What the emblem actually is |
|---|---|---|
| Blue Lodge #227 | `image-1-e1678849267995` | Square & compasses with "G" (gold on navy). Matches. |
| Council #58 | `image-2` | Red triple tau in triangle within circle, the **Royal Arch (Chapter)** emblem |
| Gymnastic Rings | `image-3` | Purple triangle with trowel and sword in circle, the **Cryptic (Council)** emblem |
| Commandry #49 | `image-4` | Black cross pattée, red cross, crown, swords, "In Hoc Signo Vinces", the **Knights Templar (Commandery)** emblem. Matches. |
| Order of the Eastern Star | `image-5` | Five-point star with colored points and altar. Matches. |

- Button: **Learn More** (double-angle icon), no link.

### 3.5 Upcoming Events (`#60bfc1f`, blue)
- Left column: two placeholder images (`placeholder.png`, gray landscape glyph).
- Eyebrow: **Check out our**
- H2: **Upcoming Events**
- Posts grid (Elementor "cards" skin, 3 columns desktop / 2 tablet / 1 mobile, "Load More" pagination configured). Currently shows the only post:
  - **Hello world!**: "Welcome to WordPress. This is your first post. Edit or delete it, then start writing!" with a **Learn More »** link to `/hello-world/`.
- Button: **All Events**, no link.

Events are plain WordPress posts. There is no event plugin, date field, or venue data.

### 3.6 "Make Good Men Better" band (`#9db111b`)
- Background: same building photo (`image.jpeg`) with `#1B252F` overlay.
- Eyebrow: **Learn how you can**
- H2: **MAke Good men better** (renders as MAKE GOOD MEN BETTER)

### 3.7 About Freemasonry quotes (`#cfc0607`, inner box blue)
- Quote-right icon
- Eyebrow: **Notable Perspectives**
- H2: **About freemasonry**
- Testimonial carousel (1 per view, autoplay 3.5s, loop, pause on hover, bullet pagination), no photos:
  1. "So far as I am acquainted with the principles and doctrines of Freemasonry, I conceive it to be founded in benevolence and to be exercised only for the good of mankind." **George Washington**, 1st President of the United States of America
  2. "Masonry aims at the promotion of morality and higher living by the cultivation of the social side of man, the rousing in him of the instincts of charity and love of his kind. It rests surely on the foundation of the brotherhood of man and the fatherhood of God." **William Howard Taft**, 27th President of the United States of America
  3. "There are no strangers in Freemasonry, only friends you've yet to meet." **Author Unknown**

  The first two slides have a stray extra `"` before the opening curly quote.

### 3.8 Meet Our Leadership (`#c197417`, dark slate)
- Eyebrow: **Heads of Bodies**
- H2: **MEet our leadership**
- Four leader cards (placeholder image, alternating gold `#AE9802`/blue backgrounds):

| Card title | Subtitle (body) |
|---|---|
| Drew DeVore | Worshipful Master |
| You've gotta be kidding me | Chapter |
| Oh no. Not him. | Council |
| that jackass, again? | Commandry |

  Only "Drew DeVore / Worshipful Master" is real; the other three titles are joke placeholders.
- Button: **Learn More About Our Leaders**, no link.

### 3.9 Community (`#eb6e54b`, blue)
- Eyebrow: **Committed to our Community**
- H2: **Masonry takes it to the next level .** (stray space before the period)
- Button: **Learn About Our Community Engagement**, no link.
- Right column: two placeholder images.

### 3.10 2B1ASK1 / membership CTA (`#d7eaa09`)
- Background: `2023/03/image-1-scaled.jpeg` (stock photo: younger man in green sweater and collared shirt talking with an older gray-haired man), black overlay, positioned center-right.
- H1 (gold, Sora 86px): **2B1ASK1** ("To be one, ask one")
- Text: **Learn more about how to become a Mason.**
- Button: **Get Started**, links to `#`.
- Animated down-arrow icon, links to `#next` (no matching anchor exists).

### 3.11 Footer (`#1a59753`, `#2D2C2F`)
- **© 2021 All Rights Reserved.**
- Social icons: Facebook, an empty icon slot, Twitter. None have URLs.

## 4. Other pages and posts

| URL | Type | Content |
|---|---|---|
| `/sample-page/` | Page | WordPress default "Sample Page" text (bike messenger / XYZ Doohickey Company). Delete. |
| `/hello-world/` | Post, 2023-03-15 | WordPress default "Hello world!" plus one default comment from "A WordPress Commenter". Delete. |
| Privacy Policy | Draft page (local export) | WordPress default privacy policy boilerplate. |

## 5. Unpublished Elementor templates (local export only)

These exist in the database but are not on the live site.

| ID | Name | Status | Contents |
|---|---|---|---|
| 155 | Default Primary Nav Bar | publish | Same as the homepage header bar: logo, "Findlay Masonic Temple", anchor `down`, newsletter button |
| 169 | Default Header | publish | Duplicate of 155 |
| 175 | Homepage Header | publish | Hero only: building background, "Believe in Yourself" / "Findlay Masonic Bodies" |
| 162 | Masonic Body Page Template | draft | Start of a per-body page. Header: H3 **Findlay Lodge #227**, H1 **Blue Lodge**. Then fitness-kit leftovers ("Need encouragement? Maria will motivate you!", "maria's fitness plan", lorem ipsum, progress bars "core strength training", "Cardio", etc.). Then H4 **Blue Lodge** / H2 **Officers** with a 1 + 3 + 5 grid of nine officer cards (all "Drew DeVore"), a **Read More About Our Team** button, and a fitness CTA ("Define Your Personal Training Goals" / "change your life" / "Join Us Today"). |

Template 162 shows the intended per-body page: body name and number, description, and an officer roster grid. The rest is template filler.

## 6. Organizations referenced

From the homepage cards, leadership subtitles, and the draft template:

| Body | Number on site | Notes |
|---|---|---|
| Findlay Lodge (Blue Lodge) | #227 | Leader shown: Drew DeVore, Worshipful Master |
| Chapter (Royal Arch Masons) | none shown | No card of its own; its emblem is on the "Council #58" card |
| Council (Cryptic Masons) | #58 | Its emblem is on the "Gymnastic Rings" card |
| Commandery (Knights Templar) | #49 | Spelled "Commandry" on the site |
| Order of the Eastern Star | none shown | |

Confirm the correct name and number for each body with the client before migrating. The card labels and emblems are out of step.

## 7. Media library

None of the 39 items has alt text. Base URL: `https://findlay-masonic.flywheelsites.com/wp-content/uploads/`

### 7.1 Used on the live site

| File | Size | Media ID | Used for |
|---|---|---|---|
| `2023/03/image.jpeg` | 800×600 | 48 | Hero and "Make Good Men Better" backgrounds (building photo) |
| `2023/03/image-1-scaled.jpeg` | 2560×1706 | 49 | 2B1ASK1 background (two men talking) |
| `2023/03/image-1-e1678849267995.png` | 2054×2160 | 13 | Logo, favicon, Blue Lodge card (square & compasses, gold) |
| `2023/03/image-2.png` | 2000×2000 | 14 | "Council #58" card (Royal Arch triple tau) |
| `2023/03/image-3.png` | 2000×2000 | 15 | "Gymnastic Rings" card (Cryptic Council emblem) |
| `2023/03/image-4.png` | 651×657 | 16 | Commandry #49 card (Knights Templar cross) |
| `2023/03/image-5.png` | 600×600 | 17 | Order of the Eastern Star card |
| `2023/03/placeholder.png` | 1200×800 | 23 | Events and community images, all four leader cards |

### 7.2 Real but unused

| File | Size | Media ID | Notes |
|---|---|---|---|
| `2023/03/image.png` | 273×300 | 12 | Titled "Blue Lodge". Blue-on-white square & compasses with "G". Alternate logo. |

### 7.3 Template-kit leftovers (fitness/trainer kit, unused, safe to drop)

| File | Size | ID |
|---|---|---|
| `2023/03/CTA-Trainer-page.png` | 1922×1007 | 165 |
| `2023/03/Debby-Scott-2.png` | 285×399 | 164 |
| `2023/03/Trainer-BG-Hero.png` | 1920×801 | 163 |
| `2023/03/Logo-W.png` ("Beyond" white logo) | 500×108 | 153 |
| `2023/03/2_Home_Online_Training-Testimonials_1.jpg` / `_2` / `_3` | 95×95 | 45–47 |
| `2023/03/2_Home_Online_Training-AboutUs-Img_1.jpg` / `_2` / `_3` | 1920×845 | 42–44 |
| `2023/03/2_Home_Online_Training-Classes_1.jpg` / `_2` / `_3` | 495×528 | 39–41 |
| `2023/03/2_Home_Online_Training-Hero.jpg` | 1920×970 | 38 |
| `2023/03/CTA-1.png`, `CTA-2.png` | 444×430 | 37, 36 |
| `2023/03/A.png`, `30-1.png`, `C.png`, `20.png` | 285×399 | 35, 34, 33, 32 |
| `2023/03/large-pic-cta-home-1.jpg` | 1920×961 | 31 |
| `2023/03/DEFINE-YOUR-GOALS-1.png`, `-2.png` | 444×430 | 29, 30 |
| `2023/03/Fitness-pic.png`, `11-1.png`, `Crossfit-pic-new.png`, `66.png`, `33.png` | 380×371 | 28, 27, 26, 25, 24 |
| `2023/03/22.png` | 380×370 | 22 |
| `2023/03/BG-home-new-Hero.jpg` | 1920×970 | 21 |

## 8. Links and calls to action

| Element | Target | Status |
|---|---|---|
| Subscribe to our Newsletter | `#` | Not wired; no newsletter form or service found |
| Learn More (organizations) | none | Dead |
| Hello world! / Learn More » | `/hello-world/` | Points to default post |
| All Events | none | Dead |
| Learn More About Our Leaders | none | Dead |
| Learn About Our Community Engagement | none | Dead |
| Get Started (2B1ASK1) | `#` | Dead |
| Down arrow | `#next` | No matching anchor |
| Facebook / Twitter icons | none | No URLs |

No contact information appears anywhere on the site: no address, phone, email, meeting schedule, map, or contact form.

## 9. Gaps to resolve before rebuilding

Content the client needs to supply:
1. Final site name: "Findlay Masonic Complex", "Findlay Masonic Bodies", or "Findlay Masonic Temple" (all three appear).
2. Correct list of bodies with names and numbers, including whether the Chapter has a number.
3. The three "points" and taglines (section 3.3).
4. Officers for each body (only Drew DeVore, Worshipful Master, is real).
5. Events: real events, and whether they need dates, times, and locations.
6. Community engagement copy and photos.
7. Membership ("Get Started") destination: page, form, or Grand Lodge link.
8. Newsletter provider, if any.
9. Facebook/Twitter URLs, address, meeting schedule, contact details.
10. Real photos to replace the five placeholder images and the stock photo.
11. Alt text for all images.

Copy fixes: "Commandry" → "Commandery"; stray quote marks on carousel slides 1–2; stray space in "next level ."; footer year 2021.

## 10. Mapping to this EmDash project

Suggested structure for the EmDash blog template in this repo (`seed/seed.json` currently has `posts` and `pages` collections, `category` and `tag` taxonomies, and one `primary` menu):

| Old site | EmDash |
|---|---|
| Homepage sections | Custom `src/pages/index.astro` driven by site settings and collections |
| Organization cards | New `bodies` collection: name, number, emblem image, description, officers |
| Leadership cards | `officers` collection (name, title, body ref, photo), or a repeater on `bodies` |
| Upcoming Events (posts grid) | New `events` collection with date/time/location, or `posts` with an `events` category |
| Freemasonry quotes | `quotes` collection or a homepage widget area |
| 2B1ASK1 / Get Started | `pages` entry (`/pages/become-a-mason`) |
| Community engagement | `pages` entry |
| Masonic Body Page Template (draft 162) | `/bodies/[slug]` page with officer grid |
| Emblems + logo | R2 media, with alt text added |
