use anyhow::Result;
use flume::Sender;
use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
}

pub struct WorkspaceWatcher {
    _watcher: RecommendedWatcher,
}

pub fn start_watching(path: &Path, tx: Sender<WatchEvent>) -> Result<WorkspaceWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if let Some(e) = watch_event_from_notify_event(event) {
            let _ = tx.send(e);
        }
    })?;

    watcher.watch(path, RecursiveMode::Recursive)?;
    Ok(WorkspaceWatcher { _watcher: watcher })
}

fn watch_event_from_notify_event(event: Event) -> Option<WatchEvent> {
    match event.kind {
        EventKind::Create(_) => event.paths.first().map(|p| WatchEvent::Created(p.clone())),
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
            match (event.paths.first(), event.paths.get(1)) {
                (Some(from), Some(to)) => Some(WatchEvent::Renamed {
                    from: from.clone(),
                    to: to.clone(),
                }),
                _ => event.paths.first().map(|p| WatchEvent::Modified(p.clone())),
            }
        }
        EventKind::Modify(_) => event.paths.first().map(|p| WatchEvent::Modified(p.clone())),
        EventKind::Remove(_) => event.paths.first().map(|p| WatchEvent::Deleted(p.clone())),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, CreateKind, DataChange, RemoveKind};

    fn notify_event(kind: EventKind, paths: &[&str]) -> Event {
        paths
            .iter()
            .fold(Event::new(kind), |event, path| event.add_path(path.into()))
    }

    #[test]
    fn maps_create_modify_and_remove_events() {
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Create(CreateKind::File),
                &["note.md"],
            )),
            Some(WatchEvent::Created(PathBuf::from("note.md"))),
        );
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                &["note.md"],
            )),
            Some(WatchEvent::Modified(PathBuf::from("note.md"))),
        );
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Remove(RemoveKind::File),
                &["note.md"],
            )),
            Some(WatchEvent::Deleted(PathBuf::from("note.md"))),
        );
    }

    #[test]
    fn maps_rename_when_both_paths_are_available() {
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["old.md", "new.md"],
            )),
            Some(WatchEvent::Renamed {
                from: PathBuf::from("old.md"),
                to: PathBuf::from("new.md"),
            }),
        );
    }

    #[test]
    fn falls_back_to_modified_for_incomplete_rename() {
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["old.md"],
            )),
            Some(WatchEvent::Modified(PathBuf::from("old.md"))),
        );
    }

    #[test]
    fn ignores_events_without_paths_and_non_refresh_events() {
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &[],
            )),
            None,
        );
        assert_eq!(
            watch_event_from_notify_event(notify_event(
                EventKind::Access(AccessKind::Open(AccessMode::Read)),
                &["note.md"],
            )),
            None,
        );
    }
}
