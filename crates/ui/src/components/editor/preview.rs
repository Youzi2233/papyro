#[cfg(test)]
use super::document_cache::DocumentDerivedCacheState;
use super::document_cache::{
    CachedPreview, CachedPreviewStatus, DocumentCacheKey, DocumentDerivedCache, PreviewCacheKey,
};
use crate::commands::AppCommands;
use crate::components::primitives::{InlineAlert, InlineAlertTone};
use crate::context::EditorServices;
use crate::i18n::{i18n_for, use_i18n};
use crate::perf::{perf_timer, trace_preview_render};
use dioxus::prelude::*;
use papyro_core::{models::AppLanguage, DocumentSnapshot};
use papyro_editor::performance::PreviewPolicy;
use papyro_editor::renderer::CodeHighlightTheme;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const PREVIEW_RENDER_TIMEOUT: Duration = Duration::from_secs(2);
const PREVIEW_LINK_BRIDGE_SCRIPT: &str = r#"
    const handler = (event) => {
        const target = event.target;
        const element = target instanceof Element ? target : target?.parentElement;
        if (!element) return;
        const anchor = element.closest(".mn-preview a[href]");
        if (!anchor) return;

        event.preventDefault();
        event.stopPropagation();
        dioxus.send(anchor.getAttribute("href") || "");
    };
    document.addEventListener("click", handler, true);
    await new Promise(() => {});
"#;

#[component]
pub(super) fn PreviewLinkBridge(commands: AppCommands) -> Element {
    use_effect(move || {
        let mut eval = document::eval(PREVIEW_LINK_BRIDGE_SCRIPT);
        let commands = commands.clone();
        spawn(async move {
            while let Ok(url) = eval.recv::<String>().await {
                commands.open_external_url.call(url);
            }
        });
    });

    rsx! {}
}

#[component]
pub(super) fn PreviewPane(
    active_document: Option<DocumentSnapshot>,
    workspace_path: Option<PathBuf>,
    editor_services: EditorServices,
    highlight_theme: CodeHighlightTheme,
) -> Element {
    let i18n = use_i18n();
    let document_cache = use_context::<DocumentDerivedCache>();
    let mut preview_state = use_signal(|| None::<PreviewRenderState>);
    let effect_cache = document_cache.clone();
    let services = editor_services;

    use_effect(use_reactive(
        (&active_document, &workspace_path, &highlight_theme),
        move |(document, workspace_path, highlight_theme)| {
            let Some(document) = document else {
                preview_state.set(None);
                return;
            };
            let document_key = DocumentCacheKey::from_snapshot(&document);
            let key = PreviewCacheKey::new(document_key, highlight_theme);

            if let Some(preview) = effect_cache.borrow().preview(&key) {
                preview_state.set(Some(PreviewRenderState {
                    key: Some(key),
                    preview,
                }));
                return;
            }

            let input = PreviewRenderInput::from_document(
                key.clone(),
                &document,
                workspace_path.clone(),
                services,
                highlight_theme,
            );
            preview_state.set(Some(PreviewRenderState {
                key: Some(key.clone()),
                preview: preview_pending(&document),
            }));

            let mut preview_state = preview_state;
            let effect_cache = effect_cache.clone();
            spawn(async move {
                let result = render_preview_async(input).await;
                if !preview_result_matches_current(preview_state.peek().as_ref(), &key) {
                    return;
                }

                if result.preview.status == CachedPreviewStatus::Ready {
                    effect_cache
                        .borrow_mut()
                        .insert_preview(key.clone(), result.preview.clone());
                }
                preview_state.set(Some(result));
            });
        },
    ));

    let key = active_document
        .as_ref()
        .map(DocumentCacheKey::from_snapshot)
        .map(|key| PreviewCacheKey::new(key, highlight_theme));
    let rendered_preview = resolve_preview(
        &document_cache,
        key.as_ref(),
        preview_state.read().as_ref(),
        active_document.as_ref(),
    );

    let notice = preview_notice(i18n.language(), &rendered_preview);
    let preview_scroll_key = active_document.as_ref().map(|document| {
        (
            document.tab_id.clone(),
            document.revision,
            rendered_preview.status,
        )
    });
    let preview_tab_id = active_document
        .as_ref()
        .map(|document| document.tab_id.clone())
        .unwrap_or_default();
    let preview_revision = active_document
        .as_ref()
        .map(|document| document.revision)
        .unwrap_or_default();

    use_effect(use_reactive((&preview_scroll_key,), move |(key,)| {
        let Some((tab_id, revision, _status)) = key else {
            return;
        };

        document::eval(&attach_preview_scroll_script(&tab_id, revision));
    }));

    rsx! {
        div { class: "mn-preview-shell",
            if let Some(message) = notice {
                InlineAlert {
                    message: message.to_string(),
                    tone: preview_notice_tone(&rendered_preview),
                    class_name: "mn-preview-notice".to_string(),
                }
            }
            if rendered_preview.policy.live_preview_enabled {
                div {
                    class: "mn-preview-scroll",
                    "data-tab-id": "{preview_tab_id}",
                    "data-revision": "{preview_revision}",
                    article {
                        class: "mn-preview",
                        dangerous_inner_html: "{rendered_preview.html}",
                    }
                }
            } else {
                div {
                    class: "mn-preview-scroll mn-preview-paused",
                    "data-tab-id": "{preview_tab_id}",
                    "data-revision": "{preview_revision}",
                    "Live preview is paused for this large document."
                }
            }
        }
    }
}

