---
name: GitHub sync authentication
description: GitHub App connections may require refreshing the gh-managed Git credential helper before pushing.
---

When a connected GitHub App still produces an invalid HTTPS credential error, run `gh auth setup-git` and retry the existing HTTPS remote before attempting SSH.

**Why:** The workspace can have a valid `gh` session while Git still uses a stale credential helper entry; SSH may also lack a configured key.

**How to apply:** For repository syncs, inspect `gh auth status`, run `gh auth setup-git` if needed, keep the HTTPS remote, then push and verify `main` is aligned with `origin/main`.