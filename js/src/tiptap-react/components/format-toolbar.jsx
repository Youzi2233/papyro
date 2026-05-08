import React from "react";

import { commandElementId } from "../../tiptap-ui-primitives.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";

const FORMAT_TOOLBAR_OWNER_ID = "mn-tiptap-format-toolbar";
const FORMAT_TOOLBAR_SUBMENU_OWNER_ID = "mn-tiptap-format-toolbar-submenu";

function FormatToolbarButton({
  command,
  commandIndex,
  ownerId = FORMAT_TOOLBAR_OWNER_ID,
  submenuOwnerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
  activeCommandId,
  submenuOpen,
  run,
  setActiveCommand,
}) {
  const activation = usePointerActivation(() => run(command.id));
  const keyboardActive = activeCommandId === command.id;
  const hasSubmenu = command.id === "turn-into" && command.children?.length > 0;
  const submenuExpanded = hasSubmenu && submenuOpen === command.id;

  return (
    <button
      type="button"
      className={`mn-tiptap-format-toolbar-button${command.active ? " active" : ""}`}
      id={commandElementId(ownerId, commandIndex)}
      title={command.title}
      aria-label={command.ariaLabel}
      aria-pressed={String(command.active)}
      aria-controls={submenuExpanded ? submenuOwnerId : undefined}
      data-command-id={command.id}
      data-command-index={String(commandIndex)}
      data-priority={String(command.priority ?? 100)}
      data-keyboard-active={keyboardActive ? "true" : "false"}
      data-submenu-open={submenuExpanded ? "true" : "false"}
      aria-haspopup={hasSubmenu ? "menu" : undefined}
      aria-expanded={hasSubmenu ? String(submenuExpanded) : undefined}
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

function FormatToolbarSubmenuItem({
  command,
  commandIndex,
  ownerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
  activeChildCommandId,
  run,
  setActiveChildCommand,
}) {
  const activation = usePointerActivation(() => run(command.id));
  const keyboardActive = activeChildCommandId === command.id;

  return (
    <button
      type="button"
      className={`mn-tiptap-format-toolbar-submenu-item${command.active ? " active" : ""}`}
      id={commandElementId(ownerId, commandIndex)}
      title={command.title}
      aria-label={command.ariaLabel}
      role="menuitem"
      data-command-id={command.id}
      data-submenu-command-index={String(commandIndex)}
      data-active={command.active ? "true" : "false"}
      data-keyboard-active={keyboardActive ? "true" : "false"}
      data-parent-command-id="turn-into"
      tabIndex={keyboardActive ? 0 : -1}
      onPointerEnter={() => setActiveChildCommand?.(command.id, { keyboardActive: false })}
      onFocus={() => setActiveChildCommand?.(command.id, { keyboardActive: true })}
      {...activation}
    >
      <span
        className={`mn-tiptap-format-toolbar-submenu-icon ${command.icon}`}
        aria-hidden="true"
      />
      <span className="mn-tiptap-format-toolbar-submenu-label">
        {command.title}
      </span>
    </button>
  );
}

export function PapyroFormatToolbar({
  state,
  ownerId = FORMAT_TOOLBAR_OWNER_ID,
  submenuOwnerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
}) {
  const commands = state?.commands ?? [];
  const submenuCommand = commands.find((command) => command.id === state?.submenuOpen);

  return (
    <div className="mn-tiptap-format-toolbar-shell">
      <div className="mn-tiptap-format-toolbar-list">
        {commands.map((command, commandIndex) => (
          <FormatToolbarButton
            key={command.id}
            command={command}
            commandIndex={commandIndex}
            ownerId={ownerId}
            submenuOwnerId={submenuOwnerId}
            activeCommandId={state.activeCommandId}
            submenuOpen={state.submenuOpen}
            run={state.run}
            setActiveCommand={state.setActiveCommand}
          />
        ))}
      </div>
      <div
        id={submenuOwnerId}
        className={`mn-tiptap-format-toolbar-submenu${submenuCommand?.children?.length ? "" : " hidden"}`}
        role="menu"
        aria-label={submenuCommand?.title ?? "Turn into"}
        data-parent-command-id={submenuCommand?.id ?? ""}
      >
        {submenuCommand?.children?.map((command, commandIndex) => (
          <FormatToolbarSubmenuItem
            key={command.id}
            command={command}
            commandIndex={commandIndex}
            ownerId={submenuOwnerId}
            activeChildCommandId={state.activeChildCommandId}
            run={state.run}
            setActiveChildCommand={state.setActiveChildCommand}
          />
        ))}
      </div>
    </div>
  );
}
