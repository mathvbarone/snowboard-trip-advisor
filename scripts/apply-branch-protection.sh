#!/bin/bash
# scripts/apply-branch-protection.sh
#
# Apply branch-protection settings to `main` and `pivot/data-transparency`.
# Idempotent: safe to re-run. Requires the `gh` CLI authenticated with a
# token that has repo admin scope.
#
# Settings applied (mirrored in .github/BRANCH_PROTECTION.md):
#   - Require PR before merge
#   - Required status checks: qa, dco (both strict / up-to-date with base)
#   - Required reviews: 1 CODEOWNERS approval, dismiss stale approvals
#   - Conversation resolution required
#   - No force-push, no deletions
#   - enforce_admins: true (prevents silent admin bypass)
#   - Linear history:
#       * main                      → ON  (squash-merge only)
#       * pivot/data-transparency   → OFF (allows weekly `git merge main`)
#
# Re-run after creating new long-lived branches.

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is not installed. See https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Repo: $REPO"
echo "Applying branch protection..."

# apply_protection <branch> <linear_history_bool>
apply_protection() {
  local branch="$1"
  local linear_history="$2"
  echo "  → $branch (linear_history=$linear_history)"
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/$REPO/branches/$branch/protection" \
    --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["quality-gate / qa", "dco"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": $linear_history,
  "required_conversation_resolution": true
}
EOF
}

apply_protection "main" "true"

if gh api "repos/$REPO/branches/pivot/data-transparency" >/dev/null 2>&1; then
  apply_protection "pivot/data-transparency" "false"
else
  echo "  → pivot/data-transparency: branch does not exist, skipping"
fi

echo ""
echo "Done."
echo "Verify at: https://github.com/$REPO/settings/branches"
