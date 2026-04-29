use anyhow::{bail, Context, Result};

pub(crate) fn open_external_url(url: &str) -> Result<()> {
    open_external_url_with(url, |url| {
        open::that(url)?;
        Ok(())
    })
}

fn open_external_url_with(url: &str, open: impl FnOnce(&str) -> Result<()>) -> Result<()> {
    let url = validate_external_url(url)?;
    open(url).with_context(|| format!("failed to open external URL {url}"))
}

fn validate_external_url(url: &str) -> Result<&str> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        bail!("Preview link is empty");
    }
    if trimmed
        .chars()
        .any(|character| character.is_ascii_whitespace() || character.is_control())
    {
        bail!("Preview link must not contain whitespace or control characters");
    }

    let Some((scheme, _)) = trimmed.split_once(':') else {
        bail!("Preview link must be an external http, https, or mailto URL");
    };
    let scheme = scheme.to_ascii_lowercase();
    let valid_scheme = !scheme.is_empty()
        && scheme.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
        });
    if !valid_scheme || !matches!(scheme.as_str(), "http" | "https" | "mailto") {
        bail!("Preview link must be an external http, https, or mailto URL");
    }

    Ok(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn open_external_url_with_accepts_web_and_mail_links() {
        let opened = RefCell::new(Vec::new());

        for url in [
            "https://example.test/doc",
            "HTTP://example.test/doc",
            "mailto:hello@example.test",
        ] {
            open_external_url_with(url, |url| {
                opened.borrow_mut().push(url.to_string());
                Ok(())
            })
            .expect("external URL opens");
        }

        assert_eq!(
            opened.into_inner(),
            vec![
                "https://example.test/doc".to_string(),
                "HTTP://example.test/doc".to_string(),
                "mailto:hello@example.test".to_string(),
            ]
        );
    }

    #[test]
    fn open_external_url_with_rejects_relative_and_script_links() {
        for url in [
            "notes/a.md",
            "#heading",
            "javascript:alert(1)",
            "file:///tmp/a.md",
        ] {
            let error = open_external_url_with(url, |_| {
                panic!("invalid link must not reach platform opener")
            })
            .expect_err("invalid external URL is rejected");

            assert!(error
                .to_string()
                .contains("external http, https, or mailto URL"));
        }
    }

    #[test]
    fn open_external_url_with_rejects_whitespace_and_control_characters() {
        for url in ["https://example.test/a b", "https://example.test/\nnext"] {
            let error = open_external_url_with(url, |_| {
                panic!("invalid link must not reach platform opener")
            })
            .expect_err("invalid external URL is rejected");

            assert!(error
                .to_string()
                .contains("whitespace or control characters"));
        }
    }

    #[test]
    fn open_external_url_with_adds_target_context_to_errors() {
        let error = open_external_url_with("https://example.test/doc", |_| {
            bail!("platform opener failed")
        })
        .expect_err("platform open failure is reported");

        let message = format!("{error:#}");
        assert!(message.contains("failed to open external URL https://example.test/doc"));
        assert!(message.contains("platform opener failed"));
    }
}
