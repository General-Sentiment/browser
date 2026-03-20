import { html } from '../lib/preact.js'

export function Suggestions({ items, selectedIdx, onSelect, onHover, listRef }) {
  if (items.length === 0) return null
  return html`
    <ul class="suggestions" id="suggestions-list" role="listbox" ref=${listRef} aria-label="Suggestions">
      ${items.map((h, i) => html`
        <li
          id="suggestion-${i}"
          role="option"
          aria-selected=${i === selectedIdx}
          class="suggestion ${i === selectedIdx ? 'selected' : ''}"
          onClick=${() => onSelect(h)}
          onMouseEnter=${() => onHover(i)}
        >
          <span class="suggestion-title">${h.title}</span>
          ${!h.isDomain && html`<span class="suggestion-url">${h.url}</span>`}
        </li>
      `)}
    </ul>
  `
}
