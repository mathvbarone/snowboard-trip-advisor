.PHONY: bootstrap doctor verify-tools

bootstrap:
	./scripts/bootstrap-host.sh

doctor:
	./scripts/check-prereqs.sh

verify-tools:
	./scripts/verify-tools.sh
