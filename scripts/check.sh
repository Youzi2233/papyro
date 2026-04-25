#!/usr/bin/env bash
set -euo pipefail

echo "=== cargo fmt --check ==="
cargo fmt --check

echo "=== cargo check ==="
cargo check --workspace --all-features

echo "=== cargo clippy ==="
cargo clippy --workspace --all-targets --all-features -- -D warnings

echo "=== cargo test ==="
cargo test --workspace

echo "=== workspace dependency check ==="
node scripts/check-workspace-deps.js

echo "=== file line report ==="
node scripts/report-file-lines.js

echo "=== npm run build ==="
npm --prefix js run build

echo "=== editor.js bundle sync ==="
diff assets/editor.js apps/desktop/assets/editor.js
diff assets/editor.js apps/mobile/assets/editor.js

echo "=== All checks passed ==="
