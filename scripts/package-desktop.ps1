param(
    [string]$DistRoot = "target/dist",
    [string]$TargetName = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Resolve-WorkspacePath {
    param([string]$Path)
    return (Resolve-Path $Path).Path
}

function Remove-PathInside {
    param(
        [string]$Root,
        [string]$Target
    )

    if (-not (Test-Path $Target)) {
        return
    }

    $resolvedRoot = Resolve-WorkspacePath $Root
    $resolvedTarget = Resolve-WorkspacePath $Target
    if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside ${resolvedRoot}: ${resolvedTarget}"
    }

    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
}

function Package-Version {
    $content = Get-Content "Cargo.toml"
    foreach ($line in $content) {
        if ($line -match '^\s*version\s*=\s*"([^"]+)"') {
            return $Matches[1]
        }
    }

    return "0.0.0"
}

function Current-TargetName {
    $os = if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        "windows"
    } elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)) {
        "macos"
    } elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Linux)) {
        "linux"
    } else {
        "unknown"
    }

    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    return "papyro-desktop-${os}-${arch}"
}

function Git-ShortSha {
    try {
        return (git rev-parse --short HEAD).Trim()
    } catch {
        return "unknown"
    }
}

if ([string]::IsNullOrWhiteSpace($TargetName)) {
    $TargetName = Current-TargetName
}

if (-not $SkipBuild) {
    cargo build -p papyro-desktop --release
}

$version = Package-Version
$distRootPath = Join-Path (Get-Location) $DistRoot
New-Item -ItemType Directory -Force -Path $distRootPath | Out-Null

$packageName = "${TargetName}-v${version}"
$packageDir = Join-Path $distRootPath $packageName
$zipPath = Join-Path $distRootPath "${packageName}.zip"

Remove-PathInside $distRootPath $packageDir
if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

$binaryName = if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
    "papyro-desktop.exe"
} else {
    "papyro-desktop"
}
$binaryPath = Join-Path "target/release" $binaryName
if (-not (Test-Path $binaryPath)) {
    throw "Release binary not found: ${binaryPath}"
}

Copy-Item -Force $binaryPath (Join-Path $packageDir $binaryName)
Copy-Item -Force "LICENSE" (Join-Path $packageDir "LICENSE")
Copy-Item -Force "README.md" (Join-Path $packageDir "README.md")
Copy-Item -Force "README.zh-CN.md" (Join-Path $packageDir "README.zh-CN.md")

$docsDir = Join-Path $packageDir "docs"
New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
Copy-Item -Force "docs/release-qa.md" (Join-Path $docsDir "release-qa.md")
Copy-Item -Force "docs/known-limitations.md" (Join-Path $docsDir "known-limitations.md")
Copy-Item -Force "docs/zh-CN/release-qa.md" (Join-Path $docsDir "release-qa.zh-CN.md")
Copy-Item -Force "docs/zh-CN/known-limitations.md" (Join-Path $docsDir "known-limitations.zh-CN.md")

$assetDir = Join-Path $packageDir "assets"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
Copy-Item -Recurse -Force "assets/icons" (Join-Path $assetDir "icons")

$manifest = [ordered]@{
    name = "papyro-desktop"
    version = $version
    target = $TargetName
    commit = Git-ShortSha
    built_at_utc = [DateTime]::UtcNow.ToString("o")
    binary = $binaryName
    package = Split-Path -Leaf $zipPath
}
$manifest | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $packageDir "papyro-release-manifest.json")

Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

Write-Host "Packaged ${zipPath}"
