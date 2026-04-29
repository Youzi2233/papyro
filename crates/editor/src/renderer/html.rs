use pulldown_cmark::{html, CodeBlockKind, CowStr, Event, Options, Parser, Tag, TagEnd};
use syntect::highlighting::ThemeSet;
use syntect::html::highlighted_html_for_string;
use syntect::parsing::SyntaxSet;

thread_local! {
    static SYNTAX_SET: SyntaxSet = SyntaxSet::load_defaults_newlines();
    static THEME_SET: ThemeSet = ThemeSet::load_defaults();
}

pub fn render_markdown_html(markdown: &str) -> String {
    render_markdown_html_with_highlighting(
        markdown,
        crate::performance::should_highlight_code(markdown.len()),
    )
}

pub fn render_markdown_html_with_highlighting(markdown: &str, highlight_code: bool) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(markdown, options);
    let sanitized = sanitize_events(parser);
    let highlighted = if highlight_code {
        highlight_code_blocks(sanitized)
    } else {
        sanitized
    };

    let mut output = String::new();
    html::push_html(&mut output, highlighted.into_iter());
    output
}

fn sanitize_events<'a>(events: impl IntoIterator<Item = Event<'a>>) -> Vec<Event<'a>> {
    let mut sanitized = Vec::new();

    for event in events {
        match event {
            Event::Html(_) | Event::InlineHtml(_) => {}
            Event::Start(Tag::Link {
                link_type,
                dest_url,
                title,
                id,
            }) => sanitized.push(Event::Start(Tag::Link {
                link_type,
                dest_url: sanitize_url(&dest_url),
                title,
                id,
            })),
            Event::Start(Tag::Image {
                link_type,
                dest_url,
                title,
                id,
            }) => sanitized.push(Event::Start(Tag::Image {
                link_type,
                dest_url: sanitize_url(&dest_url),
                title,
                id,
            })),
            other => sanitized.push(other),
        }
    }

    sanitized
}

fn highlight_code_blocks<'a>(input_events: impl IntoIterator<Item = Event<'a>>) -> Vec<Event<'a>> {
    let mut highlighted_events = Vec::new();
    let mut code_buf = String::new();
    let mut in_code_block = false;
    let mut current_lang: Option<String> = None;

    for event in input_events {
        match event {
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                current_lang = match &kind {
                    CodeBlockKind::Fenced(lang) if !lang.is_empty() => Some(lang.to_string()),
                    _ => None,
                };
                code_buf.clear();
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code_block = false;
                let html = render_code_block(&code_buf, current_lang.as_deref());
                highlighted_events.push(Event::Html(html.into()));
                current_lang = None;
                code_buf.clear();
            }
            Event::Text(text) if in_code_block => {
                code_buf.push_str(&text);
            }
            other => highlighted_events.push(other),
        }
    }

    highlighted_events
}

fn render_code_block(code: &str, lang: Option<&str>) -> String {
    if let Some(lang) = lang {
        let highlighted = SYNTAX_SET.with(|ss| {
            THEME_SET.with(|ts| {
                let syntax = ss
                    .find_syntax_by_token(lang)
                    .or_else(|| ss.find_syntax_by_name(lang))
                    .unwrap_or_else(|| ss.find_syntax_plain_text());

                let theme = ts
                    .themes
                    .get("InspiredGitHub")
                    .or_else(|| ts.themes.values().next());

                theme.and_then(|t| highlighted_html_for_string(code, ss, syntax, t).ok())
            })
        });

        if let Some(html) = highlighted {
            let lang = html_attr_escape(lang);
            return format!(r#"<div class="mn-code-block" data-lang="{lang}">{html}</div>"#);
        }
    }

    let escaped = html_escape(code);
    let lang = lang.map(html_attr_escape).unwrap_or_default();
    format!(
        r#"<pre><code class="language-{}">{}</code></pre>"#,
        lang, escaped
    )
}

fn sanitize_url<'a>(url: &str) -> CowStr<'a> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return CowStr::from(String::new());
    }

    let normalized = trimmed
        .chars()
        .filter(|character| !character.is_ascii_whitespace() && !character.is_control())
        .collect::<String>()
        .to_ascii_lowercase();

    if let Some((scheme, _)) = normalized.split_once(':') {
        let valid_scheme = scheme.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
        });
        if valid_scheme && !matches!(scheme, "http" | "https" | "mailto") {
            return CowStr::from(String::new());
        }
    }

    CowStr::from(trimmed.to_string())
}

fn html_attr_escape(s: &str) -> String {
    html_escape(s).replace('\'', "&#39;")
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_markdown_html_strips_raw_html() {
        let html = render_markdown_html(
            r#"hello<script>alert(1)</script><span onclick="boom()">bad</span>"#,
        );

        assert!(!html.contains("<script"));
        assert!(!html.contains("onclick"));
        assert!(!html.contains("<span"));
    }

    #[test]
    fn render_markdown_html_removes_dangerous_urls() {
        let html = render_markdown_html(
            "[bad](javascript:alert(1)) ![img](vbscript:alert(1)) [ok](https://example.test) [rel](notes/a.md)",
        );

        let normalized = html.to_ascii_lowercase();
        assert!(!normalized.contains("javascript:"));
        assert!(!normalized.contains("vbscript:"));
        assert!(html.contains(r#"href="""#));
        assert!(html.contains(r#"src="""#));
        assert!(html.contains(r#"href="https://example.test""#));
        assert!(html.contains(r#"href="notes/a.md""#));
    }

    #[test]
    fn render_markdown_html_escapes_code_block_language_attributes() {
        let html = render_markdown_html_with_highlighting(
            "```rust\" onclick=\"alert(1)\nfn main() {}\n```",
            false,
        );

        assert!(!html.contains("onclick="));
        assert!(html.contains("rust&quot;"));
    }
}
