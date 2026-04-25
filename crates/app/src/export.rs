#[cfg(feature = "desktop-shell")]
pub(crate) async fn export_active_note_html(
    editor_tabs: dioxus::prelude::Signal<papyro_core::EditorTabs>,
    tab_contents: dioxus::prelude::Signal<papyro_core::TabContentsMap>,
    mut status_message: dioxus::prelude::Signal<Option<String>>,
) {
    use dioxus::prelude::{ReadableExt, WritableExt};
    use papyro_editor::renderer::render_markdown_html;

    let (title, content) = {
        let tabs = editor_tabs.read();
        let title = tabs
            .active_tab()
            .map(|t| t.title.clone())
            .unwrap_or_else(|| "note".to_string());
        let content = tab_contents
            .read()
            .active_content(tabs.active_tab_id.as_deref())
            .unwrap_or_default()
            .to_string();
        (title, content)
    };

    if content.is_empty() {
        status_message.set(Some("Nothing to export".to_string()));
        return;
    }

    let html_body = render_markdown_html(&content);
    let html = build_html_document(&title, &html_body);

    let file = rfd::AsyncFileDialog::new()
        .set_title("Export as HTML")
        .set_file_name(format!("{title}.html"))
        .add_filter("HTML", &["html"])
        .save_file()
        .await;

    let Some(file) = file else { return };

    match tokio::fs::write(file.path(), html.as_bytes()).await {
        Ok(_) => status_message.set(Some(format!("Exported {title}.html"))),
        Err(error) => status_message.set(Some(format!("Export failed: {error}"))),
    }
}

#[cfg(feature = "desktop-shell")]
fn build_html_document(title: &str, body: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.75;
    color: #25211a;
    background: #fffaf2;
    padding: 48px clamp(16px, 8vw, 120px);
  }}
  .content {{ max-width: 760px; margin: 0 auto; }}
  h1 {{ font-size: 2em; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 .5em; }}
  h2 {{ font-size: 1.5em; font-weight: 700; margin: 1.5em 0 .5em; }}
  h3 {{ font-size: 1.25em; font-weight: 600; margin: 1.25em 0 .4em; }}
  h4, h5, h6 {{ font-size: 1em; font-weight: 600; margin: 1em 0 .3em; }}
  p {{ margin: 0 0 1em; }}
  ul, ol {{ margin: 0 0 1em 1.5em; }}
  li {{ margin: .25em 0; }}
  blockquote {{
    border-left: 3px solid #c0533a;
    padding: .5em 1em;
    margin: 0 0 1em;
    color: #5c5347;
    background: rgba(192, 83, 58, 0.08);
    border-radius: 0 8px 8px 0;
  }}
  code {{
    font-family: "Cascadia Code", "JetBrains Mono", monospace;
    font-size: .875em;
    background: rgba(192, 83, 58, 0.1);
    border: 1px solid #e0d4c0;
    border-radius: 4px;
    padding: .1em .4em;
    color: #c0533a;
  }}
  pre {{ border-radius: 10px; margin: 0 0 1em; overflow-x: auto; }}
  pre code {{ background: none; border: none; padding: 0; color: inherit; }}
  table {{ width: 100%; border-collapse: collapse; margin: 0 0 1em; font-size: .9em; }}
  th {{ background: rgba(192,83,58,.1); font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #e0d4c0; }}
  td {{ padding: 7px 12px; border: 1px solid #e0d4c0; }}
  a {{ color: #c0533a; text-decoration: underline; text-underline-offset: 3px; }}
  img {{ max-width: 100%; border-radius: 8px; }}
  hr {{ border: none; border-top: 1px solid #e0d4c0; margin: 1.5em 0; }}
</style>
</head>
<body>
<div class="content">
{body}
</div>
</body>
</html>"#
    )
}
