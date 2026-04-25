use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme};

#[component]
pub fn SettingsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let commands = app.commands;
    let settings = app.view_model.read().settings.settings.clone();

    let mut font_family = use_signal(|| settings.font_family.clone());
    let mut font_size = use_signal(|| settings.font_size);
    let mut line_height = use_signal(|| settings.line_height);
    let mut auto_save_ms = use_signal(|| settings.auto_save_delay_ms);
    let mut theme = use_signal(|| settings.theme.clone());

    let save = move |_| {
        let current = ui_state.read().settings.clone();
        let new_settings = AppSettings {
            theme: theme.read().clone(),
            font_family: font_family.read().clone(),
            font_size: *font_size.read(),
            line_height: *line_height.read(),
            auto_save_delay_ms: *auto_save_ms.read(),
            show_word_count: true,
            sidebar_width: current.sidebar_width,
            sidebar_collapsed: current.sidebar_collapsed,
            view_mode: current.view_mode,
        };
        commands.save_settings.call(new_settings);
        on_close.call(());
    };

    rsx! {
        div { class: "mn-modal-overlay", onclick: move |_| on_close.call(()),
            div { class: "mn-modal", onclick: move |e| e.stop_propagation(),
                div { class: "mn-modal-header",
                    h2 { class: "mn-modal-title", "Settings" }
                    button {
                        class: "mn-modal-close",
                        onclick: move |_| on_close.call(()),
                        "×"
                    }
                }
                div { class: "mn-modal-body",
                    SettingSection { label: "Appearance",
                        SettingRow { label: "Theme",
                            div { class: "mn-setting-radio-group",
                                for (value , label) in [(Theme::System, "System"), (Theme::Light, "Light"), (Theme::Dark, "Dark")] {
                                    label { class: "mn-setting-radio",
                                        input {
                                            r#type: "radio",
                                            name: "theme",
                                            checked: *theme.read() == value,
                                            onchange: {
                                                let v = value.clone();
                                                move |_| theme.set(v.clone())
                                            },
                                        }
                                        "{label}"
                                    }
                                }
                            }
                        }
                    }
                    SettingSection { label: "Editor",
                        SettingRow { label: "Font family",
                            select {
                                class: "mn-input",
                                value: "{font_family}",
                                onchange: move |e| font_family.set(e.value().clone()),
                                option { value: "\"Cascadia Code\", \"JetBrains Mono\", monospace",
                                    "Cascadia Code"
                                }
                                option { value: "\"JetBrains Mono\", monospace", "JetBrains Mono" }
                                option { value: "\"Fira Code\", monospace", "Fira Code" }
                                option { value: "\"Courier New\", monospace", "Courier New" }
                            }
                        }
                        SettingRow { label: "Font size ({font_size}px)",
                            input {
                                class: "mn-range",
                                r#type: "range",
                                min: "12",
                                max: "24",
                                step: "1",
                                value: "{font_size}",
                                oninput: move |e| {
                                    if let Ok(v) = e.value().parse::<u8>() {
                                        font_size.set(v);
                                    }
                                },
                            }
                        }
                        SettingRow { label: "Line height ({line_height:.1})",
                            input {
                                class: "mn-range",
                                r#type: "range",
                                min: "1.2",
                                max: "2.4",
                                step: "0.1",
                                value: "{line_height}",
                                oninput: move |e| {
                                    if let Ok(v) = e.value().parse::<f32>() {
                                        line_height.set(v);
                                    }
                                },
                            }
                        }
                    }
                    SettingSection { label: "Saving",
                        SettingRow { label: "Auto-save delay ({auto_save_ms}ms)",
                            input {
                                class: "mn-range",
                                r#type: "range",
                                min: "200",
                                max: "3000",
                                step: "100",
                                value: "{auto_save_ms}",
                                oninput: move |e| {
                                    if let Ok(v) = e.value().parse::<u64>() {
                                        auto_save_ms.set(v);
                                    }
                                },
                            }
                        }
                    }
                }
                div { class: "mn-modal-footer",
                    button {
                        class: "mn-button",
                        onclick: move |_| on_close.call(()),
                        "Cancel"
                    }
                    button { class: "mn-button primary", onclick: save, "Save" }
                }
            }
        }
    }
}

#[component]
fn SettingSection(label: &'static str, children: Element) -> Element {
    rsx! {
        div { class: "mn-setting-section",
            h3 { class: "mn-setting-section-label", "{label}" }
            {children}
        }
    }
}

#[component]
fn SettingRow(label: String, children: Element) -> Element {
    rsx! {
        div { class: "mn-setting-row",
            label { class: "mn-setting-label", "{label}" }
            div { class: "mn-setting-control", {children} }
        }
    }
}
