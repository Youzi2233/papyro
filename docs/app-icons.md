# App Icons

[简体中文](zh-CN/app-icons.md) | [Documentation](README.md)

Papyro keeps shared brand assets in `assets/` and generated platform icon assets in `assets/icons/`.

## Source Assets

- `assets/logo.png` is the canonical square logo source.
- `assets/favicon.ico` is the canonical Windows/web icon source.
- `apps/desktop/assets/` and `apps/mobile/assets/` keep runtime copies used by each app shell.

## Generated Targets

| Target | Path | Notes |
| --- | --- | --- |
| Shared PNG sizes | `assets/icons/png/` | 16, 32, 48, 64, 128, 256, 512, and 1024 px |
| Windows | `assets/icons/windows/papyro.ico` | Copied from the canonical multi-size `.ico` |
| macOS | `assets/icons/macos/Papyro.iconset/` | Input folder for `iconutil -c icns` on macOS |
| Linux | `assets/icons/linux/hicolor/*/apps/papyro.png` | Follows the hicolor icon theme layout |

## Regenerate

Run this after replacing `assets/logo.png` or `assets/favicon.ico`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-app-icons.ps1
```

The script is intentionally deterministic and only writes under `assets/icons/`.
