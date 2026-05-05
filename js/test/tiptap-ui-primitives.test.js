import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  commandElementId,
  createElement,
  isComposingKeyboardEvent,
  mountFloatingRoot,
  positionFloatingElement,
  setHidden,
  updateActiveDescendant,
  viewportSize,
} from "../src/tiptap-ui-primitives.js";

function createDocument() {
  const body = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    },
  };

  return {
    body,
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        classList: {
          values: new Set(),
          toggle(name, enabled) {
            if (enabled) {
              this.values.add(name);
            } else {
              this.values.delete(name);
            }
          },
        },
        style: {},
        attributes: new Map(),
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
      };
    },
  };
}

test("Tiptap UI primitives clamp values and create command item ids", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(commandElementId("menu", 3), "menu-item-3");
});

test("Tiptap UI primitives detect IME composition keyboard events", () => {
  assert.equal(isComposingKeyboardEvent({ isComposing: true }), true);
  assert.equal(isComposingKeyboardEvent({ nativeEvent: { isComposing: true } }), true);
  assert.equal(isComposingKeyboardEvent({ keyCode: 229 }), true);
  assert.equal(isComposingKeyboardEvent({ which: 229 }), true);
  assert.equal(isComposingKeyboardEvent({ key: "Process" }), true);
  assert.equal(isComposingKeyboardEvent({ key: "Enter" }), false);
});

test("Tiptap UI primitives create and mount floating roots", () => {
  const documentRef = createDocument();
  const element = createElement(documentRef, "div", "mn-floating");

  mountFloatingRoot(element, null, documentRef);

  assert.equal(element.className, "mn-floating");
  assert.deepEqual(documentRef.body.children, [element]);
});

test("Tiptap UI primitives hide elements with hidden and class state", () => {
  const element = createElement(createDocument(), "div", "");

  setHidden(element, true);
  assert.equal(element.hidden, true);
  assert.equal(element.classList.values.has("hidden"), true);

  setHidden(element, false);
  assert.equal(element.hidden, false);
  assert.equal(element.classList.values.has("hidden"), false);
});

test("Tiptap UI primitives position floating elements inside the viewport", () => {
  const element = createElement(createDocument(), "div", "");
  element.offsetWidth = 320;
  element.offsetHeight = 220;

  positionFloatingElement(element, { left: 980, right: 1000, top: 760, bottom: 780 }, {
    viewport: { width: 1000, height: 800 },
    size: { width: 320, height: 220, margin: 10 },
    placement: "bottom",
  });

  assert.equal(element.style.left, "670px");
  assert.equal(element.style.top, "532px");
});

test("Tiptap UI primitives position top and left placements predictably", () => {
  const toolbar = createElement(createDocument(), "div", "");
  toolbar.offsetWidth = 184;
  toolbar.offsetHeight = 38;
  positionFloatingElement(toolbar, { left: 100, right: 160, top: 80, bottom: 108 }, {
    viewport: { width: 400, height: 300 },
    size: { width: 184, height: 38, margin: 10 },
    placement: "top",
  });

  assert.equal(toolbar.style.left, "38px");
  assert.equal(toolbar.style.top, "34px");

  const menu = createElement(createDocument(), "div", "");
  menu.offsetWidth = 280;
  menu.offsetHeight = 248;
  positionFloatingElement(menu, { left: 90, right: 570, top: 40, bottom: 80 }, {
    viewport: { width: 700, height: 500 },
    size: { width: 280, height: 248, margin: 10 },
    placement: "left",
  });

  assert.equal(menu.style.left, "102px");
  assert.equal(menu.style.top, "40px");
});

test("Tiptap UI primitives expose viewport size and active descendant helpers", () => {
  const root = createElement(createDocument(), "div", "");
  updateActiveDescendant(root, "menu", [{ id: "one" }, { id: "two" }], 1);

  assert.equal(root.attributes.get("aria-activedescendant"), "menu-item-1");
  assert.deepEqual(
    viewportSize({
      ownerDocument: {
        documentElement: {
          clientWidth: 640,
          clientHeight: 360,
        },
      },
    }),
    { width: 640, height: 360 },
  );
});
