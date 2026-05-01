# Desktop Release Packaging

[简体中文](zh-CN/release-packaging.md) | [Documentation](README.md)

Papyro currently ships a basic desktop zip package. This is not a native installer yet, but it gives testers a repeatable artifact with the release binary, license, README, key release docs, icon assets, and a manifest.

## Build A Package

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1
```

The script runs:

```powershell
cargo build -p papyro-desktop --release
```

Then it writes:

```text
target/dist/papyro-desktop-<os>-<arch>-v<version>/
target/dist/papyro-desktop-<os>-<arch>-v<version>.zip
```

## Package Contents

| Item | Purpose |
| --- | --- |
| `papyro-desktop(.exe)` | Release binary |
| `LICENSE` | MIT license |
| `README.md`, `README.zh-CN.md` | Project overview |
| `docs/release-qa*.md` | Manual release QA checklist |
| `docs/known-limitations*.md` | Current product limitations |
| `assets/icons/` | Platform icon assets for packaging |
| `papyro-release-manifest.json` | Version, target, commit, build time, and binary name |

## Options

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1 -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1 -TargetName papyro-desktop-windows-x64
```

Use `-SkipBuild` only when `target/release/papyro-desktop(.exe)` already matches the commit being packaged.

## Current Scope

This package is suitable for internal testing and manual QA. Native installers such as MSI, DMG, AppImage, or Flatpak remain future work.
