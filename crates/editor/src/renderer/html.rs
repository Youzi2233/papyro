use pulldown_cmark::{html, CodeBlockKind, CowStr, Event, Options, Parser, Tag, TagEnd};
use syntect::highlighting::ThemeSet;
use syntect::html::highlighted_html_for_string;
use syntect::parsing::SyntaxSet;

thread_local! {
    static SYNTAX_SET: SyntaxSet = SyntaxSet::load_defaults_newlines();
    static THEME_SET: ThemeSet = ThemeSet::load_defaults();
}

type ImageUrlResolver<'a> = &'a dyn Fn(&str) -> Option<String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CodeHighlightTheme {
    Light,
    Dark,
}

impl CodeHighlightTheme {
    fn name(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    fn candidates(self) -> &'static [&'static str] {
        match self {
            Self::Light => &["base16-ocean.light", "InspiredGitHub", "Solarized (light)"],
            Self::Dark => &[
                "base16-ocean.dark",
                "base16-eighties.dark",
                "Solarized (dark)",
            ],
        }
    }
}

pub fn render_markdown_html(markdown: &str) -> String {
    render_markdown_html_with_highlighting(
        markdown,
        crate::performance::should_highlight_code(markdown.len()),
    )
}

pub fn render_markdown_html_with_highlighting(markdown: &str, highlight_code: bool) -> String {
    render_markdown_html_with_highlight_theme(markdown, highlight_code, CodeHighlightTheme::Light)
}

pub fn render_markdown_html_with_highlight_theme(
    markdown: &str,
    highlight_code: bool,
    highlight_theme: CodeHighlightTheme,
) -> String {
    render_markdown_html_with_image_resolver_and_highlight_theme(
        markdown,
        highlight_code,
        None,
        highlight_theme,
    )
}

pub fn render_markdown_html_with_image_resolver(
    markdown: &str,
    highlight_code: bool,
    image_url_resolver: Option<ImageUrlResolver<'_>>,
) -> String {
    render_markdown_html_with_image_resolver_and_highlight_theme(
        markdown,
        highlight_code,
        image_url_resolver,
        CodeHighlightTheme::Light,
    )
}

pub fn render_markdown_html_with_image_resolver_and_highlight_theme(
    markdown: &str,
    highlight_code: bool,
    image_url_resolver: Option<ImageUrlResolver<'_>>,
    highlight_theme: CodeHighlightTheme,
) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(markdown, options);
    let sanitized = sanitize_events(parser, image_url_resolver);
    let highlighted = render_code_blocks(sanitized, highlight_code, highlight_theme);

    let mut output = String::new();
    html::push_html(&mut output, highlighted.into_iter());
    output
}

fn sanitize_events<'a>(
    events: impl IntoIterator<Item = Event<'a>>,
    image_url_resolver: Option<ImageUrlResolver<'_>>,
) -> Vec<Event<'a>> {
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
                dest_url: sanitize_image_url(&dest_url, image_url_resolver),
                title,
                id,
            })),
            other => sanitized.push(other),
        }
    }

    sanitized
}

fn render_code_blocks<'a>(
    input_events: impl IntoIterator<Item = Event<'a>>,
    highlight_code: bool,
    highlight_theme: CodeHighlightTheme,
) -> Vec<Event<'a>> {
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
                let html = render_code_block(
                    &code_buf,
                    current_lang.as_deref(),
                    highlight_code,
                    highlight_theme,
                );
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

fn render_code_block(
    code: &str,
    lang: Option<&str>,
    highlight_code: bool,
    highlight_theme: CodeHighlightTheme,
) -> String {
    let lang = lang.and_then(code_language_token);
    if is_mermaid_language(lang) {
        return render_mermaid_block(code);
    }

    if let Some(lang) = lang {
        if highlight_code {
            let highlighted = SYNTAX_SET.with(|ss| {
                THEME_SET.with(|ts| {
                    let syntax = ss
                        .find_syntax_by_token(lang)
                        .or_else(|| ss.find_syntax_by_name(lang))
                        .unwrap_or_else(|| ss.find_syntax_plain_text());

                    let theme = highlight_theme
                        .candidates()
                        .iter()
                        .find_map(|name| ts.themes.get(*name))
                        .or_else(|| ts.themes.values().next());

                    theme.and_then(|t| highlighted_html_for_string(code, ss, syntax, t).ok())
                })
            });

            if let Some(html) = highlighted {
                let lang = html_attr_escape(lang);
                let highlight_theme = highlight_theme.name();
                return format!(
                    r#"<div class="mn-code-block" data-lang="{lang}" data-highlight-theme="{highlight_theme}">{html}</div>"#
                );
            }
        }
    }

    let escaped = html_escape(code);
    let lang = lang.map(html_attr_escape).unwrap_or_default();
    format!(
        r#"<pre><code class="language-{}">{}</code></pre>"#,
        lang, escaped
    )
}

