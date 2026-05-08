import {
  PAPYRO_CODE_LANGUAGE_OPTIONS,
  codeBlockCopiedLabel,
  codeBlockCopyFailedLabel,
  codeBlockCopyLabel,
  codeBlockLanguageDisplayLabel,
  codeBlockLanguageOption,
  codeBlockLanguageOptionToken,
  codeBlockLanguageUiLabel,
  codeBlockWrapLabel,
  normalizeCodeBlockLanguage,
} from "../../tiptap-code-block.js";
import { localizedText } from "../../tiptap-i18n.js";

const CODE_LANGUAGE_GROUP_KEY = "Code language";
const CODE_BLOCK_GROUP_KEY = "Code block";
const COPY_STATES = new Set(["idle", "copied", "failed"]);

function freezeCommand(command) {
  return Object.freeze({
    ...command,
    meta: Object.freeze({ ...(command.meta ?? {}) }),
  });
}

function normalizeCopyState(copyState) {
  const normalized = String(copyState ?? "idle").trim().toLowerCase();
  return COPY_STATES.has(normalized) ? normalized : "idle";
}

function enabledCommandIndexes(commands = []) {
  return (commands ?? [])
    .map((command, index) => (command?.disabled ? null : index))
    .filter((index) => Number.isInteger(index));
}

function groupLabel(language, groupKey) {
  if (groupKey === CODE_LANGUAGE_GROUP_KEY) {
    return localizedText(language, "Code language", "\u4ee3\u7801\u8bed\u8a00");
  }
  return localizedText(language, "Code block", "\u4ee3\u7801\u5757");
}

function languageDescription(language, option) {
  if (!option?.language) {
    return localizedText(
      language,
      "Let Papyro auto-detect this code block",
      "\u8ba9 Papyro \u81ea\u52a8\u68c0\u6d4b\u5f53\u524d\u4ee3\u7801\u5757\u8bed\u8a00",
    );
  }
  return localizedText(
    language,
    `Highlight this block as ${option.label}`,
    `\u5c06\u5f53\u524d\u4ee3\u7801\u5757\u6309 ${option.label} \u9ad8\u4eae`,
  );
}

function customLanguageCommand(language, currentLanguage) {
  const normalized = normalizeCodeBlockLanguage(currentLanguage);
  if (!normalized || codeBlockLanguageOption(normalized)) return null;
  return freezeCommand({
    id: `code-language-custom-${normalized}`,
    optionId: normalized,
    language: normalized,
    title: normalized,
    description: localizedText(
      language,
      "Custom language detected from Markdown",
      "\u4ece Markdown \u68c0\u6d4b\u5230\u7684\u81ea\u5b9a\u4e49\u8bed\u8a00",
    ),
    group: groupLabel(language, CODE_LANGUAGE_GROUP_KEY),
    groupKey: CODE_LANGUAGE_GROUP_KEY,
    icon: "code-language",
    token: codeBlockLanguageOptionToken(normalized),
    active: true,
    disabled: true,
    meta: {
      codeLanguage: normalized,
      custom: true,
    },
  });
}

export function codeBlockLanguagePickerLabel(language = "english") {
  return groupLabel(language, CODE_LANGUAGE_GROUP_KEY);
}

export function createCodeBlockLanguageCommands({
  language = "english",
  currentLanguage = null,
  includeCustom = true,
} = {}) {
  const selectedLanguage = normalizeCodeBlockLanguage(currentLanguage);
  const commands = PAPYRO_CODE_LANGUAGE_OPTIONS.map((option) => {
    const optionLanguage = normalizeCodeBlockLanguage(option.language);
    const active =
      (selectedLanguage ?? null) === (optionLanguage ?? null) ||
      (!selectedLanguage && option.id === "auto");
    return freezeCommand({
      id: `code-language-${option.id}`,
      optionId: option.id,
      language: optionLanguage,
      title: codeBlockLanguageUiLabel(language, optionLanguage),
      description: languageDescription(language, option),
      group: groupLabel(language, CODE_LANGUAGE_GROUP_KEY),
      groupKey: CODE_LANGUAGE_GROUP_KEY,
      icon: "code-language",
      token: codeBlockLanguageOptionToken(option),
      active,
      disabled: false,
      meta: {
        codeLanguage: optionLanguage,
      },
    });
  });

  const custom = includeCustom
    ? customLanguageCommand(language, selectedLanguage)
    : null;
  return Object.freeze(custom ? [...commands, custom] : commands);
}

