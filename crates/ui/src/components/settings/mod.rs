use crate::context::use_app_context;
use dioxus::prelude::*;
use papyro_core::models::{AppSettings, Theme, WorkspaceSettingsOverrides};
use papyro_core::UiState;

#[derive(Clone, Copy, PartialEq, Eq)]
enum SettingsScope {
    Global,
    Workspace,
}

#[component]
pub fn SettingsModal(on_close: EventHandler<()>) -> Element {
    let app = use_app_context();
    let ui_state = app.ui_state;
    let commands = app.commands;
    let view_model = app.view_model.read().clone();
    let has_workspace = view_model.workspace.name.is_some();
    let ui_snapshot = ui_state.read().clone();
    let initial_scope = if has_workspace
        && ui_snapshot.workspace_overrides != WorkspaceSettingsOverrides::default()
    {
        SettingsScope::Workspace
    } else {
        SettingsScope::Global
    };
    let settings = settings_for_scope(&ui_snapshot, initial_scope);

    let mut save_scope = use_signal(|| initial_scope);
    let mut font_family = use_signal(|| settings.font_family.clone());
    let mut font_size = use_signal(|| settings.font_size);
    let mut line_height = use_signal(|| settings.line_height);
    let mut auto_link_paste = use_signal(|| settings.auto_link_paste);
    let mut auto_save_ms = use_signal(|| settings.auto_save_delay_ms);
    let mut theme = use_signal(|| settings.theme.clone());

    let save = move |_| {
        let state = ui_state.read();
        let base = settings_for_scope(&state, save_scope());
        let new_settings = form_settings(
            &base,
            theme.read().clone(),
            font_family.read().clone(),
            *font_size.read(),
            *line_height.read(),
            *auto_link_paste.read(),
            *auto_save_ms.read(),
        );

        if save_scope() == SettingsScope::Workspace {
            let overrides = WorkspaceSettingsOverrides::from_settings_delta(
                &state.global_settings,
                &new_settings,
            );
            commands.save_workspace_settings.call(overrides);
        } else {
            commands.save_settings.call(new_settings);
        }
        on_close.call(());
    };
    let save_label = if save_scope() == SettingsScope::Workspace {
        "Save Workspace"
    } else {
        "Save Global"
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
                    SettingSection { label: "Scope",
                        SettingRow { label: "Save target",
                            div { class: "mn-setting-radio-group",
                                label { class: "mn-setting-radio",
                                    input {
                                        r#type: "radio",
                                        name: "settings_scope",
                                        checked: save_scope() == SettingsScope::Global,
                                        onchange: move |_| {
                                            let state = ui_state.read();
                                            let next_settings = settings_for_scope(&state, SettingsScope::Global);
                                            set_form_values(
                                                &next_settings,
                                                font_family,
                                                font_size,
                                                line_height,
                                                auto_link_paste,
                                                auto_save_ms,
                                                theme,
                                            );
                                            save_scope.set(SettingsScope::Global);
                                        },
                                    }
                                    "Global"
                                }
                                if has_workspace {
                                    label { class: "mn-setting-radio",
                                        input {
                                            r#type: "radio",
                                            name: "settings_scope",
                                            checked: save_scope() == SettingsScope::Workspace,
                                            onchange: move |_| {
                                                let state = ui_state.read();
                                                let next_settings = settings_for_scope(&state, SettingsScope::Workspace);
                                                set_form_values(
                                                    &next_settings,
                                                    font_family,
                                                    font_size,
                                                    line_height,
                                                    auto_link_paste,
                                                    auto_save_ms,
                                                    theme,
                                                );
                                                save_scope.set(SettingsScope::Workspace);
                                            },
                                        }
                                        "Workspace"
                                    }
                                }
                            }
                        }
                    }
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
                        SettingRow { label: "Paste URL as link",
                            label { class: "mn-setting-switch",
                                input {
                                    r#type: "checkbox",
                                    checked: *auto_link_paste.read(),
                                    onchange: move |e| auto_link_paste.set(e.checked()),
                                }
                                span { class: "mn-setting-switch-track",
                                    span { class: "mn-setting-switch-thumb" }
                                }
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
                    button { class: "mn-button primary", onclick: save, "{save_label}" }
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

fn settings_for_scope(ui_state: &UiState, scope: SettingsScope) -> AppSettings {
    match scope {
        SettingsScope::Global => ui_state.global_settings.clone(),
        SettingsScope::Workspace => ui_state.settings.clone(),
    }
}

fn form_settings(
    base: &AppSettings,
    theme: Theme,
    font_family: String,
    font_size: u8,
    line_height: f32,
    auto_link_paste: bool,
    auto_save_delay_ms: u64,
) -> AppSettings {
    AppSettings {
        theme,
        font_family,
        font_size,
        line_height,
        auto_link_paste,
        auto_save_delay_ms,
        show_word_count: base.show_word_count,
        sidebar_width: base.sidebar_width,
        sidebar_collapsed: base.sidebar_collapsed,
        view_mode: base.view_mode.clone(),
    }
}

fn set_form_values(
    settings: &AppSettings,
    mut font_family: Signal<String>,
    mut font_size: Signal<u8>,
    mut line_height: Signal<f32>,
    mut auto_link_paste: Signal<bool>,
    mut auto_save_ms: Signal<u64>,
    mut theme: Signal<Theme>,
) {
    font_family.set(settings.font_family.clone());
    font_size.set(settings.font_size);
    line_height.set(settings.line_height);
    auto_link_paste.set(settings.auto_link_paste);
    auto_save_ms.set(settings.auto_save_delay_ms);
    theme.set(settings.theme.clone());
}
