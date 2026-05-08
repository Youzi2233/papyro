import React from "react";

import { commandElementId } from "../../tiptap-ui-primitives.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";

const FORMAT_TOOLBAR_OWNER_ID = "mn-tiptap-format-toolbar";

function FormatToolbarButton({ command, commandIndex, activeCommandId, run, setActiveCommand }) {
  const activation = usePointerActivation(() => run(command.id));
  const keyboardActive = activeCommandId === command.id;

  return (
    <button
      type="button"
      className={`mn-tiptap-format-toolbar-button${command.active ? " active" : ""}`}
      id={commandElementId(FORMAT_TOOLBAR_OWNER_ID, commandIndex)}
      title={command.title}
      aria-label={command.ariaLabel}
      aria-pressed={String(command.active)}
      data-command-id={command.id}
      data-command-index={String(commandIndex)}
      data-priority={String(command.priority ?? 100)}
      data-keyboard-active={keyboardActive ? "true" : "false"}
      tabIndex={keyboardActive ? 0 : -1}
      onPointerEnter={() => setActiveCommand?.(command.id, { keyboardActive: false })}
      onFocus={() => setActiveCommand?.(command.id, { keyboardActive: true })}
      {...activation}
    >
      <span
        className={`mn-tiptap-format-toolbar-icon ${command.icon}`}
        aria-hidden="true"
      />
      <span className="mn-tiptap-format-toolbar-label">
        {command.label}
      </span>
    </button>
  );
}

export function PapyroFormatToolbar({ state }) {
  const commands = state?.commands ?? [];

  return (
    <div className="mn-tiptap-format-toolbar-list">
      {commands.map((command, commandIndex) => (
        <FormatToolbarButton
          key={command.id}
          command={command}
          commandIndex={commandIndex}
          activeCommandId={state.activeCommandId}
          run={state.run}
          setActiveCommand={state.setActiveCommand}
        />
      ))}
    </div>
  );
}
