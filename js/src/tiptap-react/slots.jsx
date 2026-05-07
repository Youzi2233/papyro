import React from "react";

export function renderIslandSlot(SlotComponent, runtime) {
  if (!SlotComponent) return null;
  if (React.isValidElement(SlotComponent)) return SlotComponent;
  if (typeof SlotComponent === "function") {
    return <SlotComponent {...runtime} />;
  }
  return null;
}

export function createPapyroTiptapReactComponents(components = {}) {
  return {
    BeforeContent: null,
    EditorContent: null,
    AfterContent: null,
    OverlayLayer: null,
    ...components,
  };
}
