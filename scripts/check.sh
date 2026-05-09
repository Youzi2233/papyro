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

echo "=== UI accessibility check ==="
node scripts/check-ui-a11y.js

echo "=== UI accessibility check self-test ==="
node scripts/check-ui-a11y.js --self-test

echo "=== UI primitive usage check ==="
node scripts/check-ui-primitives.js

echo "=== UI primitive usage check self-test ==="
node scripts/check-ui-primitives.js --self-test

echo "=== UI contrast check ==="
node scripts/check-ui-contrast.js

echo "=== UI contrast check self-test ==="
node scripts/check-ui-contrast.js --self-test

echo "=== desktop resource smoke check ==="
node scripts/check-desktop-resource-smoke.js

echo "=== Markdown style smoke check ==="
node scripts/check-markdown-style-smoke.js

echo "=== Markdown style smoke check self-test ==="
node scripts/check-markdown-style-smoke.js --self-test

echo "=== Tiptap release smoke fixture check ==="
node scripts/check-tiptap-release-smoke.js

echo "=== Tiptap release smoke fixture check self-test ==="
node scripts/check-tiptap-release-smoke.js --self-test

echo "=== Tiptap runtime smoke check ==="
node scripts/check-tiptap-runtime-smoke.js

echo "=== editor Markdown gate ==="
node scripts/check-editor-markdown-gate.js

echo "=== performance fixture generator self-test ==="
node scripts/generate-perf-fixtures.js --self-test

echo "=== performance smoke checker self-test ==="
node scripts/check-perf-smoke.js --self-test

echo "=== performance documentation check ==="
node scripts/check-perf-docs.js

echo "=== performance documentation check self-test ==="
node scripts/check-perf-docs.js --self-test

echo "=== npm run build ==="
npm --prefix js run build

echo "=== npm test ==="
npm --prefix js test

echo "=== editor.js bundle sync ==="
diff assets/editor.js apps/desktop/assets/editor.js
diff assets/editor.js apps/mobile/assets/editor.js

echo "=== editor runtime style sync ==="
diff assets/styles/markdown.css apps/desktop/assets/styles/markdown.css
diff assets/styles/tiptap-chrome.css apps/desktop/assets/styles/tiptap-chrome.css
diff assets/styles/tiptap-chrome-code.css apps/desktop/assets/styles/tiptap-chrome-code.css
diff assets/styles/tiptap-chrome-base.css apps/desktop/assets/styles/tiptap-chrome-base.css
diff assets/styles/tiptap-chrome-command.css apps/desktop/assets/styles/tiptap-chrome-command.css
diff assets/styles/tiptap-chrome-table.css apps/desktop/assets/styles/tiptap-chrome-table.css
diff assets/styles/tiptap-chrome-block.css apps/desktop/assets/styles/tiptap-chrome-block.css
diff assets/styles/markdown.css apps/mobile/assets/styles/markdown.css
diff assets/styles/tiptap-chrome.css apps/mobile/assets/styles/tiptap-chrome.css
diff assets/styles/tiptap-chrome-code.css apps/mobile/assets/styles/tiptap-chrome-code.css
diff assets/styles/tiptap-chrome-base.css apps/mobile/assets/styles/tiptap-chrome-base.css
diff assets/styles/tiptap-chrome-command.css apps/mobile/assets/styles/tiptap-chrome-command.css
diff assets/styles/tiptap-chrome-table.css apps/mobile/assets/styles/tiptap-chrome-table.css
diff assets/styles/tiptap-chrome-block.css apps/mobile/assets/styles/tiptap-chrome-block.css

echo "=== performance trace note ==="
echo "Runtime interaction traces are manual: PAPYRO_PERF=1 cargo run -p papyro-desktop"
echo "Validate captured logs with: node scripts/check-perf-smoke.js target/perf-smoke.log"
echo "See docs/performance-budget.md before changing editor or chrome render paths."

echo "=== All checks passed ==="
