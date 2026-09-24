# Kainbu — three new landing directions

These are the initial explorations. The subsequent [Canvas direction](landing-canvas-direction-2026-09-24.md) applies the user's Designeer and Synara references and now occupies `/landing`. The original Focus direction is preserved at `/landing/focus`.

The brief: familiar product category, unusually considered presentation. Minimal enough to feel confident; substantial enough to explain and demonstrate the product. No gradients. Retain the Join logo, rebuild everything else.

## Research before design

Inspected the live homepages visually, including their product presentations, before building the directions. Award recognition and the current live design are distinguished below: a historical website award does not automatically describe today's version.

| Reference                                                                                                   | What the inspection suggested for Kainbu                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Linear](https://linear.app)                                                                                | A strong type hierarchy and a large, legible product surface do most of the work. Its detailed interface examples make the proposition tangible. Use that emphasis on the product and disciplined alignment. No website award claim is made here.                                                            |
| [Things](https://culturedcode.com/things/)                                                                  | A concise introduction, generous but deliberate space, and patient product explanation. The site explicitly identifies Apple Design Awards for the **app**. Its lesson is confidence and focus, rather than a website award or a palette to reproduce.                                                       |
| [Superlist](https://www.superlist.com/) and its [Awwwards record](https://www.awwwards.com/sites/superlist) | Verified Site of the Day, April 19, 2021, and Developer Award. The award record specifies a limited black, white, and red palette. The current site is different. Its clear product category and recognizable personality are useful; its current gradients and heavy visual effects are outside this brief. |
| [Reflect](https://reflect.app/) and its [Awwwards record](https://www.awwwards.com/sites/reflect)           | Verified Honorable Mention, May 11, 2023. The short promise and demonstration of a concrete AI action are useful. The glowing portal and decorative effects are deliberately excluded. This was a useful boundary reference, not the aesthetic target.                                                       |
| [Craft](https://www.craft.do/)                                                                              | The live page uses expressive serif typography and a tactile, editorial composition to give a familiar notes-and-tasks category personality. Studio applies that warmth through typography, flat color, and an original project brief, without reproducing Craft's collage or assets.                        |

The resulting design criteria:

1. The product must be understandable without reading a long feature list.
2. Each direction needs a distinct composition, not merely a theme change.
3. Use real capabilities: boards, pages, contextual AI, reversible edits, project invitations, provider keys, self-hosting, and the existing CLI.
4. Make the visual example useful to explore. Avoid ornamental controls that look clickable but do nothing.
5. No invented customer logos, testimonials, awards, adoption numbers, performance claims, or pricing.
6. Use the existing Inter and Source Serif 4 families. No new font downloads or illustration dependency.

## The directions

### 01 — Focus

`/landing/focus`

A centered, quiet introduction, cool secondary typography, and a broad light product canvas. The page moves from one clear promise into the example workspace, three concise product observations, then ownership. The most straightforward choice for a broad audience.

### 02 — Studio

`/landing/studio`

An expressive serif headline, warm paper, forest ink, and an original editorial folio. The project brief is visible in the first screen. A centered typographic passage gives the page a different rhythm before the full board. The warmest and most individual direction.

### 03 — Mono

`/landing/mono`

A left-aligned, architectural composition in charcoal, with a restrained pale-green accent. The supporting copy sits beside the headline, making room for the product sooner. Numbered details, a compact feature accordion, hosting specifications, and a real CLI example speak to an audience that values control.

Append `?compare=1` to any direction to display the comparison dock. It is not part of the normal page, and can be dismissed. Alternative directions are marked `noindex`.

## New implementation

All new shared marketing components live in `src/lib/components/marketing`. None imports the old `components/landing` directory, old fixtures, or the application's board/page/chat components. The existing `BrandMark` is the only retained landing component. Generic icon primitives are shared with the application's icon library.

The Morrow example is written from scratch, including its content and behavior. It is an illustrative, local product demo rather than a second application. It does not read accounts, persist changes, or call an AI provider. The AI example is explicitly labeled and reversible. Board tasks open native dialogs; new tasks can be added locally. The page tab and AI visibility controls work. The standalone Studio document is also new.

The landing routes opt into server rendering and static prerendering. Their initial headings and product content are present in the generated HTML. The new demo does not load the production editor, rich-text engine, persistence layer, or AI client.

Accessibility includes a skip link, visible focus styles, named regions, keyboard-operated tabs, native dialogs and Escape dismissal, focus restoration after adding or cancelling a task, a live status region, and reduced-motion support. The board scrolls within its own container on phones; the assistant becomes a separate block beneath it. Marketing content is never hidden behind scroll-triggered animation.

## Verification

- `npm run check`: passed, zero errors and zero warnings.
- `npm run check:server`: passed.
- Targeted ESLint and Prettier checks: passed for all changed marketing components and landing routes.
- `npm run build`: passed; generated HTML exists for all three routes.
- Browser layout review: 320, 390, 768, and 1440 pixel viewports; final overflow checks passed for all three directions at 320, 768, and 1440 pixels.
- Interaction checks: board/page tabs, native arrow-key tab navigation, local task creation, task dialog opening and Escape dismissal, AI example movement and undo, exclusive feature accordion expansion, and comparison dock navigation/dismissal.
- Production preview: verified hydration and AI playback, all three comparison routes, and unique DOM IDs when Studio renders two demo instances. No production browser errors were observed.
- Import audit: no legacy landing components, old workspace fixtures, production editor imports, or gradients in the new route/component source.

The Docker suite requires a running local stack; on this machine Docker's daemon was unavailable, and the suite stopped at `127.0.0.1:8789/health` with `ECONNREFUSED` before its 12 tests could run. This is not a passing integration run.

Local production previews: [Focus](http://127.0.0.1:4173/landing/focus?compare=1), [Studio](http://127.0.0.1:4173/landing/studio?compare=1), [Mono](http://127.0.0.1:4173/landing/mono?compare=1).