export function activeCodeBlockLanguageCommandIndex(commands = []) {
  const activeIndex = (commands ?? []).findIndex((command) => command?.active);
  if (activeIndex >= 0) return activeIndex;
  return enabledCommandIndexes(commands)[0] ?? 0;
}

export function nextCodeBlockLanguageCommandIndex(commands = [], currentIndex = 0, direction = 1) {
  const indexes = enabledCommandIndexes(commands);
  if (indexes.length === 0) return activeCodeBlockLanguageCommandIndex(commands);

  const current = Number.isInteger(currentIndex) ? currentIndex : indexes[0];
  const currentEnabledOffset = indexes.indexOf(current);
  if (currentEnabledOffset >= 0) {
    return indexes[(currentEnabledOffset + direction + indexes.length) % indexes.length];
  }

  if (direction < 0) {
    return [...indexes].reverse().find((index) => index < current) ?? indexes.at(-1);
  }
  return indexes.find((index) => index > current) ?? indexes[0];
}

export function createCodeBlockLanguageChrome({
  language = "english",
  currentLanguage = null,
  detectedLanguage = null,
} = {}) {
  const selectedLanguage = normalizeCodeBlockLanguage(currentLanguage);
  const normalizedDetectedLanguage = selectedLanguage
    ? null
    : normalizeCodeBlockLanguage(detectedLanguage);
  const commands = createCodeBlockLanguageCommands({
    language,
    currentLanguage: selectedLanguage,
  });
  const command = commands.find((candidate) => candidate.active) ?? commands[0];
  const label = codeBlockLanguageDisplayLabel(
    language,
    selectedLanguage,
    normalizedDetectedLanguage,
  );
  const actionLabel = localizedText(
    language,
    `Change code language: ${label}`,
    `修改代码语言：${label}`,
  );

  return Object.freeze({
    command,
    label,
    title: actionLabel,
    ariaLabel: actionLabel,
    token: codeBlockLanguageOptionToken(
      selectedLanguage ?? normalizedDetectedLanguage ?? command?.language ?? null,
    ),
    language: selectedLanguage,
    value: selectedLanguage ?? normalizedDetectedLanguage ?? "auto",
    mode: selectedLanguage ? "explicit" : "auto",
    detectedLanguage: normalizedDetectedLanguage ?? "",
    optionId: command?.optionId ?? "auto",
  });
}

export function createCodeBlockChromeCommands({
  language = "english",
  wrapped = false,
  copyState = "idle",
} = {}) {
  const normalizedCopyState = normalizeCopyState(copyState);
  const copyTitle =
    normalizedCopyState === "copied"
      ? codeBlockCopiedLabel(language)
      : normalizedCopyState === "failed"
        ? codeBlockCopyFailedLabel(language)
        : codeBlockCopyLabel(language);
  const wrapTitle = codeBlockWrapLabel(language, wrapped);

  return Object.freeze([
    freezeCommand({
      id: "copy-code",
      title: copyTitle,
      description: localizedText(
        language,
        "Copy this code block to the clipboard",
        "\u590d\u5236\u5f53\u524d\u4ee3\u7801\u5757\u5230\u526a\u8d34\u677f",
      ),
      group: groupLabel(language, CODE_BLOCK_GROUP_KEY),
      groupKey: CODE_BLOCK_GROUP_KEY,
      icon: "copy",
      active: normalizedCopyState === "copied",
      disabled: false,
      state: normalizedCopyState,
      meta: {
        action: "copy",
      },
    }),
    freezeCommand({
      id: "toggle-code-wrap",
      title: wrapTitle,
      description: wrapped
        ? localizedText(
            language,
            "Use horizontal scrolling for long lines",
            "\u957f\u884c\u6539\u4e3a\u6c34\u5e73\u6eda\u52a8",
          )
        : localizedText(
            language,
            "Wrap long code lines inside the block",
            "\u5728\u4ee3\u7801\u5757\u5185\u81ea\u52a8\u6298\u884c\u957f\u884c",
          ),
      group: groupLabel(language, CODE_BLOCK_GROUP_KEY),
      groupKey: CODE_BLOCK_GROUP_KEY,
      icon: "wrap",
      active: !!wrapped,
      pressed: !!wrapped,
      disabled: false,
      meta: {
        action: "wrap",
      },
    }),
  ]);
}
