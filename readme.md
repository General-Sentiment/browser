# General Browser

A minimal fully modifiable browser with (basically) no interface. One page per window. All controls live behind a single Cmd+K overlay: address bar, history, settings.

**macOS only for now.**

## Philosophy

The entire source ships inside the app. There is no build step, no bundler, no transpiler. The code you see is the code that runs. On first launch the UI is copied into `~/.general-browser/ui/` and the app reads from there. Edit freely.

When the app updates, your modifications don't get overwritten. An LLM-assisted merge reconciles upstream changes with whatever you've done to the source. The codebase evolves like a living thing. Upstream improvements graft onto your local mutations, and the result is software that is partly the thing that was shipped and partly the thing you made it into.

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

All user data lives in `~/.general-browser/`, created on first run:

```
~/.general-browser/
  AGENTS.md          Overview, points to the subdirectory AGENTS.md files
  settings.yml       Preferences (start page, search engine, color mode)
  history.json       Recent browsing history
  window-state.json  Last window size and position
  ui-manifest.json   Baseline hashes used to detect upstream UI changes
  sites/             Site rules (CSS/JS injected by URL pattern)
    AGENTS.md
    sites.yaml
    youtube/, instagram/, twitter/
  ui/                The overlay UI (index.html, app.js, settings.js, style.css, …)
    AGENTS.md
```

Open the folder in an AI coding agent and the `AGENTS.md` files describe how to work with it.

## Site Rules

Includes a built-in [Fence](https://generalsentiment.co/fence/). Site rules let you inject your own CSS and JS into any page. Instead of reaching for a separate ad blocker or extension, you intervene directly. Hide what you don't want, restyle what you do, add behavior where it's missing. The browser is just a thin shell around your preferences.

Rules are defined in `~/.general-browser/sites/sites.yaml` and the actual CSS/JS files live alongside it in `~/.general-browser/sites/`.

The app ships with default rules for YouTube and Instagram. Toggle them on or off from the gear icon in the overlay.

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

File paths are relative to `~/.general-browser/`. Glob patterns for URL matching: `*` matches anything.

## Customizing the UI

The browser's overlay UI lives at `~/.general-browser/ui/`, seeded from the app bundle on first launch. Edit the files directly, or open the folder in an AI coding agent and tell it what you want to change. There is no eject step.

When the app updates and the built-in files change, the settings view shows a banner. Run `/update-ui` in Claude Code to merge upstream changes around your customizations.

### How updates merge

At first launch (and after each applied update) the app records a SHA-256 hash of every built-in UI file in a manifest at `~/.general-browser/ui-manifest.json`. On each launch it re-hashes the current built-in files and compares them against that manifest. For each file that changed upstream, it also checks whether your copy diverged from the original. This gives every file a status of added, modified, or deleted, plus a flag for whether you touched it too.

When you click **Open** on the UI Update banner, the app writes `~/.general-browser/UPDATE.md` (human-readable) and `~/.general-browser/pending-update.yml` (machine-readable) and reveals the directory. Running `/update-ui` in an agent from that directory reads the pending manifest. Files you haven't modified are overwritten directly from the new built-in source. Files you have modified are where the LLM earns its keep: it reads both the new upstream version and your version, understands the intent of each change, and merges them with your modifications taking priority. If both sides changed the same region, your version wins and a comment is left noting what upstream intended.

After the merge, clicking **Mark as Resolved** re-baselines the manifest to the current built-in hashes so the cycle resets cleanly for the next update.

This process is intentionally inexact. What ships in an update is code alongside a description of the change and its intention, and the LLM interprets that intention against whatever your copy has become. Two users whose UIs diverged differently will receive the same update and end up with different results. Features may drift. Behavior may shift in subtle ways across installations. This is closer to how genetic code works: changes are grafted onto a living organism, and the outcome depends on what was already there. Every copy of the browser becomes its own lineage.

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
