# Beautiful UI in Kainbu

Kainbu's chat uses native Svelte adaptations of [Beautiful UI](https://www.beautifului.dev/),
including its chat composer, prompt bar, thinking disclosure, and compact tool activity patterns.
They use Kainbu's existing theme tokens, icons, model controls, and real chat events.

Upstream source: [slev12397/beautiful-ui](https://github.com/slev12397/beautiful-ui).
Component source is also published in the [official registry](https://www.beautifului.dev/r/registry.json).
The React demonstration harness and its simulated replies are not included.

Reference components: `chat-composer`, `prompt-bar`, `streaming-text`, `thinking-state`,
`tool-chips`, `task-rows`, and `loading-state` (upstream commit
`ff0f74d62d8be9d89bcb735b3632e31a6ccf88dc`). These are adaptations for Svelte,
not an installed React component package.

## Editing behavior

New chat edits apply by default. Chat shows the outcome and an Undo action, including
after reopening the session. Older change entries remain accessible in the change list.
Undo checks the target against the saved result first; if the target has changed since,
it reports a conflict instead of replacing newer work. Save failures remain visible.
The model receives the saved/undone status in later conversation turns.

## Upstream license

MIT License

Copyright (c) 2026 Shane Levine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
