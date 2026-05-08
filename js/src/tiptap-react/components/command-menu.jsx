import React, { useMemo, useState } from "react";

import { PAPYRO_CALLOUT_KIND_OPTIONS } from "../../tiptap-markdown-snippets.js";
import {
  calloutOptionLabel,
  insertBlockMenuTitleLabel,
  insertTableLabel,
  localizeCalloutKindOption,
  markdownCommandsLabel,
  noCommandsLabel,
  slashQueryMenuTitleLabel,
  tableSizeLabel,
} from "../../tiptap-i18n.js";
import {
  commandMenuSidePanelId,
  commandMenuSidePanel,
  commandMenuGroupTone,
  groupCommandsForMenu,
} from "../commands/command-menu-model.js";
import { useHoverIntentActivation } from "../hooks/use-hover-intent-activation.js";
import {
  codeBlockLanguagePickerLabel,
  createCodeBlockLanguageCommands,
} from "../commands/code-block-command-model.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { CommandMenuIcon } from "./command-icons.jsx";
import {
  CommandIconFrame,
  CommandItem as PrimitiveCommandItem,
  CommandSection,
} from "./primitives.jsx";

const TABLE_GRID_ROWS = 6;
const TABLE_GRID_COLS = 6;

function CommandIcon({ command }) {
  const icon = command?.icon ?? "paragraph";
  const groupTone = commandMenuGroupTone(command);
  return (
    <CommandIconFrame
      className="mn-tiptap-slash-menu-icon"
      icon={icon}
      dataIcon={icon}
      data={{
        "command-group": groupTone,
      }}
    >
      <CommandMenuIcon icon={icon} />
    </CommandIconFrame>
  );
}

function SlashCommandItem({
  command,
  ownerId,
  selected,
  activePanel,
  language,
  activate,
  focusActivate,
  choose,
}) {
  const activation = usePointerActivation(() => choose(command.id));
  const panel = commandMenuSidePanel(command);
  const hasSidePanel = panel !== "none";
  const panelId = commandMenuSidePanelId(ownerId, panel);

  return (
    <div
      className={`mn-tiptap-slash-menu-item-shell${selected ? " active" : ""}`}
      data-command-id={command.id}
    >
      <PrimitiveCommandItem
        command={command}
        ownerId={ownerId}
        selected={selected}
        className="mn-tiptap-slash-menu-item"
        role="option"
        tabIndex={-1}
        aria={{
          "aria-selected": String(selected),
          "aria-haspopup": hasSidePanel ? "menu" : undefined,
          "aria-expanded": hasSidePanel ? String(activePanel === panel) : undefined,
          "aria-controls": hasSidePanel ? panelId : undefined,
        }}
        data={{
          "command-id": command.id,
          "command-index": command.index,
          recent: command.recent ? "true" : undefined,
          group: command.group ?? "",
          "side-panel": panel,
        }}
        onPointerMove={() => activate(command.index, { scroll: false })}
        onFocus={() => focusActivate(command.index, { scroll: true })}
        activation={activation}
        icon={<CommandIcon command={command} />}
        textClassName="mn-tiptap-slash-menu-copy"
        titleClassName="mn-tiptap-slash-menu-title"
        descriptionClassName="mn-tiptap-slash-menu-description"
      />
    </div>
  );
}

