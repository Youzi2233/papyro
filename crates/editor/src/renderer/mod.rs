pub mod html;

pub use html::{
    render_markdown_html, render_markdown_html_with_highlight_theme,
    render_markdown_html_with_highlighting, render_markdown_html_with_image_resolver,
    render_markdown_html_with_image_resolver_and_highlight_theme, CodeHighlightTheme,
};
