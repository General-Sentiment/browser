# General Browser

An minimal fully modifiable browser with (basically) no interface. Pages fill the entire window. All controls live behind a single Cmd+K overlay: address bar, tabs, history.

Deeply inspired by [Oryoki](https://github.com/thmsbfft/oryoki), which proved that a browser could be reduced to almost nothing and still be everything you need.

**macOS only for now.**

## Philosophy

The entire source ships inside the app. There is no build step, no bundler, no transpiler. The code you see is the code that runs. You can open the source files and edit them directly.

When the app updates, your modifications don't get overwritten. An LLM-assisted merge reconciles upstream changes with whatever you've done to the source. The codebase evolves like a living thing. Upstream improvements graft onto your local mutations, and the result is software that is partly the thing that was shipped and partly the thing you made it into.

## Usage

Cmd+K (or Cmd+L) opens the overlay. Type a URL or search query, press Enter. Escape closes it. That's the whole interface.

## Shortcuts

| Key           | Action         |
| ------------- | -------------- |
| Cmd+K / Cmd+L | Toggle overlay |
| Cmd+T         | New tab        |
| Cmd+W         | Close tab      |
| Cmd+N         | New window     |
| Cmd+Shift+[   | Previous tab   |
| Cmd+Shift+]   | Next tab       |
| Escape        | Close overlay  |

## Settings

All configuration lives in `~/.browser/settings.yml`, created on first run.

## Site Rules

Includes a built-in [Fence](https://generalsentiment.co/fence/). Site rules let you inject your own CSS and JS into any page. Instead of reaching for a separate ad blocker or extension, you intervene directly. Hide what you don't want, restyle what you do, add behavior where it's missing. The browser is just a thin shell around your preferences.

Rules are defined in `~/.browser/sites.yaml` and the actual CSS/JS files live in `~/.browser/sites/`.

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

File paths are relative to `~/.browser/`. Glob patterns for URL matching: `*` matches anything.

## Ejecting

Click the gear icon in the overlay and choose "Eject" to copy the browser's source files to a directory you control. This copies both the overlay UI and the default site rules. The app loads your copies instead of the built-in ones. Edit freely.

When the app updates and the built-in files change, the settings view shows which files diverged. Run `/update-ui` in Claude Code to merge upstream changes around your customizations.

### How updates merge

At eject time, the app records a SHA-256 hash of every built-in file in a manifest (`~/.browser/eject-manifest.json`). On each launch it re-hashes the built-in files and compares them against that manifest. For each file that changed upstream, it also checks whether your copy diverged from the original. This gives every file a status of added, modified, or deleted, plus a flag for whether you touched it too.

When you run `/update-ui`, the skill reads a machine-readable manifest (`~/.browser/pending-update.yml`) that lists every changed file with its status and conflict flag. Files you haven't modified are overwritten directly from the new built-in source. Files you have modified are where the LLM earns its keep: it reads both the new upstream version and your version, understands the intent of each change, and merges them with your modifications taking priority. If both sides changed the same region, your version wins and a comment is left noting what upstream intended.

After the merge, the manifest is re-baselined to the current built-in hashes, so the cycle resets cleanly for the next update.

This process is intentionally inexact. What ships in an update is code alongside a description of the change and its intention, and the LLM interprets that intention against whatever your codebase has become. Two users who ejected and diverged differently will receive the same update and end up with different results. Features may drift. Behavior may shift in subtle ways across installations. This is closer to how genetic code works: changes are grafted onto a living organism, and the outcome depends on what was already there. Every copy of the browser becomes its own lineage.

## Structure

```
main.js          Electron main process
preload.js       IPC bridge
ui/
  index.html     Shell
  app.js         Preact overlay app
  settings.js    Settings view
  style.css      Styles (light/dark, oklch)
  lib/           Vendored preact + htm + hooks
sites/           Default site rules (youtube, instagram)
```
