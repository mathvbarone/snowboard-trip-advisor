#!/bin/sh
set -eu

for tool in git node npm docker; do
	if command -v "$tool" >/dev/null 2>&1; then
		"$tool" --version
	else
		echo "missing: $tool" >&2
		exit 1
	fi
done

if command -v docker >/dev/null 2>&1; then
	docker buildx version
fi
