import { html } from '../lib/preact.js'

export function Toast({ message }) {
  if (!message) return null
  return html`<div class="toast">${message}</div>`
}
