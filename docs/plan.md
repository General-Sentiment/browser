2026-03-18

# Lightweight Electron Browser

## Concept
A minimal browser that renders web pages with zero UI chrome. The page fills
the entire window. All browser controls are hidden behind a Cmd+K overlay
(like Spotlight). The goal is something you can Show Package Contents on,
open in Claude Code, and start hacking.

## Core Behavior
- Window opens to a blank page or last session URL
- Cmd+K toggles a floating address bar overlay (search/URL input)
- Typing a URL navigates, typing text searches (default engine)
- Escape or clicking outside dismisses the overlay
- The overlay also shows tabs and history for quick switching

## Tab Support
- Cmd+T: new tab
- Cmd+W: close tab
- Cmd+Shift+[ / ]: switch tabs
- Tab list visible in the Cmd+K overlay as a row/strip
- Tabs are minimal — just title + favicon, shown only when Cmd+K is open

## History
- Simple in-memory + file-persisted history (JSON)
- Shown as suggestions in the Cmd+K overlay when typing
- Cmd+L or arrow keys to navigate history within the overlay

## Settings (~/.browser/settings.yml)
- All configuration lives in a single YAML file
- Created with sensible defaults + commented examples on first run
- Main process reads on startup, no live reload needed

### Default settings.yml
```yaml
# ~/.browser/settings.yml

# Start page (blank if omitted)
# home: https://example.com

# Default search engine ($s = search terms)
search: https://www.google.com/search?q=$s

# Chrome extensions — explicit paths (in addition to ~/.browser/extensions/)
extensions:
  # - /path/to/my-extension
  # - ~/src/my-chrome-ext
```

## Chrome Extensions (Dev Mode)
- Support loading unpacked Chrome extensions via Electron's
  session.defaultSession.loadExtension()
- Two ways to load extensions (both work, additive):
  1. Drop extension folders into ~/.browser/extensions/ (auto-discovered)
  2. List explicit paths in settings.yml under `extensions:`
- Load all on startup
- No extension management UI

## Architecture

```
browser/
├── package.json
├── main.js              # Electron main process
├── preload.js           # Preload script (IPC bridge)
├── ui/
│   ├── index.html       # Single HTML shell
│   ├── app.js           # Preact app (no build, ES modules)
│   ├── style.css        # Minimal styles
│   └── lib/             # Preact + htm + hooks (vendor, from assets/)
│       ├── preact.module.js
│       ├── hooks.module.js
│       ├── htm.module.js
│       └── preact.js    # Re-export barrel
├── docs/
│   └── plan.md          # This file
└── CLAUDE.md            # Context for hacking

~/.browser/                  # User data dir
├── settings.yml             # All configuration
├── extensions/              # Drop-in extensions directory
└── history.json             # Persisted history
```

## No Build
- UI is plain HTML + ES modules
- Preact + htm for templating (tagged template literals, no JSX transform)
- All vendor deps shipped in ui/lib/ (already have them in assets/)
- Import maps or relative imports in the HTML

## Tech Stack
- Electron (latest stable)
- Preact + hooks + htm (vendored, no npm for client code)
- No bundler, no transpiler, no framework CLI

## Main Process (main.js)
- Creates BrowserWindow with no frame (titleBarStyle: 'hidden' on mac)
- Loads ui/index.html as the chrome/overlay UI
- Uses a BrowserView (or webContentsView) for actual page rendering
- BrowserView fills the entire window
- The overlay HTML is shown above the BrowserView when Cmd+K is pressed
- IPC channels: navigate, go-back, go-forward, new-tab, close-tab,
  switch-tab, get-history, get-tabs

## Preload Script (preload.js)
- Exposes a minimal API via contextBridge:
  - browser.navigate(url)
  - browser.back() / browser.forward()
  - browser.newTab() / browser.closeTab() / browser.switchTab(id)
  - browser.onNavigate(callback)
  - browser.getHistory()
  - browser.getTabs()

## UI (app.js)
- Preact app renders only the Cmd+K overlay
- Overlay: text input + tab strip + history/suggestions list
- Listens for Cmd+K globally to toggle visibility
- Everything else is transparent/invisible — the page shows through

## Principles
- < 500 lines of JS total for v1
- One config file: ~/.browser/settings.yml
- No abstractions that don't pay for themselves
- If you can read it in one sitting, it's the right size
