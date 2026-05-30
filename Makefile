.PHONY: build test fmt fmt-check lint deny audit clean deploy-local deploy-testnet help

## build: Compile all contracts
build:
	stellar contract build

## test: Run all tests
test:
	cargo test

## fmt: Format source code
fmt:
	cargo fmt

## fmt-check: Check formatting without modifying files
fmt-check:
	cargo fmt --check

## lint: Run Clippy linter (warnings as errors)
lint:
	cargo clippy --all-targets -- -D warnings

## check: Type-check without building
check:
	cargo check --all

## deny: Check dependency licenses and advisories
deny:
	cargo deny check

## audit: Run cargo-audit for known vulnerability advisories
audit:
	cargo audit

## clean: Remove build artifacts
clean:
	cargo clean

## deploy-local: Deploy contracts to local network
deploy-local:
	./scripts/deploy-local.sh

## deploy-testnet: Deploy contracts to Stellar testnet
deploy-testnet:
	./scripts/deploy-testnet.sh

## install-hooks: Install git pre-commit hooks
install-hooks:
	cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
	@echo "pre-commit hook installed"

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/^## //' | column -t -s ':'
