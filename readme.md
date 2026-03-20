# General Browser

A lightweight Electron browser with no interface. Pages fill the entire window. All controls live behind a single Cmd+K overlay: address bar, tabs, history.

Deeply inspired by [Oryoki](https://github.com/thmsbfft/oryoki), which proved that a browser could be reduced to almost nothing and still be everything you need.

## Usage

```
npm install
npm start
```

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

```yaml
search: https://www.google.com/search?q=$s
```

## Site Rules

Inject custom CSS and JS into any site. Rules are defined in `~/.browser/sites.yaml` and the actual CSS/JS files live in `~/.browser/sites/`.

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
