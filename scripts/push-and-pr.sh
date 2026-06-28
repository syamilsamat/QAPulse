#!/bin/bash
# Push to fork, open PR to upstream, and auto-merge

GITHUB_TOKEN=$(security find-internet-password -s github.com -w 2>/dev/null)

# Pull rebase in case remote has new commits
git pull --rebase origin main

# Push to fork
git push origin main

# Check if a PR is already open
OPEN_PR_NUMBER=$(curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/Autoraimix/QAPulse/pulls?state=open&head=syamilsamat:main" | \
  python3 -c "import sys,json; prs=json.load(sys.stdin); print(prs[0]['number'] if prs else '')" 2>/dev/null)

if [ -n "$OPEN_PR_NUMBER" ]; then
  echo "Reusing existing PR #$OPEN_PR_NUMBER"
  PR_NUMBER=$OPEN_PR_NUMBER
else
  RESULT=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/Autoraimix/QAPulse/pulls" \
    -d "{
      \"title\": \"Update from syamilsamat/main\",
      \"head\": \"syamilsamat:main\",
      \"base\": \"main\",
      \"body\": \"Sync latest changes from syamilsamat fork.\"
    }")
  PR_NUMBER=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('number',''))" 2>/dev/null)
  echo "PR #$PR_NUMBER opened"
fi

# Merge the PR
if [ -n "$PR_NUMBER" ]; then
  MERGE=$(curl -s -X PUT \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/Autoraimix/QAPulse/pulls/$PR_NUMBER/merge" \
    -d '{"merge_method":"merge"}')
  MERGED=$(echo "$MERGE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('merged','false'))" 2>/dev/null)
  MSG=$(echo "$MERGE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null)
  echo "Merge status: $MERGED — $MSG"
fi
