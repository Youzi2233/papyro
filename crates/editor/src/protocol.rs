use papyro_core::models::ViewMode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EditorEvent {
    RuntimeReady {
        tab_id: String,
    },
    RuntimeError {
        tab_id: String,
        message: String,
    },
    ContentChanged {
        tab_id: String,
        content: String,
    },
    SaveRequested {
        tab_id: String,
    },
    PasteImageRequested {
        tab_id: String,
        mime_type: String,
        data: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EditorCommand {
    SetContent { content: String },
    SetViewMode { mode: ViewMode },
    SetPreferences { auto_link_paste: bool },
    InsertMarkdown { markdown: String },
    ApplyFormat { kind: EditorFormat },
    Focus,
    RefreshLayout,
    Destroy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditorFormat {
    Bold,
    Italic,
    Link,
    Image,
    CodeBlock,
    Heading1,
    Heading2,
    Heading3,
    Quote,
    Ul,
    Ol,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serializes_set_content_command() {
        let value = serde_json::to_value(EditorCommand::SetContent {
            content: "# Title".to_string(),
        })
        .unwrap();

        assert_eq!(
            value,
            json!({ "type": "set_content", "content": "# Title" })
        );
    }

    #[test]
    fn serializes_apply_format_command() {
        let value = serde_json::to_value(EditorCommand::ApplyFormat {
            kind: EditorFormat::CodeBlock,
        })
        .unwrap();

        assert_eq!(
            value,
            json!({ "type": "apply_format", "kind": "code_block" })
        );
    }

    #[test]
    fn serializes_set_view_mode_command() {
        let value = serde_json::to_value(EditorCommand::SetViewMode {
            mode: ViewMode::Hybrid,
        })
        .unwrap();

        assert_eq!(value, json!({ "type": "set_view_mode", "mode": "Hybrid" }));
    }

    #[test]
    fn serializes_set_preferences_command() {
        let value = serde_json::to_value(EditorCommand::SetPreferences {
            auto_link_paste: false,
        })
        .unwrap();

        assert_eq!(
            value,
            json!({ "type": "set_preferences", "auto_link_paste": false })
        );
    }

    #[test]
    fn serializes_insert_markdown_command() {
        let value = serde_json::to_value(EditorCommand::InsertMarkdown {
            markdown: "![image](assets/paste.png)".to_string(),
        })
        .unwrap();

        assert_eq!(
            value,
            json!({ "type": "insert_markdown", "markdown": "![image](assets/paste.png)" })
        );
    }

    #[test]
    fn deserializes_content_changed_event() {
        let event: EditorEvent = serde_json::from_value(json!({
            "type": "content_changed",
            "tab_id": "tab-a",
            "content": "Hello"
        }))
        .unwrap();

        assert_eq!(
            event,
            EditorEvent::ContentChanged {
                tab_id: "tab-a".to_string(),
                content: "Hello".to_string()
            }
        );
    }

    #[test]
    fn deserializes_runtime_error_event() {
        let event: EditorEvent = serde_json::from_value(json!({
            "type": "runtime_error",
            "tab_id": "tab-a",
            "message": "boom"
        }))
        .unwrap();

        assert_eq!(
            event,
            EditorEvent::RuntimeError {
                tab_id: "tab-a".to_string(),
                message: "boom".to_string()
            }
        );
    }

    #[test]
    fn deserializes_paste_image_requested_event() {
        let event: EditorEvent = serde_json::from_value(json!({
            "type": "paste_image_requested",
            "tab_id": "tab-a",
            "mime_type": "image/png",
            "data": "abc123"
        }))
        .unwrap();

        assert_eq!(
            event,
            EditorEvent::PasteImageRequested {
                tab_id: "tab-a".to_string(),
                mime_type: "image/png".to_string(),
                data: "abc123".to_string()
            }
        );
    }
}