fn code_language_token(lang: &str) -> Option<&str> {
    lang.split_whitespace()
        .next()
        .filter(|token| !token.is_empty())
}

fn is_mermaid_language(lang: Option<&str>) -> bool {
    lang.is_some_and(|lang| lang.eq_ignore_ascii_case("mermaid"))
}

fn render_mermaid_block(source: &str) -> String {
    let escaped = html_escape(source);
    format!(
        r#"<div class="mn-mermaid-block" data-mermaid-state="source"><pre class="mn-mermaid-source">{escaped}</pre></div>"#
    )
}

fn sanitize_url<'a>(url: &str) -> CowStr<'a> {
    sanitize_url_with_extra_schemes(url, &[])
}

fn sanitize_image_url<'a>(
    url: &str,
    image_url_resolver: Option<ImageUrlResolver<'_>>,
) -> CowStr<'a> {
    if let Some(resolved) = image_url_resolver.and_then(|resolve| resolve(url)) {
        return sanitize_url_with_extra_schemes(&resolved, &["file"]);
    }

    sanitize_url(url)
}

fn sanitize_url_with_extra_schemes<'a>(url: &str, extra_schemes: &[&str]) -> CowStr<'a> {
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
        let extra_allowed = extra_schemes.contains(&scheme);
        if valid_scheme && !matches!(scheme, "http" | "https" | "mailto") && !extra_allowed {
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
    fn render_markdown_html_rewrites_resolved_local_image_urls() {
        let html = render_markdown_html_with_image_resolver(
            "![local](assets/a.png) ![remote](https://example.test/a.png)",
            false,
            Some(&|url| {
                (url == "assets/a.png").then(|| "file:///workspace/assets/a.png".to_string())
            }),
        );

        assert!(html.contains(r#"src="file:///workspace/assets/a.png""#));
        assert!(html.contains(r#"src="https://example.test/a.png""#));
    }

    #[test]
    fn render_markdown_html_rejects_raw_file_image_urls() {
        let html = render_markdown_html("![local](file:///workspace/assets/a.png)");

        assert!(html.contains(r#"src="""#));
        assert!(!html.contains("file:///workspace"));
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

    #[test]
    fn render_markdown_html_marks_code_highlight_theme() {
        let light = render_markdown_html_with_highlight_theme(
            "```rust\nfn main() {}\n```",
            true,
            CodeHighlightTheme::Light,
        );
        let dark = render_markdown_html_with_highlight_theme(
            "```rust\nfn main() {}\n```",
            true,
            CodeHighlightTheme::Dark,
        );

        assert!(light.contains(r#"class="mn-code-block""#));
        assert!(light.contains(r#"data-highlight-theme="light""#));
        assert!(dark.contains(r#"data-highlight-theme="dark""#));
    }

    #[test]
    fn render_markdown_html_wraps_mermaid_blocks_without_code_highlighting() {
        let html =
            render_markdown_html_with_highlighting("```mermaid\nflowchart TD\nA --> B\n```", false);

        assert!(html.contains(r#"class="mn-mermaid-block""#));
        assert!(html.contains(r#"class="mn-mermaid-source""#));
        assert!(html.contains("flowchart TD"));
        assert!(!html.contains(r#"class="language-mermaid""#));
    }

    #[test]
    fn render_markdown_html_escapes_mermaid_source() {
        let html = render_markdown_html_with_highlighting(
            "```mermaid\n<script>alert(1)</script>\n```",
            true,
        );

        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(!html.contains("<script>"));
    }
}