fn attach_preview_scroll_script(tab_id: &str, revision: u64) -> String {
    let tab_id_json = serde_json::to_string(tab_id).unwrap_or_else(|_| "\"\"".to_string());
    let revision_json = serde_json::to_string(&revision).unwrap_or_else(|_| "0".to_string());

    format!(
        r#"
        const tabId = {tab_id_json};
        const revision = String({revision_json});
        const attach = () => {{
            const scroller = Array
                .from(document.querySelectorAll(".mn-preview-scroll[data-tab-id]"))
                .find((element) =>
                    element.dataset.tabId === tabId &&
                    element.dataset.revision === revision
                );

            if (scroller && window.papyroEditor?.attachPreviewScroll) {{
                window.papyroEditor.attachPreviewScroll(tabId, scroller);
            }}
            if (scroller && window.papyroEditor?.renderPreviewMermaid) {{
                window.papyroEditor.renderPreviewMermaid(scroller);
            }}
        }};

        if (typeof requestAnimationFrame === "function") {{
            requestAnimationFrame(attach);
        }} else {{
            setTimeout(attach, 0);
        }}
        "#,
    )
}

#[derive(Debug, Clone, PartialEq)]
struct PreviewRenderState {
    key: Option<PreviewCacheKey>,
    preview: CachedPreview,
}

struct PreviewRenderInput {
    key: PreviewCacheKey,
    tab_id: String,
    revision: u64,
    content: Arc<str>,
    note_path: PathBuf,
    workspace_path: Option<PathBuf>,
    highlight_theme: CodeHighlightTheme,
    render_html_with_highlight_theme: fn(&str, bool, CodeHighlightTheme) -> String,
}

impl PreviewRenderInput {
    fn from_document(
        key: PreviewCacheKey,
        document: &DocumentSnapshot,
        workspace_path: Option<PathBuf>,
        editor_services: EditorServices,
        highlight_theme: CodeHighlightTheme,
    ) -> Self {
        Self {
            key,
            tab_id: document.tab_id.clone(),
            revision: document.revision,
            content: document.content.clone(),
            note_path: document.path.clone(),
            workspace_path,
            highlight_theme,
            render_html_with_highlight_theme: editor_services
                .render_markdown_html_with_highlight_theme,
        }
    }
}

async fn render_preview_async(input: PreviewRenderInput) -> PreviewRenderState {
    let key = input.key.clone();
    let byte_len = input.content.len();
    let result = tokio::time::timeout(
        PREVIEW_RENDER_TIMEOUT,
        tokio::task::spawn_blocking(move || {
            render_preview_for_content(
                input.tab_id.as_str(),
                input.revision,
                input.content.as_ref(),
                input.note_path.as_path(),
                input.workspace_path.as_deref(),
                input.highlight_theme,
                input.render_html_with_highlight_theme,
            )
        }),
    )
    .await;

    let preview = match result {
        Ok(Ok(preview)) => preview,
        Ok(Err(error)) => {
            tracing::warn!(error = %error, "preview render failed");
            preview_failed(byte_len)
        }
        Err(_) => {
            tracing::warn!(
                bytes = byte_len,
                timeout_ms = PREVIEW_RENDER_TIMEOUT.as_millis(),
                "preview render timed out"
            );
            preview_failed(byte_len)
        }
    };

    PreviewRenderState {
        key: Some(key),
        preview,
    }
}

