use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

fn main() -> io::Result<()> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let workspace_root = manifest_dir.join("../..");
    let source_assets = workspace_root.join("assets");
    let target_assets = manifest_dir.join("assets");

    fs::create_dir_all(&target_assets)?;
    sync_asset(&source_assets, &target_assets, "favicon.ico")?;
    sync_asset(&source_assets, &target_assets, "logo.png")?;

    Ok(())
}

fn sync_asset(source_dir: &Path, target_dir: &Path, file_name: &str) -> io::Result<()> {
    let source = source_dir.join(file_name);
    let target = target_dir.join(file_name);

    println!("cargo:rerun-if-changed={}", source.display());

    let bytes = fs::read(&source)?;
    if fs::read(&target).ok().as_deref() != Some(bytes.as_slice()) {
        fs::write(target, bytes)?;
    }

    Ok(())
}
