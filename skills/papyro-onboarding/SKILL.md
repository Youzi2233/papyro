---
name: papyro-onboarding
description: Set up the Papyro development environment, run the app, and verify the workspace is healthy.
---

# Papyro Onboarding

Use this skill when a contributor or AI agent needs to install tools, run Papyro, or verify a fresh checkout.

## Read First

- `README.md`
- `docs/README.md`
- `docs/development-standards.md`

Official installers:

- Rust: `https://rustup.rs/`
- Node.js: `https://nodejs.org/en/download`
- Git: `https://git-scm.com/downloads`
- Dioxus CLI: `https://dioxuslabs.com/learn/0.7/getting_started`

## Required Tools

Install these before running the app:

- Git
- Rust stable through rustup
- Cargo, installed with Rust
- Node.js 20 or newer
- PowerShell on Windows, or Bash on Unix-like systems
- Native build tools for the target OS

Optional but useful:

- Dioxus CLI

## Fresh Machine Setup

Use this section for contributors who do not have Rust or Node installed yet.

### Windows

Install Git:

```powershell
winget install --id Git.Git -e
```

Install Rust with rustup:

```powershell
winget install --id Rustlang.Rustup -e
```

If rustup asks for a toolchain, choose the default stable MSVC toolchain. If the machine does not have Microsoft C++ build tools, install Visual Studio Build Tools with the C++ workload:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e
```

Install Node.js LTS:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Restart the terminal after installation so `PATH` updates are visible.

Verify:

```powershell
git --version
rustc --version
cargo --version
node --version
npm --version
```

### macOS

Install Xcode command line tools:

```bash
xcode-select --install
```

Install Rust with rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Install Node.js 20 or newer with your preferred package manager or the official installer. With Homebrew:

```bash
brew install node
```

Verify:

```bash
git --version
rustc --version
cargo --version
node --version
npm --version
```

### Linux

Install native build dependencies. Debian/Ubuntu example:

```bash
sudo apt update
sudo apt install -y build-essential curl git pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
```

Install Rust with rustup:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Install Node.js 20 or newer with your distribution, NodeSource, Volta, nvm, or the official installer.

Verify:

```bash
git --version
rustc --version
cargo --version
node --version
npm --version
```

### Rust Toolchain Setup

Make sure the stable toolchain is active:

```bash
rustup default stable
rustup update
```

Install Dioxus CLI when a task needs `dx` workflows:

```bash
cargo install dioxus-cli
```

Most Papyro desktop development can still use plain Cargo:

```bash
cargo run -p papyro-desktop
```

## Clone And Prepare The Repository

```bash
git clone https://github.com/Youzi2233/papyro.git
cd papyro
npm --prefix js install
```

Run this once after cloning so the editor dependencies are available.

## First Run

Build the editor bundle before the first app run if `assets/editor.js` is missing or stale:

```bash
npm --prefix js run build
```

Run the desktop app:

```bash
cargo run -p papyro-desktop
```

The mobile entry exists for shared-runtime work, but desktop is the primary development target.

## Health Checks

Quick Rust check:

```bash
cargo check --workspace --all-features
```

Full repository check:

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1
```

Unix-like:

```bash
bash scripts/check.sh
```

If the full suite is too broad for the immediate task, run the smallest relevant check, then say which checks were skipped.

## Troubleshooting Setup

### `rustc` or `cargo` is not recognized

Restart the terminal. If it still fails, confirm rustup's cargo bin directory is on `PATH`:

- Windows: `%USERPROFILE%\.cargo\bin`
- macOS/Linux: `$HOME/.cargo/bin`

### Windows build fails with linker or `link.exe` errors

Install Visual Studio Build Tools with the C++ build workload, then restart the terminal.

### Linux desktop build fails on WebKit or GTK packages

Install the native desktop packages listed in the Linux setup section. Package names vary by distribution, so use the distro equivalent when not on Debian/Ubuntu.

### Node version is too old

Install Node.js 20 or newer, then rerun:

```bash
npm --prefix js install
npm --prefix js run build
```

### Dioxus CLI install is slow

This is normal on a fresh Rust machine. It compiles the CLI from source. It is optional for `cargo run -p papyro-desktop`.

## Editor Bundle

Only edit:

- `js/src/editor.js`
- `js/src/editor-core.js`

Then run:

```bash
npm --prefix js install
npm --prefix js run build
npm --prefix js test
```

Generated bundles in `assets/`, `apps/desktop/assets/`, and `apps/mobile/assets/` must stay synchronized.

## Common Startup Issues

- If desktop assets do not load, check `apps/desktop/assets` and the desktop runtime asset sync in `apps/desktop/src/main.rs`.
- If editor behavior looks stale, rebuild the JS bundle.
- If CI reports file size budget failures, run `node scripts/report-file-lines.js` and split large files before adding more code.
