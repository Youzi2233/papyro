import { normalizeTiptapViewMode } from "./tiptap-mode-controller.js";

export function syncRuntimeLanguage(entry) {
  if (!entry?.dom) return;
  entry.dom.dataset.language = entry.preferences?.language ?? "english";
}

function sendRuntimeError(entry, tabId, message) {
  entry?.dioxus?.send?.({
    type: "runtime_error",
    tab_id: tabId,
    message,
  });
}

function reportCommandResult(entry, tabId, result) {
  if (result?.ok) return;
  sendRuntimeError(entry, tabId, result?.error ?? "editor_command_failed");
}

function releaseRuntimeEntry(registry, tabId) {
  if (typeof registry.unregister === "function") {
    return registry.unregister(tabId);
  }

  const released = registry.get(tabId);
  registry.delete(tabId);
  return released;
}

export function createTiptapRuntimeProtocolBridge({
  registry,
  attachEditorScroll = () => false,
  detachEditorScroll = () => false,
  attachLayoutObserver = () => false,
  detachLayoutObserver = () => false,
  restoreEditorScrollSnapshot = () => false,
  syncOutline = () => false,
} = {}) {
  return {
    attachChannel(tabId, dioxus) {
      const entry = registry.get(tabId);
      if (!entry) return;

      entry.dioxus = dioxus;
      entry.reactMount?.refresh?.(entry);
      attachEditorScroll(tabId, entry);
      syncOutline(tabId, entry.viewMode);
      const container = entry.dom?.parentElement;
      if (container) {
        attachLayoutObserver(tabId, container, dioxus);
      }
    },

    handleRustMessage(tabId, message) {
      const entry = registry.get(tabId);
      if (!entry) return;

      if (message.type === "set_view_mode") {
        const previousMode = entry.viewMode;
        const nextMode = normalizeTiptapViewMode(message.mode);
        if (
          previousMode === nextMode &&
          entry.dom?.dataset?.viewMode === nextMode
        ) {
          return "mode_unchanged";
        }
        entry.modeSnapshots.capture(entry, previousMode);
        entry.modeController.apply(entry, nextMode);
        entry.sourcePane.applyMode(entry);
        entry.modeSnapshots.restore(entry, entry.viewMode);
        restoreEditorScrollSnapshot(entry);
        attachEditorScroll(tabId, entry);
        syncOutline(tabId, entry.viewMode);
        entry.reactMount?.refresh?.(entry);
        return "mode_updated";
      } else if (message.type === "set_content") {
        const result = entry.markdownSync.setMarkdown(message.content ?? "");
        if (result.ok) {
          entry.suppressChange = true;
          try {
            entry.editor.commands?.setContent?.(entry.markdownSync.markdown, {
              contentType: "markdown",
            });
            entry.sourcePane.setMarkdown(entry.markdownSync.markdown);
          } finally {
            entry.suppressChange = false;
          }
        } else {
          sendRuntimeError(entry, tabId, result.error.message);
        }
      } else if (message.type === "insert_markdown") {
        if (entry.sourcePane.insertMarkdown(entry, message.markdown ?? "", message.cursor_offset)) {
          return;
        }
        entry.editor.commands?.insertContent?.(message.markdown ?? "", {
          contentType: "markdown",
        });
      } else if (message.type === "set_preferences") {
        entry.preferencesController.apply(entry, message);
        syncRuntimeLanguage(entry);
        entry.reactMount?.refresh?.(entry);
      } else if (message.type === "set_block_hints") {
        entry.blockHintsController.apply(entry, message.hints);
      } else if (message.type === "run_slash_command") {
        reportCommandResult(
          entry,
          tabId,
          entry.slashCommands.run(message.command_id ?? message.commandId, {
            editor: entry.editor,
            entry,
            message,
            tabId,
          }),
        );
      } else if (message.type === "run_format_command") {
        reportCommandResult(
          entry,
          tabId,
          entry.formatCommands.run(message.command_id ?? message.commandId, {
            editor: entry.editor,
            entry,
            message,
            tabId,
          }),
        );
      } else if (message.type === "undo" || message.type === "redo") {
        reportCommandResult(
          entry,
          tabId,
          entry.historyCommands.run(message.type, {
            editor: entry.editor,
            entry,
            message,
            tabId,
          }),
        );
      } else if (message.type === "focus") {
        if (entry.sourcePane.focus(entry)) {
          return;
        }
        entry.editor.commands?.focus?.();
      } else if (message.type === "destroy") {
        if (
          entry.instanceId &&
          message.instance_id &&
          entry.instanceId !== message.instance_id
        ) {
          return "destroyed";
        }

        const released = releaseRuntimeEntry(registry, tabId);
        released?.pasteController?.destroy?.();
        detachEditorScroll(released);
        detachLayoutObserver(released);
        released?.sourcePane?.destroy?.();
        released?.tableCommands?.destroy?.();
        released?.reactMount?.destroy?.();
        released?.editor?.destroy?.();
        return "destroyed";
      }
    },
  };
}
