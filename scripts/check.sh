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

echo "=== file line report self-test ==="
node scripts/report-file-lines.js --self-test

echo "=== performance smoke checker self-test ==="
node scripts/check-perf-smoke.js --self-test

echo "=== npm run build ==="
npm --prefix js run build

echo "=== npm test ==="
npm --prefix js test

echo "=== editor.js bundle sync ==="
diff assets/editor.js apps/desktop/assets/editor.js
diff assets/editor.js apps/mobile/assets/editor.js

echo "=== performance trace note ==="
echo "Runtime interaction traces are manual: PAPYRO_PERF=1 cargo run -p papyro-desktop"
echo "Validate captured logs with: node scripts/check-perf-smoke.js target/perf-smoke.log"
echo "See docs/performance-budget.md before changing editor or chrome render paths."

echo "=== All checks passed ==="
