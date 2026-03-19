import { html, useState, useEffect } from './lib/preact.js'

export function SettingsView({ onBack }) {
  const [settings, setSettings] = useState(null)
  const [uiPaths, setUIPaths] = useState(null)
  const [updateStatus, setUpdateStatus] = useState(null)
  const [siteRules, setSiteRules] = useState(null)
  const [message, setMessage] = useState('')

  function refresh() {
    window.browser.getSettings().then(setSettings)
    window.browser.getUIPaths().then(setUIPaths)
    window.browser.getUpdateStatus().then(setUpdateStatus)
    window.browser.getSiteRules().then(setSiteRules)
  }

  useEffect(() => { refresh() }, [])

  const pickAndEject = async () => {
    const dir = await window.browser.pickDirectory()
    if (!dir) return
    setMessage('Ejecting...')
    const result = await window.browser.ejectUI(dir)
    if (result.success) {
      setMessage(`Ejected ${result.fileCount} files. Reloading...`)
      refresh()
    } else {
      setMessage('Error: ' + result.error)
    }
  }

  const resetToDefault = async () => {
    const result = await window.browser.resetSourceDir()
    if (result.success) {
      setMessage('Reset to built-in UI. Reloading...')
      refresh()
    }
  }

  const prepareUpdate = async () => {
    const result = await window.browser.prepareUpdate()
    if (result.success) {
      setMessage(`Update prepared at ${result.path}. Open Claude Code in your source directory and run /update-ui`)
    } else {
      setMessage(result.error)
    }
  }

  const finalizeUpdate = async () => {
    const result = await window.browser.finalizeUpdate()
    if (result.success) {
      setMessage('Update finalized.')
      setUpdateStatus({ pending: false })
    }
  }

  if (!settings || !uiPaths) return html`<div class="settings-view"><div class="settings-loading">Loading...</div></div>`

  return html`
    <div class="settings-view">
      <div class="settings-header">
        <button class="settings-back" onClick=${onBack} aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <span class="settings-title">Settings</span>
      </div>

      <div class="settings-body">
        <div class="settings-field">
          <label class="settings-label">Source Directory</label>
          <p class="settings-hint">Eject the UI source files to a directory you control. Edit them freely — the app will load your version instead of the built-in UI.</p>

          ${uiPaths.isCustom
            ? html`
              <div class="settings-value">${settings.source_dir}</div>
              <div class="settings-actions">
                <button class="settings-btn" onClick=${() => window.browser.openUIDir()}>Open UI Directory</button>
                <button class="settings-btn" onClick=${pickAndEject}>Re-eject...</button>
                <button class="settings-btn" onClick=${resetToDefault}>Reset to Default</button>
              </div>
            `
            : html`
              <div class="settings-value-default">Using built-in package UI <span class="settings-value-path">${uiPaths.builtin}</span></div>
              <div class="settings-actions">
                <button class="settings-btn" onClick=${() => window.browser.openUIDir()}>Open UI Directory</button>
                <button class="settings-btn settings-btn-primary" onClick=${pickAndEject}>Eject UI...</button>
              </div>
            `
          }
        </div>

        <div class="settings-field">
          <label class="settings-label">Site Rules</label>
          <p class="settings-hint">Inject custom CSS and JS into sites. Files live in ~/.browser/sites/.</p>

          ${siteRules?.rules?.length > 0
            ? html`
              <ul class="rules-list">
                ${siteRules.rules.map((rule, i) => html`
                  <li class="rule-item">
                    <label class="rule-toggle">
                      <input type="checkbox" checked=${rule.enabled} onChange=${async () => {
                        const updated = { ...siteRules, rules: siteRules.rules.map((r, j) =>
                          j === i ? { ...r, enabled: !r.enabled } : r
                        )}
                        await window.browser.saveSiteRules(updated)
                        setSiteRules(updated)
                      }} />
                    </label>
                    <div class="rule-info">
                      <span class="rule-name">${rule.name}</span>
                      <span class="rule-matches">${rule.matches.join(', ')}</span>
                    </div>
                    <button class="rule-remove" onClick=${async () => {
                      const updated = { ...siteRules, rules: siteRules.rules.filter((_, j) => j !== i) }
                      await window.browser.saveSiteRules(updated)
                      setSiteRules(updated)
                    }} aria-label="Remove">×</button>
                  </li>
                `)}
              </ul>
            `
            : html`<div class="settings-value-default">No site rules configured</div>`
          }

          <div class="settings-actions">
            <button class="settings-btn settings-btn-primary" onClick=${async () => {
              const name = 'New Rule'
              const rule = { name, enabled: true, matches: ['*://example.com/*'], css: [], js: [] }
              const updated = { ...siteRules, rules: [...(siteRules?.rules || []), rule] }
              await window.browser.saveSiteRules(updated)
              setSiteRules(updated)
              setMessage('Added rule. Edit ~/.browser/sites.json to configure matches and file paths.')
            }}>Add Rule</button>
            <button class="settings-btn" onClick=${() => window.browser.openSitesDir()}>Open Sites Folder</button>
            <button class="settings-btn" onClick=${() => window.browser.openSitesConfig()}>Edit Config</button>
          </div>
        </div>

        ${updateStatus?.pending && html`
          <div class="settings-field">
            <label class="settings-label">UI Update Available</label>
            <p class="settings-hint">The built-in UI has changed since you ejected. Files that you modified will need to be merged.</p>
            <ul class="update-file-list">
              ${updateStatus.files.map(f => html`
                <li class="update-file-item">
                  <span class="update-file-path">${f.path}</span>
                  <span class="update-file-status ${f.status}">${f.status}</span>
                  ${f.user_modified && html`<span class="update-file-badge">you modified</span>`}
                </li>
              `)}
            </ul>
            <div class="settings-actions">
              <button class="settings-btn settings-btn-primary" onClick=${prepareUpdate}>Prepare Update</button>
              <button class="settings-btn" onClick=${finalizeUpdate}>Mark as Resolved</button>
            </div>
          </div>
        `}

        ${message && html`<div class="settings-message">${message}</div>`}
      </div>
    </div>
  `
}
