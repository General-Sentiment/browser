# browser

A lightweight Electron browser with no interface. Pages fill the entire window. All controls — address bar, tabs, history — live behind a single Cmd+K overlay.

Deeply inspired by [Oryoki](https://github.com/thmsbfft/oryoki), which proved that a browser could be reduced to almost nothing and still be everything you need.

## Usage

```
npm install
npm start
```

Cmd+K (or Cmd+L) opens the overlay. Type a URL or search query, press Enter. Escape closes it. That's the whole interface.

## Shortcuts

| Key | Action |
|-----|--------|
| Cmd+K / Cmd+L | Toggle overlay |
| Cmd+T | New tab |
| Cmd+W | Close tab |
| Cmd+N | New window |
| Cmd+Shift+[ | Previous tab |
| Cmd+Shift+] | Next tab |
| Escape | Close overlay |

## Settings

All configuration lives in `~/.browser/settings.yml`, created on first run.

```yaml
search: https://www.google.com/search?q=$s
# source_dir: /path/to/custom-ui
```

## Site Rules

Inject custom CSS and JS into any site. Rules live in `~/.browser/sites.json`:

```json
{
  "rules": [
    {
      "name": "YouTube - Hide Shorts",
      "enabled": true,
      "matches": ["*://www.youtube.com/*"],
      "css": ["sites/youtube/style.css"],
      "js": ["sites/youtube/script.js"]
    }
  ]
}
```

File paths are relative to `~/.browser/`. Drop your CSS/JS in `~/.browser/sites/` and configure matches using glob patterns (`*` matches anything). Manage rules from the gear icon in the overlay.

## Hackable UI

The overlay UI is plain HTML, CSS, and ES modules — no build step. Preact + htm for rendering, vendored in `ui/lib/`.

Click the gear icon in the overlay to open settings. From there you can eject the UI source files to a directory you control. The app will load your copy instead of the built-in one. Edit freely — it's your browser now.

When the app updates and the built-in UI changes, the settings view shows which files diverged. Run `/update-ui` in Claude Code to merge upstream changes around your customizations.

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
```
