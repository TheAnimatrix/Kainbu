# Landing design direction — September 23, 2026

## Research

Reviewed live pages visually, alongside the award record, before implementation:

- [Linear](https://linear.app): strong left alignment, a large product surface, careful interface typography. Borrow the hierarchy and the emphasis on actual work. Its current dark presentation is not the palette for Kainbu. No website award claim is made here.
- [Things](https://culturedcode.com/things/): generous space, a concise introduction, and an unusually confident focus on the product itself. Things has Apple Design Awards for the app, not a claimed website award. Borrow the restraint, not its illustrative app icon.
- [Superlist — Awwwards](https://www.awwwards.com/sites/superlist): verified Site of the Day, April 19, 2021, with a 7.84 score and Developer Award. The award record documents a limited black, white, and red palette. The [current site](https://www.superlist.com) is a different design; inspected it separately. Take the distinctive product personality and clear proposition, leave the gradients and effects behind.

## Revised direction: Join

The first pass was too neutral and illustrated a fictional assistant page. The user selected the Join logo and asked for character, texture, and a presentation grounded in the actual product. The reference lesson is confidence and distinctiveness, not simply removing decoration.

Join is the brand's connecting shape. Its clean vector lives in `assets/icon.svg`; the shared `BrandMark` component and generated web/native assets all derive from it. Keep it monochrome and legible at small sizes. The landing uses the same shape as a large terracotta print, with restrained registration marks and paper grain. Warm paper, olive-black ink, and terracotta carry the identity. Existing Inter and Source Serif 4 provide the contrast between useful tool and expressive editorial voice. No gradients, automatic animation, fabricated customer proof, or extra font downloads.

The example project is an independent journal, Fieldwork: concrete tasks about writing, image sequencing, paper, and print. This connects the visual direction to work a person might actually do instead of presenting marketing copy as fake tasks.

## Product accuracy

Inspected `WorkspaceShell`, `KanbanBoard`, `PagePane`, `ChatPane`, `ProjectRail`, and the current AI edit flow. Also opened a disposable local account, created a board, and expanded the desktop chat sidebar to verify the real layout visually.

The landing now renders the actual `KanbanBoard`, `PagePane`, and `ChatPane` components with isolated, typed fixtures. Boards and pages are project surfaces; desktop chat is a right sidebar alongside either surface. The current assistant applies changes and exposes Undo. The landing no longer claims every change waits for approval.

The example is a read-only illustration, not an AI session: it is inert, has an accessible description, and never reads or persists account data. The surrounding controls switch board/page and show/hide the sidebar. On phones, the desktop example scrolls horizontally and is labeled accordingly. The production components load dynamically after the landing shell. Their normal application implementation remains unchanged.

Landing colors and grain are scoped to this route. The product example uses real dark app tokens. Existing unrelated work is preserved.

## Asset maintenance

Run `node scripts/generate-icons.mjs` after editing `assets/icon.svg`. It regenerates favicons, PWA icons (including a separate maskable safe-area variant), Apple touch icon, Android legacy/adaptive/themed launchers, and existing splash canvas variants. Android resources need a new native build to appear in an installed app; generating them does not deploy or install a release.
