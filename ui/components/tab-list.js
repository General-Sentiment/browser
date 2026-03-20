import { html } from '../lib/preact.js'

export function TabList({ tabs, activeTabId }) {
  return html`
    <div class="tab-list">
      ${tabs.map(t => html`
        <button
          class="tab ${t.id === activeTabId ? 'active' : ''} ${t.favicon ? 'has-favicon' : ''} ${!t.url ? 'empty' : ''} ${tabs.length === 1 ? 'only' : ''}"
          onClick=${() => { window.browser.switchTab(t.id) }}
        >
          ${t.favicon && html`
            <span class="tab-favicon-wrap">
              <img class="tab-favicon" src=${t.favicon} />
              <span class="tab-favicon-ring"></span>
            </span>
          `}
          <span class="tab-info">
            <span class="tab-title">${t.title || 'New Tab'}</span>
            ${t.url && html`<span class="tab-url">${t.url}</span>`}
          </span>
          <span class="tab-close" onClick=${(e) => { e.stopPropagation(); window.browser.closeTab(t.id) }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </span>
        </button>
      `)}
      ${!tabs.some(t => !t.url) && html`
        <button class="tab tab-new" onClick=${() => { window.browser.newTab() }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        </button>
      `}
    </div>
  `
}
