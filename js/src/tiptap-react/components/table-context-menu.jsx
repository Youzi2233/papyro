import React, { useMemo } from "react";

import {
  tableContextEyebrowLabel,
  tableContextSubtitleLabel,
  tableContextTitleLabel,
  tableToolsLabel,
} from "../../tiptap-i18n.js";
import {
  tableCommandLayoutGroup,
  tableCommandVariant,
} from "../../tiptap-table-commands.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { CommandIconFrame, CommandRow } from "./primitives.jsx";

function groupTableCommands(commands) {
  const groups = [];
  (commands ?? []).forEach((command, commandIndex) => {
    const indexedCommand = {
      ...command,
      index: commandIndex,
    };
    const layoutGroup = command.layoutGroup ?? tableCommandLayoutGroup(command);
    const groupKey = layoutGroup === "danger" ? "danger" : command.groupKey ?? command.group;
    const previous = groups.at(-1);
    if (previous?.groupKey !== groupKey) {
      groups.push({
        groupKey,
        group: command.group,
        layoutGroup,
        commands: [],
      });
    }
    groups.at(-1).commands.push(indexedCommand);
  });
  return groups;
}

function TableCommandVisual({ command }) {
  const icon = command.icon ?? command.id;
  return (
    <CommandIconFrame
      className="mn-tiptap-table-toolbar-button-visual"
      icon=""
      dataIcon={icon}
    />
  );
}

function TableCommandButton({
  command,
  commandIndex,
  mode,
  ownerId,
  selected,
  setActiveCommand,
  run,
}) {
  const variant = command.variant ?? tableCommandVariant(command);
  const activation = usePointerActivation(() => {
    if (command.disabled) return false;
    return run(command.id);
  });
  const showVisual = variant === "icon" || variant === "swatch" || mode === "context";
  const showTextLabel = mode === "context" && variant !== "icon" && variant !== "swatch";

  return (
    <CommandRow
      ownerId={ownerId}
      index={commandIndex}
      selected={selected}
      activeClassName=""
      className="mn-tiptap-table-toolbar-button"
      role={mode === "context" ? "menuitem" : "button"}
      tabIndex={selected ? 0 : -1}
      title={command.title}
      disabled={!!command.disabled}
      aria={{
        "aria-label": command.title,
        "aria-disabled": command.disabled ? "true" : "false",
      }}
      data={{
        "command-id": command.id,
        "command-index": commandIndex,
        group: command.group,
        icon: command.icon ?? command.id,
        variant,
        tone: command.tone ?? "default",
        active: command.active ? "true" : "false",
        "keyboard-active": selected ? "true" : "false",
        disabled: command.disabled ? "true" : "false",
      }}
      onPointerMove={() => setActiveCommand(command.id, { keyboardActive: false })}
      onFocus={() => setActiveCommand(command.id, { keyboardActive: true })}
      activation={activation}
    >
      {showVisual ? <TableCommandVisual command={command} /> : null}
      {showTextLabel ? (
        <span className="mn-tiptap-table-toolbar-button-label">
          {command.title}
        </span>
      ) : null}
      {!showVisual && !showTextLabel ? command.label : null}
    </CommandRow>
  );
}

export function PapyroTableContextMenu({
  ownerId,
  state,
  commands = [],
  language = "english",
}) {
  const groups = useMemo(() => groupTableCommands(commands), [commands]);
  const mode = state?.mode === "keyboard" ? "keyboard" : "context";
  const selectionKind = state?.selection?.kind ?? "cell";

  return (
    <>
      <div className="mn-tiptap-table-toolbar-header">
        <div className="mn-tiptap-table-toolbar-eyebrow">
          {tableContextEyebrowLabel(language)}
        </div>
        <div className="mn-tiptap-table-toolbar-title">
          {mode === "context"
            ? tableContextTitleLabel(language, selectionKind)
            : tableToolsLabel(language)}
        </div>
        <div className="mn-tiptap-table-toolbar-subtitle">
          {mode === "context"
            ? tableContextSubtitleLabel(language, state?.selection)
            : ""}
        </div>
      </div>
      <div className="mn-tiptap-table-toolbar-list">
        {groups.map((group) => (
          <div
            key={group.groupKey}
            className="mn-tiptap-table-toolbar-group"
            data-group-key={group.groupKey}
            data-group={group.group}
            data-layout-group={group.layoutGroup}
          >
            {group.layoutGroup === "danger" ? null : (
              <div className="mn-tiptap-table-toolbar-group-label">
                {group.group}
              </div>
            )}
            {group.commands.map((command) => (
              <TableCommandButton
                key={command.id}
                command={command}
                commandIndex={command.index}
                mode={mode}
                ownerId={ownerId}
                selected={command.id === state?.activeCommandId}
                setActiveCommand={state?.setActiveCommand}
                run={state?.run}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
