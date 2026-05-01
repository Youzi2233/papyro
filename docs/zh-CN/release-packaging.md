# 桌面端 Release Packaging

[English](../release-packaging.md) | [文档](README.md)

Papyro 当前提供基础桌面端 zip 包。它还不是原生安装器，但可以稳定产出一个给测试者使用的构建产物，里面包含 release 二进制、license、README、关键发布文档、图标资源和 manifest。

## 构建包

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1
```

脚本会先运行：

```powershell
cargo build -p papyro-desktop --release
```

然后写入：

```text
target/dist/papyro-desktop-<os>-<arch>-v<version>/
target/dist/papyro-desktop-<os>-<arch>-v<version>.zip
```

## 包内容

| 内容 | 用途 |
| --- | --- |
| `papyro-desktop(.exe)` | Release 二进制 |
| `LICENSE` | MIT license |
| `README.md`, `README.zh-CN.md` | 项目概览 |
| `docs/release-qa*.md` | 手工 release QA 检查清单 |
| `docs/known-limitations*.md` | 当前产品限制 |
| `assets/icons/` | 打包用平台图标资源 |
| `papyro-release-manifest.json` | 版本、目标平台、commit、构建时间和二进制名称 |

## 选项

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1 -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-desktop.ps1 -TargetName papyro-desktop-windows-x64
```

只有在 `target/release/papyro-desktop(.exe)` 已经对应当前待打包 commit 时，才使用 `-SkipBuild`。

## 当前范围

这个包适合内部测试和手工 QA。MSI、DMG、AppImage、Flatpak 等原生安装器仍是后续工作。
