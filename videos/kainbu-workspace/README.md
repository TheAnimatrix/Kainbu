# Kainbu landing films

The landing page uses four silent feature films at 1440 × 864 and 60 fps: AI chat (14 seconds), manual card work (9 seconds), notes (11 seconds), and a terminal agent (9 seconds).

`capture-product.mjs` compiles the product's unchanged Svelte templates with offline Kainbu example state. Network hooks are disabled during this offline build. `assets/example.json` contains example project content and the client-only Tiptap document body.

`build-feature-films.mjs` assembles the captured states into four compositions in `features/`. The AI message, edited states, and agent transcript are scripted example actions, not live AI or CLI execution. The AI clip reads a Friday beta launch brief, sharpens existing cards, adds must-ship checks, and opens an announcement page with a usable draft. The manual clip types a card title and carries it into In progress while both columns reflow. The notes clip opens Pages, uses the `# ` Markdown heading shortcut, types a title, then writes a checklist note. The terminal types its commands. It uses the real CLI's command shapes and color roles, and `.agents/skills/kainbu/SKILL.md` is the skill shown in the agent sequence. Refresh `assets/product.css` from the current application build when product styles change.

## Rebuild

From this directory, with repository dependencies installed:

```sh
node capture-product.mjs
node build-feature-films.mjs
npx hyperframes@0.8.71 check features/ai
npx hyperframes@0.8.71 check features/manual
npx hyperframes@0.8.71 check features/notes
npx hyperframes@0.8.71 check features/agent
npx hyperframes@0.8.71 render features/ai --fps 60 --quality delivery --output ../../static/marketing/kainbu-ai-beta.mp4
npx hyperframes@0.8.71 render features/manual --fps 60 --quality delivery --output ../../static/marketing/kainbu-manual.mp4
npx hyperframes@0.8.71 render features/notes --fps 60 --quality delivery --output ../../static/marketing/kainbu-notes.mp4
npx hyperframes@0.8.71 render features/agent --fps 60 --quality delivery --output ../../static/marketing/kainbu-agent.mp4
```

Export a WebP poster from a frame that shows each workflow's result to `static/marketing/kainbu-<feature>-poster.webp` (the AI film uses `kainbu-ai-beta-poster.webp`). If Chrome cannot launch, set `HYPERFRAMES_BROWSER_PATH` to an installed Chrome headless-shell executable.

The landing player loads each clip when visible, pauses offscreen or in hidden tabs, and offers replay and fullscreen controls. It defaults to a still frame for reduced motion. The earlier `build-product-film.mjs` and phone film remain as archival sources; the landing page no longer loads them.
