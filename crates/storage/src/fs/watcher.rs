use anyhow::Result;
use flume::Sender;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;

#[derive(Debug, Clone)]
pub enum WatchEvent {
    Created(std::path::PathBuf),
    Modified(std::path::PathBuf),
    Deleted(std::path::PathBuf),
    Renamed {
        from: std::path::PathBuf,
        to: std::path::PathBuf,
    },
}

pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
}

pub fn start_watching(path: &Path, tx: Sender<WatchEvent>) -> Result<WorkspaceWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        let watch_event = match event.kind {
            EventKind::Create(_) => event.paths.first().map(|p| WatchEvent::Created(p.clone())),
            EventKind::Modify(_) => event.paths.first().map(|p| WatchEvent::Modified(p.clone())),
            EventKind::Remove(_) => event.paths.first().map(|p| WatchEvent::Deleted(p.clone())),
            _ => None,
        };
        if let Some(e) = watch_event {
            let _ = tx.send(e);
        }
    })?;

    watcher.watch(path, RecursiveMode::Recursive)?;
    Ok(WorkspaceWatcher { _watcher: watcher })
}