fn resolve_preview(
    document_cache: &DocumentDerivedCache,
    key: Option<&PreviewCacheKey>,
    state: Option<&PreviewRenderState>,
    document: Option<&DocumentSnapshot>,
) -> CachedPreview {
    if let Some(preview) = key.and_then(|key| document_cache.borrow().preview(key)) {
        return preview;
    }

    if let Some(state) = state.filter(|state| state.key.as_ref() == key) {
        return state.preview.clone();
    }

    preview_placeholder(document)
}

fn render_preview_for_content(
    tab_id: &str,
    revision: u64,
    content: &str,
    note_path: &Path,
    workspace_path: Option<&Path>,
    highlight_theme: CodeHighlightTheme,
    render_html_with_highlight_theme: fn(&str, bool, CodeHighlightTheme) -> String,
) -> CachedPreview {
    let started_at = perf_timer();
    let policy = PreviewPolicy::for_len(content.len());
    let html = if policy.live_preview_enabled {
        render_preview_html(
            content,
            policy.code_highlighting_enabled,
            note_path,
            workspace_path,
            highlight_theme,
            render_html_with_highlight_theme,
        )
    } else {
        String::new()
    };

    trace_preview_render(
        tab_id,
        revision,
        policy.byte_len,
        policy.code_highlighting_enabled,
        policy.live_preview_enabled,
        started_at,
    );

    CachedPreview {
        html,
        policy,
        status: CachedPreviewStatus::Ready,
    }
}

fn render_preview_html(
    content: &str,
    highlight_code: bool,
    note_path: &Path,
    workspace_path: Option<&Path>,
    highlight_theme: CodeHighlightTheme,
    render_html_with_highlight_theme: fn(&str, bool, CodeHighlightTheme) -> String,
) -> String {
    let Some(workspace_path) = workspace_path else {
        return render_html_with_highlight_theme(content, highlight_code, highlight_theme);
    };

    papyro_editor::renderer::render_markdown_html_with_image_resolver_and_highlight_theme(
        content,
        highlight_code,
        Some(&|url| local_preview_image_url(url, workspace_path, note_path)),
        highlight_theme,
    )
}

fn local_preview_image_url(url: &str, workspace_path: &Path, note_path: &Path) -> Option<String> {
    let target = url.trim();
    if !is_rewritable_relative_url(target) {
        return None;
    }

    let (path_part, _suffix) = split_url_path_suffix(target);
    if path_part.is_empty() {
        return None;
    }

    let workspace_path = normalize_lexical(workspace_path);
    let note_dir = note_path.parent().unwrap_or_else(|| Path::new(""));
    let target_path = normalize_lexical(&note_dir.join(path_part));
    if !target_path.starts_with(&workspace_path) {
        return None;
    }

    Some(file_url(&target_path))
}

fn split_url_path_suffix(target: &str) -> (&str, &str) {
    let suffix_start = target
        .char_indices()
        .find(|(_, character)| matches!(character, '?' | '#'))
        .map(|(index, _)| index)
        .unwrap_or(target.len());

    (&target[..suffix_start], &target[suffix_start..])
}

fn is_rewritable_relative_url(target: &str) -> bool {
    if target.is_empty() || target.starts_with('/') || target.starts_with('#') {
        return false;
    }

    let first_segment_end = target
        .char_indices()
        .find(|(_, character)| matches!(character, '/' | '\\' | '?' | '#'))
        .map(|(index, _)| index)
        .unwrap_or(target.len());

    !target[..first_segment_end].contains(':')
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized
}

fn file_url(path: &Path) -> String {
    let mut normalized = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) && !normalized.starts_with('/') {
        normalized = format!("/{normalized}");
    }

    format!("file://{}", encode_file_url_path(&normalized))
}

fn encode_file_url_path(path: &str) -> String {
    let mut encoded = String::with_capacity(path.len());
    for character in path.chars() {
        match character {
            ' ' => encoded.push_str("%20"),
            '"' => encoded.push_str("%22"),
            '#' => encoded.push_str("%23"),
            '%' => encoded.push_str("%25"),
            '?' => encoded.push_str("%3F"),
            '<' => encoded.push_str("%3C"),
            '>' => encoded.push_str("%3E"),
            _ => encoded.push(character),
        }
    }
    encoded
}

