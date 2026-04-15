---
name: update-ui
description: Apply a pending browser UI update, merging upstream changes with user customizations
---

# /update-ui

Read the `AGENTS.md` file in the current directory for full instructions under "Applying Updates". Then read `UPDATE.md` for the list of changed files. The machine-readable manifest is at `~/.general-browser/pending-update.yml`.

Follow this workflow:

1. **Describe changes** — Summarize what changed upstream and why, so the user understands what the update includes before anything is modified.
2. **Identify conflicts** — Diff the upstream changes against the user's customized files. Flag any files where both upstream and the user have made changes. Describe each potential conflict clearly.
3. **Wait for confirmation** — Do NOT apply any changes yet. Present the summary and conflicts, then ask the user for explicit confirmation before proceeding.
4. **Apply the update** — Only after the user confirms, merge the changes following the rules in AGENTS.md. Preserve user modifications wherever possible.
5. **Report** — Tell the user the update is complete and to click "Mark as Resolved" in browser settings.
