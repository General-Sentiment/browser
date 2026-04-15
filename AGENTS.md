# General Browser

Lightweight Electron browser. Page fills the entire window. All UI is behind Cmd+K.

User data lives in `~/.general-browser/` (settings, history, sites, and an optional `sources/` directory for ejected UI). See that directory's `AGENTS.md` for the user-facing layout.

## Structure (this repo)

- `ui/` -- Overlay UI. No build step, plain ES modules with Preact + htm.
  - `index.html` -- Shell.
  - `app.js` -- Preact app (address bar, history).
  - `settings.js` -- Settings view (site rules, source directory, updates).
  - `style.css` -- Styles (light/dark, oklch, CSS variables in :root).
  - `lib/` -- Vendored Preact + htm + hooks.
- `sites/` -- Built-in site rules: custom CSS/JS injected into pages by URL pattern. Seeded into `~/.general-browser/sites/` on first run.
  - `sites.yaml` -- Rule definitions (name, enabled, matches, css, js).
  - `youtube/`, `instagram/`, `twitter/` -- Per-site CSS and JS files.

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

## Applying Updates (/update-ui)

When an `UPDATE.md` file exists in this directory, the browser's built-in files have changed since the user ejected. This file lists which files changed and whether the user modified them.

A machine-readable manifest is also written to `~/.general-browser/pending-update.yml` with this structure:

```yaml
source_dir: /path/to/sources
builtin_dir: /path/to/app
files:
  - path: ui/app.js
    status: modified
    user_modified: true
  - path: ui/style.css
    status: modified
    user_modified: false
```

### For files the user has NOT modified (`user_modified: false`)

- **modified**: Copy the file from `builtin_dir` to `source_dir`. Safe to overwrite.
- **added**: Copy the new file from `builtin_dir` to `source_dir`.
- **deleted**: Delete the file from `source_dir`.

### For files the user HAS modified (`user_modified: true`)

Read both the built-in (new upstream) version and the user's current version. Apply the upstream changes while preserving the user's customizations.

- The user's changes always take priority.
- Understand the intent of the upstream change and integrate it around the user's modifications.
- If both sides changed the same area, keep the user's version and add a comment noting what upstream intended.
- If deleted upstream but user modified, keep the user's file with a comment.

### After applying

Tell the user to click "Mark as Resolved" in the browser settings. This re-baselines the manifest and removes `UPDATE.md`.

Report a summary: files directly updated, files merged, and any needing manual review.