fn preview_placeholder(document: Option<&DocumentSnapshot>) -> CachedPreview {
    let byte_len = document
        .map(|document| document.content.len())
        .unwrap_or_default();
    CachedPreview {
        html: String::new(),
        policy: PreviewPolicy::for_len(byte_len),
        status: CachedPreviewStatus::Pending,
    }
}

fn preview_pending(document: &DocumentSnapshot) -> CachedPreview {
    preview_placeholder(Some(document))
}

fn preview_failed(byte_len: usize) -> CachedPreview {
    CachedPreview {
        html: String::new(),
        policy: PreviewPolicy::for_len(byte_len),
        status: CachedPreviewStatus::Failed,
    }
}

fn preview_notice(language: AppLanguage, preview: &CachedPreview) -> Option<&'static str> {
    let i18n = i18n_for(language);
    match preview.status {
        CachedPreviewStatus::Pending => Some(i18n.text("Rendering preview...", "正在渲染预览...")),
        CachedPreviewStatus::Failed => {
            Some(i18n.text("Preview could not be rendered.", "无法渲染预览。"))
        }
        CachedPreviewStatus::Ready if !preview.policy.live_preview_enabled => Some(i18n.text(
            "Large document mode keeps editing responsive by pausing live preview.",
            "大文档模式会暂停实时预览，以保持编辑流畅。",
        )),
        CachedPreviewStatus::Ready if !preview.policy.code_highlighting_enabled => Some(i18n.text(
            "Large document mode keeps editing responsive by disabling code highlighting.",
            "大文档模式会关闭代码高亮，以保持编辑流畅。",
        )),
        CachedPreviewStatus::Ready => None,
    }
}

fn preview_notice_tone(preview: &CachedPreview) -> InlineAlertTone {
    match preview.status {
        CachedPreviewStatus::Failed => InlineAlertTone::Danger,
        CachedPreviewStatus::Pending => InlineAlertTone::Neutral,
        CachedPreviewStatus::Ready => InlineAlertTone::Attention,
    }
}

