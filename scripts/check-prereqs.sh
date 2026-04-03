#!/bin/sh
set -eu

echo "OS: $(uname -s)"
echo "ARCH: $(uname -m)"

missing_tools=""
for tool in git curl tar make; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		if [ -n "$missing_tools" ]; then
			missing_tools="$missing_tools $tool"
		else
			missing_tools="$tool"
		fi
	fi
done

if [ -n "$missing_tools" ]; then
	echo "missing required tools: $missing_tools" >&2
	exit 1
fi

echo "basic prerequisites present"
