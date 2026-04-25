#!/usr/bin/env bash
set -euo pipefail

echo "=== cargo fmt --check ==="
cargo fmt --check

echo "=== cargo clippy ==="
cargo clippy --workspace --all-targets --all-features -- -D warnings

echo "=== cargo test ==="
cargo test --workspace

echo "=== All checks passed ==="
