#!/usr/bin/env bash
set -euo pipefail

echo "=== cargo fmt --check ==="
cargo fmt --check

echo "=== cargo clippy ==="
cargo clippy --workspace --all-targets --all-features -- -D warnings

echo "=== cargo test ==="
cargo test --workspace

echo "=== editor.js bundle sync ==="
diff assets/editor.js apps/desktop/assets/editor.js
diff assets/editor.js apps/mobile/assets/editor.js

echo "=== All checks passed ==="
