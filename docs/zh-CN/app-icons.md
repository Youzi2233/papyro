# App Icons

[English](../app-icons.md) | [文档](README.md)

Papyro 把共享品牌资源放在 `assets/`，把生成出来的平台图标资源放在 `assets/icons/`。

## 源资源

- `assets/logo.png` 是标准正方形 logo 源图。
- `assets/favicon.ico` 是标准 Windows/web icon 源文件。
- `apps/desktop/assets/` 和 `apps/mobile/assets/` 保存各端运行时会用到的资源副本。

## 生成目标

| 目标 | 路径 | 说明 |
| --- | --- | --- |
| 通用 PNG 尺寸 | `assets/icons/png/` | 16、32、48、64、128、256、512、1024 px |
| Windows | `assets/icons/windows/papyro.ico` | 从标准多尺寸 `.ico` 复制 |
| macOS | `assets/icons/macos/Papyro.iconset/` | 可在 macOS 上作为 `iconutil -c icns` 的输入目录 |
| Linux | `assets/icons/linux/hicolor/*/apps/papyro.png` | 遵循 hicolor icon theme 目录布局 |

## 重新生成

替换 `assets/logo.png` 或 `assets/favicon.ico` 后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-app-icons.ps1
```

脚本保持确定性，并且只写入 `assets/icons/`。
