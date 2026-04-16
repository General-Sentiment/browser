# General Browser

Lightweight Electron browser. Page fills the entire window. All UI is behind Cmd+K.

User data lives in `~/.general-browser/` (settings, history, site rules, and the browser's UI source). See that directory's `AGENTS.md` for the user-facing layout.

## How the UI source works

The overlay UI ships inside the app bundle at `ui/`. On first launch of a packaged build, those files are copied into `~/.general-browser/ui/` and the app reads from there thereafter, so users can edit the files directly, with or without an AI agent.

**Dev mode (`npm start`) reads from this repo's `ui/` directly**, so edits in the source tree render live without any sync step. The user's `~/.general-browser/ui/` is ignored in dev.

When a new version of the app ships with UI changes, the app compares the new built-in files against a manifest of hashes captured at last baseline. The settings view shows a banner when an update is ready; running `/update-ui` in an agent merges upstream changes on top of the user's edits.

## Structure (this repo)

- `ui/`: overlay UI. No build step, plain ES modules with Preact + htm.
  - `index.html`: shell.
  - `app.js`: Preact app (address bar, history).
  - `settings.js`: settings view (site rules, UI source, updates).
  - `style.css`: styles (light/dark, oklch, CSS variables in `:root`).
  - `lib/`: vendored Preact + htm + hooks.
- `sites/`: built-in site rules. Seeded into `~/.general-browser/sites/` on first run.
  - `sites.yaml`: rule definitions (name, enabled, matches, css, js).
  - `youtube/`, `instagram/`, `twitter/`: per-site CSS and JS files.

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

- `matches` uses glob patterns. `*` matches any characters.
- `css` and `js` are file paths relative to the root.
- CSS is injected after page load. Use `!important` to override site styles.
- JS runs in the main world with full DOM access.
- For SPAs, listen for navigation events (pages don't fully reload).
- Prefer CSS-only solutions when possible.

### Adding or editing a site rule

1. Read `sites/sites.yaml` to check if a rule exists for the site.
2. If not, create `sites/<sitename>/style.css` and/or `script.js`.
3. Add a rule entry to `sites/sites.yaml` with the correct matches and file paths.
4. If the rule exists, edit the existing CSS/JS files.

## Conventions

- No build tools. UI is vanilla ES modules importing from `./lib/preact.js`.
- Use `html` tagged template literals (htm) instead of JSX.
- Keep it small.
