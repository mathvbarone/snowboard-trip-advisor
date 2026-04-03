# Workstation Setup

## Scope

This document is the operator entrypoint for the initial clean-Ubuntu bootstrap flow for Snowboard Trip Advisor development.
The authoritative platform and security guidance lives in `/home/math/Projects/home-lab/docs/specs/` and `/home/math/Projects/home-lab/docs/runbooks/`.

## Phase 1

Run the following commands on a clean Ubuntu host:

```bash
sudo apt-get update
sudo apt-get install -y git curl tar make
curl https://mise.run | sh
eval "$("$HOME/.local/bin/mise" activate bash)"
mise use -g node@22.14.0
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
make doctor
make verify-tools
```

## Notes

- `make doctor` maps to `./scripts/check-prereqs.sh`.
- `make verify-tools` maps to `./scripts/verify-tools.sh`.
- `docker buildx version` is expected to work before `make verify-tools` passes.
- Kubernetes, GitOps, and Cloudflare-specific tooling are not installed in this phase.