function TableSizePicker({ id, language, choose, size, setTableSize, keyboardFocus = false }) {
  const [hoverSize, setHoverSize] = useState(null);
  const activeSize = hoverSize ?? size ?? { rows: 3, cols: 2 };
  const label = tableSizeLabel(language, activeSize.rows, activeSize.cols);

  return (
    <div
      id={id}
      className="mn-tiptap-table-size-picker"
      role="menu"
      aria-label={label}
      data-layout="floating"
      data-keyboard-focus={keyboardFocus ? "true" : "false"}
    >
      <div className="mn-tiptap-table-size-picker-header">
        <span className="mn-tiptap-table-size-picker-title">
          {insertTableLabel(language, size.rows, size.cols)}
        </span>
        <span className="mn-tiptap-table-size-picker-label">
          {label}
        </span>
      </div>
      <div className="mn-tiptap-table-size-picker-grid-shell">
        <div className="mn-tiptap-table-size-picker-grid">
          {Array.from({ length: TABLE_GRID_ROWS }, (_, rowIndex) =>
            Array.from({ length: TABLE_GRID_COLS }, (_, colIndex) => (
              <TableSizePickerCell
                key={`${rowIndex + 1}-${colIndex + 1}`}
                rows={rowIndex + 1}
                cols={colIndex + 1}
                active={rowIndex + 1 <= activeSize.rows && colIndex + 1 <= activeSize.cols}
                selected={rowIndex + 1 === size.rows && colIndex + 1 === size.cols}
                language={language}
                choose={choose}
                setHoverSize={setHoverSize}
                setTableSize={setTableSize}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function TableSizePickerCell({
  rows,
  cols,
  active,
  selected,
  language,
  choose,
  setHoverSize,
  setTableSize,
}) {
  const activation = usePointerActivation(() =>
    choose("table", { tableSize: { rows, cols } }),
  );

  return (
    <button
      type="button"
      className={`mn-tiptap-table-size-picker-cell${active ? " active" : ""}`}
      data-row={String(rows)}
      data-col={String(cols)}
      data-selected={selected ? "true" : "false"}
      aria-label={insertTableLabel(language, rows, cols)}
      aria-current={selected ? "true" : undefined}
      onPointerEnter={() => {
        setHoverSize({ rows, cols });
        setTableSize?.(rows, cols, { focusPanel: false, scroll: false });
      }}
      onPointerLeave={() => setHoverSize(null)}
      {...activation}
    />
  );
}

function CalloutKindPicker({ id, language, choose }) {
  return (
    <div
      id={id}
      className="mn-tiptap-callout-kind-picker"
      role="menu"
    >
      {PAPYRO_CALLOUT_KIND_OPTIONS.map((option) => (
        <CalloutKindOption
          key={option.kind}
          option={option}
          language={language}
          choose={choose}
        />
      ))}
    </div>
  );
}

function CalloutKindOption({ option, language, choose }) {
  const localizedOption = localizeCalloutKindOption(option, language);
  const activation = usePointerActivation(() =>
    choose("callout", { calloutKind: option.kind }),
  );

  return (
    <button
      type="button"
      className="mn-tiptap-callout-kind-option"
      data-callout-kind={option.kind}
      aria-label={calloutOptionLabel(language, localizedOption.title)}
      {...activation}
    >
      <span className="mn-tiptap-callout-kind-tone" aria-hidden="true" />
      <span className="mn-tiptap-callout-kind-copy">
        <span className="mn-tiptap-callout-kind-title">
          {localizedOption.title}
        </span>
        <span className="mn-tiptap-callout-kind-description">
          {localizedOption.description}
        </span>
      </span>
    </button>
  );
}

function CodeLanguagePicker({ id, language, choose }) {
  const commands = useMemo(
    () => createCodeBlockLanguageCommands({ language, includeCustom: false }),
    [language],
  );

  return (
    <div
      id={id}
      className="mn-tiptap-code-language-picker"
      role="menu"
      aria-label={codeBlockLanguagePickerLabel(language)}
    >
      {commands.map((command) => (
        <CodeLanguageOption
          key={command.id}
          command={command}
          choose={choose}
        />
      ))}
    </div>
  );
}

function CodeLanguageOption({ command, choose }) {
  const activation = usePointerActivation(() =>
    choose("code-block", { codeLanguage: command.language }),
  );

  return (
    <button
      type="button"
      className="mn-tiptap-code-language-option"
      data-language-id={command.optionId}
      data-language-value={command.language ?? ""}
      role="menuitem"
      aria-label={command.title}
      {...activation}
    >
      <span className="mn-tiptap-code-language-option-token" aria-hidden="true">
        {command.token}
      </span>
      <span className="mn-tiptap-code-language-option-title">{command.title}</span>
    </button>
  );
}

export function PapyroSlashCommandMenu({
  ownerId,
  state,
  language = "english",
}) {
  const commands = state?.commands ?? [];
  const selectedIndex = state?.selectedIndex ?? 0;
  const hoverIntent = useHoverIntentActivation({ activate: state?.activate });
  const selectedCommand = commands[selectedIndex] ?? null;
  const sidePanel = commandMenuSidePanel(selectedCommand);
  const sidePanelId = commandMenuSidePanelId(ownerId, sidePanel);
  const tableSize = state?.tableSize ?? { rows: 3, cols: 2 };
  const tablePanelHasFocus =
    selectedCommand?.id === "table" && state?.sidePanelFocus === "table";
  const groups = useMemo(() => groupCommandsForMenu(commands), [commands]);
  const title = state?.cleanupRangeOnClose
    ? insertBlockMenuTitleLabel(language)
    : slashQueryMenuTitleLabel(language, state?.query ?? "");

  return (
    <>
      <div className="mn-tiptap-slash-menu-header">
        <div className="mn-tiptap-slash-menu-eyebrow">
          {markdownCommandsLabel(language)}
        </div>
        <div className="mn-tiptap-slash-menu-heading">{title}</div>
      </div>
      <div className="mn-tiptap-slash-menu-list">
        {groups.map((group) => (
          <CommandSection
            key={group.name}
            className="mn-tiptap-slash-menu-section"
            titleClassName="mn-tiptap-slash-menu-section-title"
            title={group.name}
            label={group.name}
          >
            {group.commands.map((command) => (
              <SlashCommandItem
                key={command.id}
                command={command}
                ownerId={ownerId}
                selected={command.index === selectedIndex}
                activePanel={sidePanel}
                language={language}
                activate={(index, options) => hoverIntent.schedule(index, options)}
                focusActivate={hoverIntent.runNow}
                choose={state.choose}
              />
            ))}
          </CommandSection>
        ))}
      </div>
      <div
        className={`mn-tiptap-slash-menu-empty${commands.length > 0 ? " hidden" : ""}`}
      >
        {noCommandsLabel(language)}
      </div>
      {sidePanel === "callout" ? (
        <CalloutKindPicker id={sidePanelId} language={language} choose={state.choose} />
      ) : null}
      {sidePanel === "table" ? (
        <TableSizePicker
          id={sidePanelId}
          language={language}
          choose={state.choose}
          size={tableSize}
          setTableSize={state.setTableSize}
          keyboardFocus={tablePanelHasFocus}
        />
      ) : null}
      {sidePanel === "code-language" ? (
        <CodeLanguagePicker id={sidePanelId} language={language} choose={state.choose} />
      ) : null}
    </>
  );
}
