use std::path::{Path, PathBuf};

use papyro_ui::commands::OpenMarkdownTarget;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MarkdownOpenRequest {
    markdown_paths: Vec<PathBuf>,
}

impl MarkdownOpenRequest {
    pub fn from_paths<I, P>(paths: I) -> Self
    where
        I: IntoIterator<Item = P>,
        P: AsRef<Path>,
    {
        let mut markdown_paths = Vec::new();
        for path in paths {
            let path = path.as_ref();
            if !is_markdown_path(path) {
                continue;
            }

            let path = absolutize_open_path(path);
            if !markdown_paths.iter().any(|seen| seen == &path) {
                markdown_paths.push(path);
            }
        }

        Self { markdown_paths }
    }

    pub fn is_empty(&self) -> bool {
        self.markdown_paths.is_empty()
    }

    pub fn paths(&self) -> &[PathBuf] {
        &self.markdown_paths
    }

    pub fn into_paths(self) -> Vec<PathBuf> {
        self.markdown_paths
    }

    pub(crate) fn into_targets(self) -> Vec<OpenMarkdownTarget> {
        self.markdown_paths
            .into_iter()
            .map(|path| OpenMarkdownTarget { path })
            .collect()
    }
}

#[derive(Clone)]
pub struct MarkdownOpenRequestSender {
    sender: flume::Sender<MarkdownOpenRequest>,
}

#[derive(Clone)]
pub struct MarkdownOpenRequestReceiver {
    receiver: flume::Receiver<MarkdownOpenRequest>,
}

pub fn markdown_open_request_channel() -> (MarkdownOpenRequestSender, MarkdownOpenRequestReceiver) {
    let (sender, receiver) = flume::unbounded();
    (
        MarkdownOpenRequestSender { sender },
        MarkdownOpenRequestReceiver { receiver },
    )
}

impl MarkdownOpenRequestSender {
    pub fn send_paths<I, P>(&self, paths: I) -> bool
    where
        I: IntoIterator<Item = P>,
        P: AsRef<Path>,
    {
        self.send(MarkdownOpenRequest::from_paths(paths))
    }

    pub fn send(&self, request: MarkdownOpenRequest) -> bool {
        if request.is_empty() {
            return false;
        }

        self.sender.send(request).is_ok()
    }
}

impl MarkdownOpenRequestReceiver {
    pub(crate) async fn recv(&self) -> Result<MarkdownOpenRequest, flume::RecvError> {
        self.receiver.recv_async().await
    }
}

pub(crate) fn markdown_open_request_from_paths<I, P>(paths: I) -> MarkdownOpenRequest
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    MarkdownOpenRequest::from_paths(paths)
}

pub(crate) fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn absolutize_open_path(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|current_dir| current_dir.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_open_request_filters_and_absolutizes_paths() {
        let current_dir = std::env::current_dir().unwrap();
        let request = markdown_open_request_from_paths([
            PathBuf::from("notes/a.md"),
            PathBuf::from("notes/b.MARKDOWN"),
            PathBuf::from("notes/image.png"),
        ]);

        assert_eq!(
            request.paths(),
            vec![
                current_dir.join("notes/a.md"),
                current_dir.join("notes/b.MARKDOWN")
            ]
        );
    }

    #[test]
    fn markdown_open_request_deduplicates_paths_in_order() {
        let current_dir = std::env::current_dir().unwrap();
        let request = MarkdownOpenRequest::from_paths([
            PathBuf::from("notes/a.md"),
            PathBuf::from("notes/a.md"),
            PathBuf::from("notes/b.md"),
        ]);

        assert_eq!(
            request.paths(),
            vec![
                current_dir.join("notes/a.md"),
                current_dir.join("notes/b.md")
            ]
        );
    }

    #[test]
    fn markdown_open_request_exports_targets() {
        let current_dir = std::env::current_dir().unwrap();
        let targets = MarkdownOpenRequest::from_paths([PathBuf::from("notes/a.md")]).into_targets();

        assert_eq!(
            targets,
            vec![OpenMarkdownTarget {
                path: current_dir.join("notes/a.md")
            }]
        );
    }

    #[test]
    fn markdown_open_request_sender_skips_empty_requests() {
        let (sender, receiver) = markdown_open_request_channel();

        assert!(!sender.send_paths([PathBuf::from("notes/image.png")]));
        assert!(receiver.receiver.is_empty());
    }

    #[test]
    fn markdown_open_request_sender_enqueues_markdown_requests() {
        let current_dir = std::env::current_dir().unwrap();
        let (sender, receiver) = markdown_open_request_channel();

        assert!(sender.send_paths([PathBuf::from("notes/a.md")]));

        let request = receiver.receiver.try_recv().unwrap();
        assert_eq!(request.paths(), vec![current_dir.join("notes/a.md")]);
    }
}
