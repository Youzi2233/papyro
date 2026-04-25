use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use syntect::highlighting::ThemeSet;
use syntect::html::highlighted_html_for_string;
use syntect::parsing::SyntaxSet;

thread_local! {
    static SYNTAX_SET: SyntaxSet = SyntaxSet::load_defaults_newlines();
    static THEME_SET: ThemeSet = ThemeSet::load_defaults();
}

pub fn render_markdown_html(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(markdown, options);
    let highlighted = highlight_code_blocks(parser);

    let mut output = String::new();
    html::push_html(&mut output, highlighted.into_iter());
    output
}

fn highlight_code_blocks(parser: Parser<'_>) -> Vec<Event<'_>> {
    let mut events = Vec::new();
    let mut code_buf = String::new();
    let mut in_code_block = false;
    let mut current_lang: Option<String> = None;

    for event in parser {
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
                events.push(Event::Html(html.into()));
                current_lang = None;
                code_buf.clear();
            }
            Event::Text(text) if in_code_block => {
                code_buf.push_str(&text);
            }
            other => events.push(other),
        }
    }

    events
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
            return format!(r#"<div class="mn-code-block" data-lang="{lang}">{html}</div>"#);
        }
    }

    let escaped = html_escape(code);
    format!(
        r#"<pre><code class="language-{}">{}</code></pre>"#,
        lang.unwrap_or(""),
        escaped
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
