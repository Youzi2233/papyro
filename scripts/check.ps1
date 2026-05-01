$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,
        [Parameter(Mandatory = $true)]
        [scriptblock] $Command
    )

    Write-Host "=== $Name ==="
    & $Command
}

function Assert-SameFile {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Left,
        [Parameter(Mandatory = $true)]
        [string] $Right
    )

    $leftHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Left).Hash
    $rightHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Right).Hash

    if ($leftHash -ne $rightHash) {
        throw "$Left and $Right differ"
    }
}

Invoke-Step "cargo fmt --check" { cargo fmt --check }
Invoke-Step "cargo check" { cargo check --workspace --all-features }
Invoke-Step "cargo clippy" { cargo clippy --workspace --all-targets --all-features -- -D warnings }
Invoke-Step "cargo test" { cargo test --workspace }
Invoke-Step "workspace dependency check" { node scripts/check-workspace-deps.js }
Invoke-Step "file line report" { node scripts/report-file-lines.js }
Invoke-Step "file line report self-test" { node scripts/report-file-lines.js --self-test }
Invoke-Step "UI accessibility check" { node scripts/check-ui-a11y.js }
Invoke-Step "UI accessibility check self-test" { node scripts/check-ui-a11y.js --self-test }
Invoke-Step "UI contrast check" { node scripts/check-ui-contrast.js }
Invoke-Step "UI contrast check self-test" { node scripts/check-ui-contrast.js --self-test }
Invoke-Step "Markdown style smoke check" { node scripts/check-markdown-style-smoke.js }
Invoke-Step "Markdown style smoke check self-test" { node scripts/check-markdown-style-smoke.js --self-test }
Invoke-Step "performance fixture generator self-test" { node scripts/generate-perf-fixtures.js --self-test }
Invoke-Step "performance smoke checker self-test" { node scripts/check-perf-smoke.js --self-test }
Invoke-Step "performance documentation check" { node scripts/check-perf-docs.js }
Invoke-Step "performance documentation check self-test" { node scripts/check-perf-docs.js --self-test }
Invoke-Step "npm run build" { npm --prefix js run build }
Invoke-Step "npm test" { npm --prefix js test }

Invoke-Step "editor.js bundle sync" {
    Assert-SameFile "assets/editor.js" "apps/desktop/assets/editor.js"
    Assert-SameFile "assets/editor.js" "apps/mobile/assets/editor.js"
}

Write-Host "=== performance trace note ==="
Write-Host "Runtime interaction traces are manual: `$env:PAPYRO_PERF = '1'; cargo run -p papyro-desktop"
Write-Host "Validate captured logs with: node scripts/check-perf-smoke.js target/perf-smoke.log"
Write-Host "See docs/performance-budget.md before changing editor or chrome render paths."

Write-Host "=== All checks passed ==="
