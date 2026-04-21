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

Two CRUD namespaces, same surface, different scope. Both exposed via [preload.js](preload.js) and implemented by the `data-*` / `fs-*` IPC handlers in [main.js](main.js). Page webviews have no preload, so no access to either.

- `window.browser.data.*` — scoped to `~/.general-browser/`. Relative paths only. Absolute paths and `..` traversal are rejected. Use for app-managed state.
- `window.browser.fs.*` — unscoped. Accepts absolute paths and `~/…`. Relative paths are rejected. Use when a feature needs files outside the data dir: an Obsidian vault, Desktop, an external project.

Core features (settings, history, window state, site rules, UI manifest, update flow) run on `data.*`. There is no privileged internal path. A feature added by a user's agent has the same access as a feature shipped in the app. When adding persistence inside the data dir, use `data.*`. Skip `localStorage` and embedded DBs.

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

// Markdown with YAML frontmatter (both namespaces)
await window.browser.fs.writeMarkdown('~/Notes/today.md', { frontmatter, body })
await window.browser.fs.readMarkdown('~/Notes/today.md')
// { ok, data: { frontmatter, body } }

// Misc
await window.browser.data.exists(name)      // { ok, data: boolean }
await window.browser.data.list(prefix?)     // { ok, data: [{ name, isDirectory }] }
await window.browser.data.delete(name)

// Anywhere on disk
await window.browser.fs.read('~/Documents/notes/plan.md')
await window.browser.fs.list('~/Documents/notes')  // default: ~
```

- `data.*` names are relative to `~/.general-browser/`. `fs.*` names are absolute or start with `~/…`.
- Calls return `{ ok: true, data? }` or `{ ok: false, error }`. No throws.
- Writes `mkdir -p` the parent automatically.
- `delete` moves the path to the OS trash (macOS Trash, Windows Recycle Bin, Linux trash) rather than hard-deleting. Recursive. Missing paths succeed silently.
- `readMarkdown` returns `{ frontmatter, body }`. Files with no `---` fence read as `{ frontmatter: {}, body: <file> }`. `writeMarkdown` emits the fence only when `frontmatter` has keys. Round-trips through js-yaml, so comments inside YAML are not preserved.

Adding a feature:

1. Pick a sensible path. Under `~/.general-browser/`: `bookmarks.json`, `reading-list/items.json`, `clips/<id>.png`. Outside: wherever makes sense for the user's own files.
2. Write through the API. Main-process code calls `dataReadText` / `dataWrite` / `fsReadText` / `fsWrite`. UI code calls `window.browser.data.*` / `window.browser.fs.*`. Same primitives underneath.
3. If the main process needs to react immediately (apply a setting, refresh a list), add a dedicated IPC handler alongside the data API. The data API is the substrate. Handlers like `save-settings` are convenience wrappers that also trigger side effects.

## Conventions

- No build tools. UI is vanilla ES modules importing from `./lib/preact.js`.
- Use `html` tagged template literals (htm) instead of JSX.
- Keep it small.
