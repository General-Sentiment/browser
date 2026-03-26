import { html, render, useState, useEffect, useRef, useCallback, useMemo } from './lib/preact.js'
import { SettingsView } from './settings.js'
import { Toast } from './components/toast.js'
import { TabList } from './components/tab-list.js'
import { Suggestions } from './components/suggestions.js'
import { SettingsGear } from './components/settings-gear.js'

function App() {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(0)
  const [history, setHistory] = useState([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [blankTab, _setBlankTab] = useState(false)
  const blankTabRef = useRef(false)
  const setBlankTab = (v) => { blankTabRef.current = v; _setBlankTab(v) }
  const [view, _setView] = useState('main')
  const viewRef = useRef('main')
  const setView = (v) => { viewRef.current = v; _setView(v) }
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  function openOverlay() {
    setView('main')
    setSelectedIdx(-1)
    window.browser.getHistory().then(setHistory)
    window.browser.getTabs().then(s => {
      setTabs(s.tabs)
      setActiveTabId(s.activeTabId)
      const active = s.tabs.find(t => t.id === s.activeTabId)
      setQuery(active?.url || '')
    })
  }

  useEffect(() => {
    window.browser.onToggleOverlay(() => {
      setVisible(v => {
        if (v) {
          // If in settings, go back to main and focus input
          if (viewRef.current === 'settings') {
            setView('main')
            setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select() } }, 10)
            return v
          }
          // If input isn't focused, focus it instead of closing
          if (inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
            return v
          }
          // Don't allow closing if on a blank tab
          if (blankTabRef.current) return v
          window.browser.setOverlayVisible(false)
          return false
        }
        window.browser.setOverlayVisible(true)
        openOverlay()
        return true
      })
    })
    window.browser.onShowOverlay(() => {
      setBlankTab(true)
      setVisible(true)
      setView('main')
      openOverlay()
      setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select() } }, 50)
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
    window.browser.onShowSettings(() => {
      setVisible(true)
      setView('settings')
      window.browser.setOverlayVisible(true)
    })
    window.browser.onToast((msg) => {
      setToast(null)
      setTimeout(() => {
        setToast(msg)
        clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2000)
      }, 10)
    })
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && visible && !blankTab) {
        setVisible(false)
        window.browser.setOverlayVisible(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, blankTab])

  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => { inputRef.current.focus(); inputRef.current.select() }, 10)
    }
  }, [visible])

  const hideOverlay = useCallback(() => {
    if (blankTab) return
    setVisible(false)
    window.browser.setOverlayVisible(false)
  }, [blankTab])

  const dismissAndNavigate = useCallback((url) => {
    setBlankTab(false)
    window.browser.navigate(url)
    setVisible(false)
    window.browser.setOverlayVisible(false)
  }, [])

  const domainMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q.includes('/') || q.includes(' ')) return null
    const seen = new Set()
    for (const h of history) {
      try {
        const host = new URL(h.url).hostname.replace(/^www\./, '')
        if (seen.has(host)) continue
        seen.add(host)
        if (host.startsWith(q)) {
          return { url: 'https://' + host, title: host, isDomain: true }
        }
      } catch {}
    }
    return null
  }, [query, history])

  const isTyping = useMemo(() => {
    const q = query.trim()
    if (!q) return false
    const active = tabs.find(t => t.id === activeTabId)
    return q !== (active?.url || '')
  }, [query, tabs, activeTabId])

  const filteredHistory = useMemo(() => {
    if (!isTyping) return []
    const q = query.trim()
    const items = q
      ? history.filter(h =>
          h.url.toLowerCase().includes(q.toLowerCase()) ||
          h.title.toLowerCase().includes(q.toLowerCase())
        ).slice(0, 8)
      : []
    if (domainMatch) {
      const filtered = items.filter(h => {
        try { return new URL(h.url).hostname.replace(/^www\./, '') !== new URL(domainMatch.url).hostname } catch { return true }
      })
      return [domainMatch, ...filtered.slice(0, 7)]
    }
    return items
  }, [query, history, domainMatch, isTyping])

  useEffect(() => {
    if (domainMatch && filteredHistory.length > 0) {
      setSelectedIdx(0)
    } else {
      setSelectedIdx(-1)
    }
  }, [domainMatch, filteredHistory.length])

  useEffect(() => {
    if (!listRef.current) return
    if (selectedIdx < 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    } else {
      const el = listRef.current.children[selectedIdx]
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        // Ensure top padding is visible when at the top-most item
        if (selectedIdx === filteredHistory.length - 1) {
          listRef.current.scrollTop = 0
        }
      }
    }
  }, [selectedIdx, filteredHistory.length])

  const submit = useCallback(() => {
    if (!query.trim()) return
    dismissAndNavigate(query.trim())
  }, [query, dismissAndNavigate])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      if (blankTab) return
      setVisible(false)
      window.browser.setOverlayVisible(false)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filteredHistory.length - 1))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Tab') {
      if (selectedIdx >= 0 && selectedIdx < filteredHistory.length) {
        e.preventDefault()
        setQuery(filteredHistory[selectedIdx].url)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const url = selectedIdx >= 0 && selectedIdx < filteredHistory.length
        ? filteredHistory[selectedIdx].url
        : query.trim()
      if (!url) return
      if (e.shiftKey) {
        window.browser.newTab()
        setTimeout(() => { window.browser.navigate(url) }, 100)
        setVisible(false)
        window.browser.setOverlayVisible(false)
      } else if (selectedIdx >= 0) {
        dismissAndNavigate(url)
      } else {
        submit()
      }
    }
  }, [filteredHistory, selectedIdx, query, submit, blankTab, dismissAndNavigate])

  return html`
    <${Toast} message=${toast} />
    ${!visible ? null : html`
    <div class="overlay-backdrop" onClick=${hideOverlay}>
      <div class="overlay" onClick=${e => e.stopPropagation()}>

        ${view === 'settings'
          ? html`<${SettingsView} onBack=${() => setView('main')} />`
          : html`
            <div class="overlay-body">
              <${SettingsGear} onClick=${() => setView('settings')} />

              <div class="overlay-top">
                <${TabList} tabs=${tabs} activeTabId=${activeTabId} />
              </div>

              <div class="overlay-bottom">
                <div class="overlay-input-wrap">
                  <${Suggestions}
                    items=${filteredHistory}
                    selectedIdx=${selectedIdx}
                    onSelect=${(h) => dismissAndNavigate(h.url)}
                    onHover=${(i) => setSelectedIdx(i)}
                    listRef=${listRef}
                  />
                  <input
                    ref=${inputRef}
                    class="url-input"
                    type="text"
                    placeholder="Search or enter a URL..."
                    value=${query}
                    onInput=${e => { setQuery(e.target.value) }}
                    onKeyDown=${onKeyDown}
                    role="combobox"
                    aria-expanded=${filteredHistory.length > 0}
                    aria-controls="suggestions-list"
                    aria-activedescendant=${selectedIdx >= 0 ? `suggestion-${selectedIdx}` : undefined}
                    aria-autocomplete="list"
                    aria-label="Search or enter URL"
                  />
                </div>
              </div>
            </div>
          `
        }
      </div>
    </div>
    `}
  `
}

render(html`<${App} />`, document.getElementById('app'))
