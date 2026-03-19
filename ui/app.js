import { html, render, useState, useEffect, useRef, useCallback } from './lib/preact.js'
import { SettingsView } from './settings.js'

function App() {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(0)
  const [history, setHistory] = useState([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [blankTab, setBlankTab] = useState(false)
  const [view, setView] = useState('main')
  const inputRef = useRef(null)
  const listRef = useRef(null)

  function openOverlay() {
    setView('main')
    setSelectedIdx(0)
    window.browser.getHistory().then(setHistory)
    window.browser.getTabs().then(s => {
      setTabs(s.tabs)
      setActiveTabId(s.activeTabId)
      const active = s.tabs.find(t => t.id === s.activeTabId)
      setQuery(active?.url || '')
    })
  }

  // Listen for overlay toggle from main process
  useEffect(() => {
    window.browser.onToggleOverlay(() => {
      setVisible(v => {
        const next = !v
        window.browser.setOverlayVisible(next)
        if (next) openOverlay()
        return next
      })
    })
    window.browser.onShowOverlay(() => {
      setBlankTab(true)
      setVisible(true)
      openOverlay()
    })
    window.browser.onHideOverlay(() => {
      setBlankTab(false)
      setVisible(false)
    })
    window.browser.onStateUpdate(state => {
      setTabs(state.tabs)
      setActiveTabId(state.activeTabId)
      const active = state.tabs.find(t => t.id === state.activeTabId)
      setBlankTab(!active || !active.url)
    })
  }, [])

  // Auto-focus and select all when overlay opens
  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => { inputRef.current.focus(); inputRef.current.select() }, 10)
    }
  }, [visible])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const hideOverlay = useCallback(() => {
    if (blankTab) return
    setVisible(false)
    window.browser.setOverlayVisible(false)
  }, [blankTab])

  const filteredHistory = query.trim()
    ? history.filter(h =>
        h.url.toLowerCase().includes(query.toLowerCase()) ||
        h.title.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : history.slice(0, 8)

  const submit = useCallback(() => {
    if (!query.trim()) return
    setBlankTab(false)
    window.browser.navigate(query.trim())
    setVisible(false)
    window.browser.setOverlayVisible(false)
  }, [query])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setBlankTab(false)
      setVisible(false)
      window.browser.setOverlayVisible(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filteredHistory.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredHistory.length > 0 && selectedIdx < filteredHistory.length && !query.includes('://') && !query.includes('.')) {
        const item = filteredHistory[selectedIdx]
        setBlankTab(false)
        window.browser.navigate(item.url)
        setVisible(false)
        window.browser.setOverlayVisible(false)
      } else {
        submit()
      }
    }
  }, [filteredHistory, selectedIdx, query, submit])

  if (!visible) return null

  return html`
    <div class="overlay-backdrop" onClick=${hideOverlay}>
      <div class="overlay" onClick=${e => e.stopPropagation()}>

        <div class="tab-strip">
          ${tabs.map(t => html`
            <button
              class="tab ${t.id === activeTabId ? 'active' : ''}"
              onClick=${() => { window.browser.switchTab(t.id) }}
            >
              ${t.favicon && html`<img class="tab-favicon" src=${t.favicon} />`}
              <span class="tab-title">${t.title || 'New Tab'}</span>
              <span class="tab-close" onClick=${(e) => { e.stopPropagation(); window.browser.closeTab(t.id) }}>×</span>
            </button>
          `)}
          <button class="tab tab-new" onClick=${() => { window.browser.newTab(); }}>+</button>
          <button class="settings-gear" onClick=${() => setView(v => v === 'main' ? 'settings' : 'main')} aria-label="Settings">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 1.5h3l.4 1.8.7.3 1.6-.9 2.1 2.1-.9 1.6.3.7 1.8.4v3l-1.8.4-.3.7.9 1.6-2.1 2.1-1.6-.9-.7.3-.4 1.8h-3l-.4-1.8-.7-.3-1.6.9-2.1-2.1.9-1.6-.3-.7L.5 9.5v-3l1.8-.4.3-.7-.9-1.6 2.1-2.1 1.6.9.7-.3.4-1.8z" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
        </div>

        ${view === 'settings'
          ? html`<${SettingsView} onBack=${() => setView('main')} />`
          : html`
            <input
              ref=${inputRef}
              class="url-input"
              type="text"
              placeholder="Search or enter URL..."
              value=${query}
              onInput=${e => { setQuery(e.target.value); setSelectedIdx(0) }}
              onKeyDown=${onKeyDown}
              role="combobox"
              aria-expanded=${filteredHistory.length > 0}
              aria-controls="suggestions-list"
              aria-activedescendant=${filteredHistory.length > 0 ? `suggestion-${selectedIdx}` : undefined}
              aria-autocomplete="list"
              aria-label="Search or enter URL"
            />

            ${filteredHistory.length > 0 && html`
              <ul class="suggestions" id="suggestions-list" role="listbox" ref=${listRef} aria-label="Suggestions">
                ${filteredHistory.map((h, i) => html`
                  <li
                    id="suggestion-${i}"
                    role="option"
                    aria-selected=${i === selectedIdx}
                    class="suggestion ${i === selectedIdx ? 'selected' : ''}"
                    onClick=${() => { setBlankTab(false); window.browser.navigate(h.url); setVisible(false); window.browser.setOverlayVisible(false) }}
                    onMouseEnter=${() => setSelectedIdx(i)}
                  >
                    <span class="suggestion-title">${h.title}</span>
                    <span class="suggestion-url">${h.url}</span>
                  </li>
                `)}
              </ul>
            `}
          `
        }
      </div>
    </div>
  `
}

render(html`<${App} />`, document.getElementById('app'))
