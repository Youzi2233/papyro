param(
    [string]$LogoPath = "assets/logo.png",
    [string]$WindowsIconPath = "assets/favicon.ico",
    [string]$OutputRoot = "assets/icons"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function Save-PngIcon {
    param(
        [System.Drawing.Image]$Source,
        [int]$Size,
        [string]$TargetPath
    )

    $targetDir = Split-Path -Parent $TargetPath
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $bitmap.SetResolution($Source.HorizontalResolution, $Source.VerticalResolution)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($Source, 0, 0, $Size, $Size)
    $bitmap.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}

$resolvedLogo = Resolve-Path $LogoPath
$resolvedWindowsIcon = Resolve-Path $WindowsIconPath
$source = [System.Drawing.Image]::FromFile($resolvedLogo)

try {
    New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
    Copy-Item -Force $resolvedLogo (Join-Path $OutputRoot "papyro-source.png")
    $windowsIconTarget = Join-Path $OutputRoot "windows/papyro.ico"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $windowsIconTarget) | Out-Null
    Copy-Item -Force $resolvedWindowsIcon $windowsIconTarget

    $sizes = @(16, 32, 48, 64, 128, 256, 512, 1024)
    foreach ($size in $sizes) {
        Save-PngIcon $source $size (Join-Path $OutputRoot "png/papyro-$size.png")
        Save-PngIcon $source $size (Join-Path $OutputRoot "linux/hicolor/${size}x${size}/apps/papyro.png")
    }

    $macosMap = @(
        @{ Name = "icon_16x16.png"; Size = 16 },
        @{ Name = "icon_16x16@2x.png"; Size = 32 },
        @{ Name = "icon_32x32.png"; Size = 32 },
        @{ Name = "icon_32x32@2x.png"; Size = 64 },
        @{ Name = "icon_128x128.png"; Size = 128 },
        @{ Name = "icon_128x128@2x.png"; Size = 256 },
        @{ Name = "icon_256x256.png"; Size = 256 },
        @{ Name = "icon_256x256@2x.png"; Size = 512 },
        @{ Name = "icon_512x512.png"; Size = 512 },
        @{ Name = "icon_512x512@2x.png"; Size = 1024 }
    )

    foreach ($entry in $macosMap) {
        Save-PngIcon $source $entry.Size (Join-Path $OutputRoot "macos/Papyro.iconset/$($entry.Name)")
    }

    Write-Host "Generated app icons in $OutputRoot"
} finally {
    $source.Dispose()
}
