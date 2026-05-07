import React, { createContext, useContext, useMemo } from "react";

const PapyroTiptapRuntimeContext = createContext(null);

export function normalizePapyroTiptapLanguage(entryOrLanguage) {
  const language =
    typeof entryOrLanguage === "string"
      ? entryOrLanguage
      : entryOrLanguage?.preferences?.language;
  const normalized = String(language ?? "english").toLowerCase();
  if (normalized === "chinese" || normalized === "zh-cn" || normalized === "zh_cn") {
    return "chinese";
  }
  return "english";
}

export function normalizePapyroTiptapViewMode(entryOrMode) {
  const mode =
    typeof entryOrMode === "string" ? entryOrMode : entryOrMode?.viewMode;
  if (mode === "source" || mode === "preview") {
    return mode;
  }
  return "hybrid";
}

export function PapyroTiptapRuntimeProvider({
  editor,
  entry = null,
  children,
}) {
  const value = useMemo(
    () => ({
      editor,
      entry,
      language: normalizePapyroTiptapLanguage(entry),
      viewMode: normalizePapyroTiptapViewMode(entry),
      dioxus: entry?.dioxus ?? null,
      preferences: entry?.preferences ?? null,
    }),
    [
      editor,
      entry,
      entry?.dioxus,
      entry?.preferences,
      entry?.preferences?.language,
      entry?.viewMode,
    ],
  );

  return (
    <PapyroTiptapRuntimeContext.Provider value={value}>
      {children}
    </PapyroTiptapRuntimeContext.Provider>
  );
}

export function usePapyroTiptapRuntime() {
  const context = useContext(PapyroTiptapRuntimeContext);
  if (!context) {
    throw new Error(
      "usePapyroTiptapRuntime must be used inside PapyroTiptapRuntimeProvider",
    );
  }
  return context;
}

export function usePapyroTiptapLanguage() {
  return usePapyroTiptapRuntime().language;
}

export function usePapyroTiptapViewMode() {
  return usePapyroTiptapRuntime().viewMode;
}