fn preview_result_matches_current(
    state: Option<&PreviewRenderState>,
    key: &PreviewCacheKey,
) -> bool {
    state.and_then(|state| state.key.as_ref()) == Some(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use papyro_core::models::AppLanguage;
    use std::sync::Arc;

    fn snapshot(tab_id: &str, revision: u64, content: &str) -> DocumentSnapshot {
        DocumentSnapshot {
            tab_id: tab_id.to_string(),
            path: std::path::PathBuf::from(format!("{tab_id}.md")),
            revision,
            content: Arc::from(content),
        }
    }

    fn preview_key(document: &DocumentSnapshot, theme: CodeHighlightTheme) -> PreviewCacheKey {
        PreviewCacheKey::new(DocumentCacheKey::from_snapshot(document), theme)
    }

    #[test]
    fn resolve_preview_ignores_stale_render_state() {
        let document_cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 1, "# Current");
        let stale_document = snapshot("a", 0, "# Old");
        let key = preview_key(&document, CodeHighlightTheme::Light);
        let stale_key = preview_key(&stale_document, CodeHighlightTheme::Light);
        let state = PreviewRenderState {
            key: Some(stale_key),
            preview: CachedPreview {
                html: "<h1>Old</h1>".to_string(),
                policy: PreviewPolicy::for_len(stale_document.content.len()),
                status: CachedPreviewStatus::Ready,
            },
        };

        let preview = resolve_preview(&document_cache, Some(&key), Some(&state), Some(&document));

        assert_eq!(preview.html, "");
        assert_eq!(preview.policy.byte_len, document.content.len());
    }

    #[test]
    fn resolve_preview_prefers_cached_document_match() {
        let document_cache = DocumentDerivedCacheState::shared();
        let document = snapshot("a", 1, "# Current");
        let key = preview_key(&document, CodeHighlightTheme::Light);
        document_cache.borrow_mut().insert_preview(
            key.clone(),
            CachedPreview {
                html: "<h1>Current</h1>".to_string(),
                policy: PreviewPolicy::for_len(document.content.len()),
                status: CachedPreviewStatus::Ready,
            },
        );

        let preview = resolve_preview(&document_cache, Some(&key), None, Some(&document));

        assert_eq!(preview.html, "<h1>Current</h1>");
    }

    #[test]
    fn preview_result_matching_rejects_stale_completed_work() {
        let current_document = snapshot("a", 2, "# Current");
        let stale_document = snapshot("a", 1, "# Old");
        let current_key = preview_key(&current_document, CodeHighlightTheme::Light);
        let stale_key = preview_key(&stale_document, CodeHighlightTheme::Light);
        let state = PreviewRenderState {
            key: Some(current_key.clone()),
            preview: preview_pending(&current_document),
        };

        assert!(preview_result_matches_current(Some(&state), &current_key));
        assert!(!preview_result_matches_current(Some(&state), &stale_key));
    }

    #[test]
    fn render_preview_for_content_renders_html() {
        fn render(
            markdown: &str,
            highlight_code: bool,
            highlight_theme: CodeHighlightTheme,
        ) -> String {
            format!("<p>{markdown}:{highlight_code}:{highlight_theme:?}</p>")
        }

        let preview = render_preview_for_content(
            "a",
            1,
            "hello",
            Path::new("note.md"),
            None,
            CodeHighlightTheme::Dark,
            render,
        );

        assert_eq!(preview.html, "<p>hello:true:Dark</p>");
        assert_eq!(preview.status, CachedPreviewStatus::Ready);
    }

    #[test]
    fn preview_cache_key_tracks_highlight_theme() {
        let document = snapshot("a", 1, "# Current");
        let light = preview_key(&document, CodeHighlightTheme::Light);
        let dark = preview_key(&document, CodeHighlightTheme::Dark);

        assert_ne!(light, dark);
    }

    #[test]
    fn local_preview_image_url_resolves_workspace_relative_image() {
        let workspace = PathBuf::from("/workspace");
        let note_path = workspace.join("notes/daily/note.md");
        let url = local_preview_image_url("../../assets/pasted image.png", &workspace, &note_path)
            .expect("local image url");

        assert!(url.starts_with("file://"));
        assert!(url.contains("/workspace/assets/pasted%20image.png"));
        assert_eq!(
            local_preview_image_url("../../../outside.png", &workspace, &note_path),
            None
        );
        assert_eq!(
            local_preview_image_url("https://example.test/a.png", &workspace, &note_path),
            None
        );
    }

    #[test]
    fn render_preview_for_content_rewrites_local_image_sources() {
        fn render(
            markdown: &str,
            _highlight_code: bool,
            _highlight_theme: CodeHighlightTheme,
        ) -> String {
            format!("<p>{markdown}</p>")
        }

        let workspace = PathBuf::from("/workspace");
        let note_path = workspace.join("notes/note.md");
        let preview = render_preview_for_content(
            "a",
            1,
            "![image](../assets/pasted.png)",
            &note_path,
            Some(workspace.as_path()),
            CodeHighlightTheme::Light,
            render,
        );

        assert!(preview.html.contains(r#"<img src="file://"#));
        assert!(preview.html.contains("/workspace/assets/pasted.png"));
    }

    #[test]
    fn preview_notice_reports_pending_and_failed_render() {
        let document = snapshot("a", 1, "# Current");
        let pending = preview_pending(&document);
        let failed = preview_failed(document.content.len());

        assert_eq!(
            preview_notice(AppLanguage::English, &pending),
            Some("Rendering preview...")
        );
        assert_eq!(
            preview_notice(AppLanguage::English, &failed),
            Some("Preview could not be rendered.")
        );
        assert_eq!(failed.policy.byte_len, document.content.len());
    }

    #[test]
    fn preview_link_bridge_intercepts_preview_anchor_clicks() {
        assert!(PREVIEW_LINK_BRIDGE_SCRIPT.contains(".mn-preview a[href]"));
        assert!(PREVIEW_LINK_BRIDGE_SCRIPT.contains("event.preventDefault()"));
        assert!(PREVIEW_LINK_BRIDGE_SCRIPT.contains("dioxus.send"));
    }

    #[test]
    fn preview_scroll_script_attaches_active_tab_scroller() {
        let script = attach_preview_scroll_script("tab-a", 42);

        assert!(script.contains(".mn-preview-scroll[data-tab-id]"));
        assert!(script.contains("element.dataset.tabId === tabId"));
        assert!(script.contains("element.dataset.revision === revision"));
        assert!(script.contains("window.papyroEditor.attachPreviewScroll"));
        assert!(script.contains("window.papyroEditor.renderPreviewMermaid"));
    }
}
