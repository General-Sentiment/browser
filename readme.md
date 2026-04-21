# General Browser

A minimal fully modifiable browser with (basically) no interface. One page per window. Everything lives behind a single Cmd+K overlay: address bar, history, settings.

Built with [General App](https://generalsentiment.co/app/).

**macOS only for now.**

## Stack

Electron shell. Preact + htm (no JSX). Plain JavaScript, native ES modules. No build step.

## Philosophy

The source ships with the app. No build step, no bundler, no transpiler. The code you see is the code that runs. On first launch it copies into `~/.general-browser/ui/`. Edit freely.

When the app updates, your edits stay put. An LLM merges upstream changes around whatever you've done. The codebase evolves like a living thing. Upstream improvements graft onto your local mutations. The result is software that is partly what shipped and partly what you made it into.

## Usage

Cmd+K (or Cmd+L) opens the overlay. Type a URL or search query, press Enter. Escape closes it. That's the whole interface.

## Shortcuts

| Key                   | Action         |
| --------------------- | -------------- |
| Cmd+K / Cmd+L / Cmd+; | Toggle overlay |
| Cmd+,                 | Settings       |
| Cmd+T / Cmd+N         | New window     |
| Cmd+W                 | Close window   |
| Cmd+R                 | Reload         |
| Cmd+[                 | Back           |
| Cmd+]                 | Forward        |
| Escape                | Close overlay  |

## User data

Everything lives in `~/.general-browser/`, created on first run:

```
~/.general-browser/
  AGENTS.md          Overview for AI agents
  settings.yml       Start page, search engine, color mode
  history.json       Recent browsing history
  window-state.json  Last window size and position
  ui-manifest.json   Hashes used to detect upstream UI changes
  sites/             Site rules (CSS/JS injected by URL pattern)
    AGENTS.md
    sites.yaml
    youtube/, instagram/, twitter/
  ui/                The overlay UI (index.html, app.js, settings.js, style.css, …)
    AGENTS.md
```

Open the folder in an AI coding agent. The `AGENTS.md` files explain the rest.

## Site Rules

Site rules inject CSS and JS into pages you visit. They follow the [Fence](https://generalsentiment.co/fence/) pattern: hide what pulls you in, restyle what stays, redirect algorithmic feeds to chronological ones. Skip the ad blocker. Intervene directly.

The browser ships with rules for YouTube, Instagram, and X (Twitter) out of the box. Each one strips the algorithmic feed and related UI, and where possible redirects you to the chronological timeline. Toggle them from the gear icon in the overlay.

Rules live in `~/.general-browser/sites/sites.yaml`. CSS and JS sit alongside them in `~/.general-browser/sites/`.

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

Paths are relative to `~/.general-browser/`. In match patterns, `*` matches anything.

## Plugin architecture

Two CRUD namespaces. Same surface. Different scope. Page webviews have no preload, so no access.

- `window.browser.data.*` — scoped to `~/.general-browser/`. Relative paths only. Use for app-managed state: bookmarks, reading lists, saved images, annotations.
- `window.browser.fs.*` — unscoped. Absolute paths or `~/…`. Use when a feature needs files outside the data dir: an Obsidian vault, Desktop, an external project.

```js
// App state
await window.browser.data.writeJSON("bookmarks.json", [{ url, title }]);
const { ok, data } = await window.browser.data.readJSON("bookmarks.json");

const res = await fetch(iconUrl);
await window.browser.data.writeBlob(
  "bookmarks/icons/foo.png",
  await res.blob(),
);

// Markdown with YAML frontmatter, anywhere on disk
await window.browser.fs.writeMarkdown("~/Notes/today.md", {
  frontmatter: { title: "Today", tags: ["log"] },
  body: "# Today\n\nNotes…\n",
});
const { data: doc } = await window.browser.fs.readMarkdown("~/Notes/today.md");
```

There is no privileged internal path. Settings, history, window state, site rules, UI manifest, update flow all run on the same primitives. Ask an agent to build a bookmarking feature and it gets the same access the core code has. The API is the plugin architecture. You build on the same surface the browser is built on.

Every call returns `{ ok, data?, error? }`. `data.*` rejects absolute paths and `..`. `fs.*` rejects relative paths. Full surface on each: `read`, `write`, `readJSON`, `writeJSON`, `readBytes`, `writeBytes`, `readBlob`, `writeBlob`, `readMarkdown`, `writeMarkdown`, `delete`, `exists`, `list`.

`readMarkdown` parses a leading `---`-fenced YAML block and returns `{ frontmatter, body }`. Files with no fence read as `{ frontmatter: {}, body: <file> }`. `writeMarkdown({ frontmatter, body })` emits the fence only when `frontmatter` has keys. Round-trips through js-yaml, so comments inside YAML are not preserved.

`delete` moves the path to the OS trash (macOS Trash, Windows Recycle Bin, Linux trash) so mistakes are recoverable.

## Customizing the UI

The overlay UI lives at `~/.general-browser/ui/`, seeded from the app bundle on first launch. Edit the files directly. Or open the folder in an agent and tell it what to change.

When the bundled UI changes upstream, settings shows a banner. Run `/update-ui` in Claude Code (or your agent of choice) to merge the changes around your edits.

### How updates merge

The app keeps a manifest of SHA-256 hashes at `~/.general-browser/ui-manifest.json`. At each launch it re-hashes the bundled files and compares them. Files get tagged added, modified, or deleted. It also checks whether your copy diverged, so conflicts are marked.

Clicking **Open** on the banner writes `UPDATE.md` (human) and `pending-update.yml` (machine), then reveals the directory. Run `/update-ui` in an agent. Files you didn't touch get overwritten from the bundle. Files you did touch are where the LLM earns its keep. It reads both versions, understands the intent, and merges. Your edits win. If both sides changed the same region, your version stays and a comment notes what upstream intended.

Click **Mark as Resolved** to re-baseline the manifest. The cycle resets for the next update.

This process is inexact by design. Updates ship code alongside a description of the intent. The LLM reads that intent against whatever your copy has become. Two users diverge differently, get the same update, and land in different places. Features drift. Behavior shifts. Closer to genetic code than software: changes graft onto a living organism, and the outcome depends on what was already there. Every copy becomes its own lineage.

## Structure

```
main.js          Electron main process
preload.js       IPC bridge
AGENTS.md        Guidance for agents editing this repo
assets/          App icon
ui/
  index.html     Shell
  app.js         Preact overlay app
  settings.js    Settings view
  error.html     Error page for failed loads
  style.css      Styles (light/dark, oklch)
  lib/           Vendored preact + htm + hooks
sites/           Built-in site rules, seeded into ~/.general-browser/sites/ on first run
```

---

Deeply inspired by [Oryoki](https://github.com/thmsbfft/oryoki).
