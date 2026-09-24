# Canvas — the refined Kainbu direction

Live local preview: [Canvas](http://127.0.0.1:4173/landing?compare=1). The comparison dock also links the earlier Focus, Studio, and Mono explorations. Focus now lives at `/landing/focus`; Canvas is the main `/landing` page.

## The reference brief

The user selected [Designeer](https://designeer.xyz/) for its small details and transitions, then [Synara](https://www.trysynara.com/) for its imagery, dynamic presentation, and actual product interface. Both were inspected in the browser, including light/dark treatments on Designeer and the hero/product composition on Synara.

- **Designeer:** compact controls, fine rules, restrained secondary typography, and responsive interaction states. Its live typography uses Funnel Sans and Funnel Display; Kainbu retains its existing Inter family. The influence is in scale and precision, without importing its assets or source.
- **Synara:** an atmospheric landscape gives the product a setting, while a large view of the actual application provides substance. Canvas applies that relationship with original art and Kainbu's own interface.
- **The synthesis:** a painted landscape, direct introductory copy, a large product tour, three concise feature observations, ownership details, and a short FAQ. No CSS gradients, invented customer endorsements, decorative counters, or constant motion.

## Interaction and implementation

The new page and `WorkspaceShowcase.svelte` are written for this direction. No old landing components or old example fixtures are imported. The existing logo and general icon primitives are retained.

The workspace is now an **18-second silent video** at 1440 × 810, 60 fps. It animates frozen production markup from the real KanbanBoard, PagePane, and ChatPane components, with the isolated Morrow example. The film moves from the board to the launch brief, then the assistant and two tasks moving to Done. It does not access an account, persist edits, or send an AI request. Source and reproduction instructions live in `videos/kainbu-workspace/README.md`.

`WorkspaceVideo.svelte` loads the 2.13 MB MP4 only when it enters view, with a 30 KB WebP poster. It provides pause, replay, fullscreen, a progress indicator, and chapter links through the feature rows. Playback pauses offscreen and in hidden tabs, preserves manual pause, and starts paused under reduced motion. The film keeps its dark product appearance in either landing theme.

The separate CLI section presents the real `kainbu ls --checked false` syntax and grouped sample output. Its command types once on entry, with a replay control; reduced motion reveals it immediately. Server-rendered terminal content remains visible without JavaScript. The CLI guide links to the package README.
The motion pass adds masked word entrances to all four headline treatments, with 65 ms staggering and a 900 ms ease-out. Canvas sequences its label, headline, supporting copy, actions, landscape, and workspace entrance. Lower headings and rows reveal as they enter the viewport. Word masks preserve normal wrapping, and screen readers receive each heading as one sentence.

The shared Web Animations action is progressive enhancement: server-rendered content is visible without JavaScript; reduced-motion preferences skip animation. It pauses in hidden tabs, resumes when visible, reveals focused controls immediately, and releases animations and observers on cleanup. The comparison dock includes a Replay control, which returns to the top and restarts the presentation without remounting the product or resetting its example data.

The video coordinates page transitions, the AI sidebar, cursor movement, and task completion. Feature rules follow its current chapter. The landscape shifts slightly during scrolling; FAQ answers expand where the browser supports intrinsic-size transitions. Video and chapter controls support ordinary keyboard navigation.

The theme control changes only the landing preview. The existing application settings remain independent. The page is statically prerendered, with its headline, copy, artwork, and tour description in the generated HTML. The earlier three alternatives remain available and carry `noindex`.

## Original artwork

Created using the built-in image-generation tool. No reference-site image was copied. The selected source remains in the Codex generated-images directory; the optimized project assets are:

- `static/marketing/kainbu-landscape-1600.webp` — 167,012 bytes
- `static/marketing/kainbu-landscape-960.webp` — 72,482 bytes
- `static/marketing/kainbu-landscape-640.webp` — 35,332 bytes

The page uses responsive `srcset`, explicit dimensions, and high fetch priority for the hero. Sharp was used only to resize and encode the generated artwork for web delivery.

Final generation prompt:

> Use case: stylized-concept. Asset type: original landscape painting for the hero background of Kainbu, a refined project management website. Create an exceptionally beautiful, atmospheric hand-painted landscape, wide 16:9 composition. A quiet hillside garden overlooking a broad lake and distant mountain ranges at blue hour just before sunrise. In the RIGHT third, a weathered stone garden terrace, a cypress tree, fine wild grasses, and a winding path descending toward the lake; restrained touches of warm ochre morning light on stone. The LEFT half and upper middle are mostly deep muted blue sky and distant misty hills, calm and low in contrast, reserved for white website typography that will be added separately. The horizon is low, around the bottom third. Palette: midnight blue, slate, desaturated olive and soft stone, with small warm pale-gold highlights. Painterly naturalism with tactile oil brushwork, subtle canvas grain, nuanced atmospheric perspective. The image should feel like a real landscape painting, thoughtful and quietly optimistic, not fantasy or a digital sci-fi render. Full-bleed image, no frames. No text, letters, UI, logos, people, temples, columns, buildings, dramatic sun disks, neon, glows, abstract gradients, or oversaturated colors. Strong image quality and elegant composition. Output a wide landscape image at the highest suitable resolution.

## Verification

- `npm run check`: passed, zero errors and warnings.
- `npm run check:server`: passed.
- Targeted ESLint: passed for the changed landing routes and marketing components.
- `npm run build`: passed; all four landing routes prerendered successfully.
- Browser checks cover dark/light appearance, mobile layout, real component loading, board/page/AI views, keyboard tab selection, and AI playback/undo. Production board counts were verified directly in the rendered UI.
- Layouts were reviewed at 320, 390, 768, and 1440 pixels, including resizing between breakpoints. A retained preview width was corrected during this pass. Phone page/AI views fit the viewport; the wider board scrolls inside its preview. All four comparison links were verified in production, and the final browser error log was empty.
- Motion was inspected in the browser at intermediate frames, not only after settling: headline words showed different transforms/opacity in the same frame; board/page transitions showed intermediate translation, opacity, and blur; the AI pane showed intermediate width and translation. Replay, scroll reveals, rapid tab changes, and 320/390 px heading wrapping were checked. No added animation dependencies.
- The local Docker integration suite still cannot start: its health request to `127.0.0.1:8789` is refused, so all 12 tests are skipped. It is not a passing integration run.

No deployment was performed.

### Video and CLI pass

- Main Canvas route now embeds the silent workspace film and dedicated CLI section. Earlier variants remain available.
- `npm run check`: zero errors and warnings; `npm run check:server`: passed. Targeted ESLint, Prettier, and production build passed.
- HyperFrames runtime checks passed with no runtime warnings. The authoring linter's single structural warning is expected for this one continuous product scene; sampled contrast checks passed. Intermediate task movement was visually checked and its ancestor clipping corrected before the final encode.
- Browser verification: desktop and 320/390 px layouts; video decode and 18-second duration; chapter selection; pause; pause offscreen; fullscreen entry and exit; CLI output. No browser console errors. Reduced-motion behavior is implemented, but OS preference emulation was not available in the browser tool.
- `npm run test:local-docker` fails in suite setup because the local API at `127.0.0.1:8789` is unavailable; all twelve integration cases are skipped. No production deployment was performed.
