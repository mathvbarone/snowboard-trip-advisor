#!/bin/sh
set -eu

echo "Phase-1 bootstrap helper for a clean Ubuntu host."
echo "Authoritative flow: docs/workstation-setup.md"

if ./scripts/check-prereqs.sh; then
	echo "Prereq check passed."
else
	echo "Prereq check failed."
	echo "Fix the missing tools, then re-run ./scripts/check-prereqs.sh."
fi

echo "Follow the phase-1 commands in docs/workstation-setup.md."
echo "After the host is ready, run: make doctor"
echo "Then run: make verify-tools"
