---
name: update-ui
description: Apply a pending browser UI update, merging upstream changes with user customizations
---

# /update-ui — Apply a pending browser UI update

Read the pending update manifest at `~/.browser/pending-update.yml`.

The manifest contains:
- `source_dir`: the user's ejected UI directory (their customized copy)
- `builtin_dir`: the app's built-in UI directory (the new upstream version)
- `files`: list of changed files, each with `path`, `status`, and `user_modified`

## For each file in the manifest:

### Files the user has NOT modified (`user_modified: false`)

- **modified**: Copy the file from `builtin_dir` to `source_dir`. Safe to overwrite — the user never touched it.
- **added**: Copy the new file from `builtin_dir` to `source_dir`.
- **deleted**: Delete the file from `source_dir`.

### Files the user HAS modified (`user_modified: true`)

Read both the built-in (new upstream) version and the user's current version. Apply the upstream changes while preserving the user's customizations.

Rules:
- The user's changes always take priority.
- Understand the *intent* of the upstream change and integrate it around the user's modifications.
- If both sides changed the same code, keep the user's version and add a brief comment noting what upstream intended, so the user can reconcile later.
- If a file was deleted upstream but the user modified it, keep the user's file with a comment noting upstream removed it.

## After applying all changes

Run the `finalize-update` IPC call or tell the user to click "Mark as Resolved" in the browser settings. This updates the manifest baseline so future update checks start fresh.

Report a summary: how many files were directly updated, how many were merged, and any that need manual review.
