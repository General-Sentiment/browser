# Browser

Lightweight Electron browser. Page fills the entire window — all UI is behind Cmd+K.

## Quick Start

```
npm install
npm start
```

## Structure

- `main.js` — Electron main process. Manages WebContentsViews (one per tab), IPC, settings, site rules, history.
- `preload.js` — contextBridge exposing `window.browser` API to the renderer.
- `ui/` — Renderer/overlay UI. No build step — plain ES modules.
  - `index.html` — Shell.
  - `app.js` — Preact app. Renders the Cmd+K overlay (address bar, tabs, history).
  - `settings.js` — Settings view (site rules, source directory, updates).
  - `style.css` — Styles (light/dark, oklch).
  - `lib/` — Vendored Preact + htm + hooks. Do not npm install these.
- `docs/plan.md` — Design doc.

## Key Shortcuts

- `Cmd+K` — Toggle overlay (address bar)
- `Cmd+T` — New tab (opens overlay)
- `Cmd+W` — Close current tab
- `Cmd+Shift+[` / `Cmd+Shift+]` — Switch tabs

## Settings

All config lives in `~/.browser/settings.yml` (created on first run).
Site rules (user styles/scripts) live in `~/.browser/sites.json` with files in `~/.browser/sites/`.

## Conventions

- No build tools. UI is vanilla ES modules importing from `./lib/preact.js`.
- Use `html` tagged template literals (htm) instead of JSX.
- Keep it small. Target < 500 lines of JS total.
