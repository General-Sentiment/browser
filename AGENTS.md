# General Browser

A lightweight Electron browser. The page fills the window. Everything else hides behind Cmd+K.

User data lives in `~/.general-browser/`. Settings, history, site rules, and the overlay UI. See that directory's `AGENTS.md` for the user-facing layout.

## How the UI source works

The overlay UI ships in the app bundle at `ui/`. On first launch of a packaged build, those files copy into `~/.general-browser/ui/`. The app reads from there after that. Edit them directly or through an agent.

**Dev mode (`npm start`) reads from this repo's `ui/` directly.** Edits in the source tree render live. The user's `~/.general-browser/ui/` is ignored in dev.

When a new version ships UI changes, the app diffs the bundled files against a manifest of hashes from the last baseline. Settings shows a banner when an update is ready. Running `/update-ui` in an agent merges upstream changes on top of the user's edits.

## Structure (this repo)

- `ui/`: overlay UI. No build step. Plain ES modules with Preact + htm.
  - `index.html`: shell.
  - `app.js`: Preact app (address bar, history).
  - `settings.js`: settings view.
  - `style.css`: styles (light/dark, oklch).
  - `lib/`: vendored Preact + htm + hooks.
- `sites/`: built-in site rules. Seeded into `~/.general-browser/sites/` on first run.
  - `sites.yaml`: rule definitions.
  - `youtube/`, `instagram/`, `twitter/`: per-site CSS and JS.

## Site Rules

Configuration is in `sites/sites.yaml`:

```yaml
rules:
  - name: YouTube
    enabled: true
    matches:
      - "*://www.youtube.com/*"
    css:
      - sites/youtube/style.css
    js:
      - sites/youtube/script.js
```

- `matches` uses glob patterns. `*` matches anything.
- `css` and `js` paths are relative to the root.
- CSS injects after page load. Use `!important` to override site styles.
- JS runs in the main world with full DOM access.
- For SPAs, listen for navigation events. Pages don't fully reload.
- Prefer CSS-only when you can.

### Adding or editing a rule

1. Check `sites/sites.yaml` for an existing entry.
2. If none, create `sites/<sitename>/style.css` and/or `script.js`.
3. Add a rule to `sites/sites.yaml` with the right matches and paths.
4. If the rule exists, edit its CSS/JS in place.

## Data API (plugin surface)

The overlay has a scoped CRUD API at `window.browser.data.*`. It is exposed via [preload.js](preload.js) and implemented by the `data-*` IPC handlers in [main.js](main.js). This is the single read/write surface for `~/.general-browser/`. Page webviews have no preload, so no access.

Core features (settings, history, window state, site rules, UI manifest, update flow) run on the same primitives. There is no privileged internal path. A feature added by a user's agent has the same access as a feature shipped in the app. When adding persistence, use this API. Skip `localStorage` and embedded DBs.

```js
// Text + JSON
await window.browser.data.write(name, text)
await window.browser.data.read(name)        // { ok, data: string }
await window.browser.data.writeJSON(name, obj)
await window.browser.data.readJSON(name)    // { ok, data: any }

// Binary
await window.browser.data.writeBytes(name, uint8OrArrayBuffer)
await window.browser.data.readBytes(name)   // { ok, data: Uint8Array }
await window.browser.data.writeBlob(name, blob)
await window.browser.data.readBlob(name, type?)  // { ok, data: Blob }

// Misc
await window.browser.data.exists(name)      // { ok, data: boolean }
await window.browser.data.list(prefix?)     // { ok, data: [{ name, isDirectory }] }
await window.browser.data.delete(name)
```

- `name` is relative to `~/.general-browser/`. Absolute paths and `..` traversal are rejected.
- Calls return `{ ok: true, data? }` or `{ ok: false, error }`. No throws.
- Writes `mkdir -p` the parent automatically.
- `delete` is recursive.

Adding a feature:

1. Pick a sensible path under `~/.general-browser/`. `bookmarks.json`. `reading-list/items.json`. `clips/<id>.png`.
2. Write through the API. Main-process code calls `dataReadText` / `dataWrite` / etc. UI code calls `window.browser.data.*`. Same primitives underneath.
3. If the main process needs to react immediately (apply a setting, refresh a list), add a dedicated IPC handler alongside the data API. The data API is the substrate. Handlers like `save-settings` are convenience wrappers that also trigger side effects.

## Conventions

- No build tools. UI is vanilla ES modules importing from `./lib/preact.js`.
- Use `html` tagged template literals (htm) instead of JSX.
- Keep it small.
