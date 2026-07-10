#!/bin/bash
# Push to fork (origin) and directly to Autoraimix/QAPulse (upstream).
#
# Autoraimix/QAPulse went private at some point, which detached this repo
# from its fork network (syamilsamat/QAPulse now reports fork:false on
# GitHub's API). The old flow — open a cross-repo PR via REST API and
# auto-merge — silently no-ops now, most likely because the Keychain-stored
# GITHUB_TOKEN used for that API call lacks 'repo' scope for private repos.
# Plain git push still works against upstream (confirmed via dry-run), so
# skip the PR dance entirely and push directly to both remotes.
set -e

# Pull rebase in case origin has new commits
git pull --rebase origin main

# Reconcile with upstream before pushing (merge, not rebase — upstream may
# have its own independent commits, e.g. from other collaborators).
git fetch upstream
git merge upstream/main --no-edit

# Push to both remotes
git push origin main
git push upstream main
