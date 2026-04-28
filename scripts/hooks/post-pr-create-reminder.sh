#!/bin/sh
# .claude/settings.json → PostToolUse:Bash hook
#
# Thin wrapper that delegates to post-pr-create-reminder.mjs. The wrapper
# exists so .claude/settings.json's command path (./scripts/hooks/
# post-pr-create-reminder.sh) stays stable even though the implementation
# moved to a node ESM module to support proper unit testing.
#
# Contract + rationale + worktree-resolution logic: see post-pr-create-reminder.mjs.
exec node "$(dirname "$0")/post-pr-create-reminder.mjs"
