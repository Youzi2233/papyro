import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Window } from "happy-dom";
import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  PAPYRO_MERMAID_CONFIG,
  createMermaidRenderer,
  friendlyMermaidErrorMessage,
  mermaidSvgErrorMessage,
} = await importBundledModule(
  new URL("../src/mermaid-renderer.js", import.meta.url),
);

function installDomGlobals(windowRef) {
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: windowRef,
    document: windowRef.document,
    HTMLElement: windowRef.HTMLElement,
    Element: windowRef.Element,
    Document: windowRef.Document,
    DOMParser: windowRef.DOMParser,
  })) {
    previous.set(name, {
      exists: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    });
    globalThis[name] = value;
  }
  return previous;
}

function restoreDomGlobals(previous) {
  for (const [name, record] of previous.entries()) {
    if (record.exists) {
      globalThis[name] = record.value;
    } else {
      delete globalThis[name];
    }
  }
}

function createFakeMermaid(renderImplementation) {
  const calls = {
    initialize: [],
    render: [],
    bind: [],
  };
  return {
    calls,
    api: {
      initialize(config) {
        calls.initialize.push(config);
      },
      render(id, source) {
        calls.render.push({ id, source });
        return renderImplementation(id, source, calls);
      },
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

test("Papyro Mermaid config keeps rendering local documents in strict mode", () => {
  assert.deepEqual(PAPYRO_MERMAID_CONFIG, {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    htmlLabels: false,
    secure: [
      "secure",
      "securityLevel",
      "startOnLoad",
      "maxTextSize",
      "suppressErrorRendering",
      "htmlLabels",
      "dompurifyConfig",
    ],
  });
});

test("renderMermaidIntoElement initializes Mermaid once and writes rendered SVG", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previous = installDomGlobals(windowRef);
  const { api, calls } = createFakeMermaid((id, source, callLog) => ({
    svg: `<svg id="${id}"><text>${escapeHtml(source)}</text></svg>`,
    bindFunctions(element) {
      callLog.bind.push(element.className);
    },
  }));
  const renderer = createMermaidRenderer({ mermaidApi: api });
  const target = windowRef.document.createElement("div");

  try {
    assert.equal(await renderer.renderMermaidIntoElement(target, " flowchart TD\nA --> B "), true);
    assert.equal(await renderer.renderMermaidIntoElement(target, "sequenceDiagram\nA->>B: Hi"), true);

    assert.equal(calls.initialize.length, 1);
    assert.deepEqual(calls.initialize[0], PAPYRO_MERMAID_CONFIG);
    assert.deepEqual(
      calls.render.map(({ source }) => source),
      ["flowchart TD\nA --> B", "sequenceDiagram\nA->>B: Hi"],
    );
    assert.equal(target.dataset.mermaidState, "rendered");
    assert.equal(target.dataset.mermaidSource, "sequenceDiagram\nA->>B: Hi");
    assert.equal(target.querySelector(".mn-mermaid-svg svg text")?.textContent, "sequenceDiagram\nA->>B: Hi");
    assert.deepEqual(calls.bind, ["mn-mermaid-svg", "mn-mermaid-svg"]);
  } finally {
    restoreDomGlobals(previous);
    windowRef.close?.();
  }
});

test("renderMermaidIntoElement reports friendly errors without leaking Mermaid fallback SVG", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previous = installDomGlobals(windowRef);
  const { api } = createFakeMermaid(() => {
    throw new Error("Parse error on line 2");
  });
  const renderer = createMermaidRenderer({ mermaidApi: api });
  const target = windowRef.document.createElement("div");

  try {
    assert.equal(await renderer.renderMermaidIntoElement(target, "broken"), false);
    assert.equal(target.dataset.mermaidState, "error");
    assert.equal(target.querySelector(".mn-mermaid-label")?.textContent, "Mermaid render failed");
    assert.equal(target.querySelector(".mn-mermaid-detail")?.textContent, "Mermaid syntax error.");
    assert.equal(target.querySelector("svg"), null);
  } finally {
    restoreDomGlobals(previous);
    windowRef.close?.();
  }
});

test("renderMermaidIntoElement ignores stale async results", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previous = installDomGlobals(windowRef);
  const pending = [];
  const { api } = createFakeMermaid((id, source) => new Promise((resolve) => {
    pending.push({ id, source, resolve });
  }));
  const renderer = createMermaidRenderer({ mermaidApi: api });
  const target = windowRef.document.createElement("div");

  try {
    const firstRender = renderer.renderMermaidIntoElement(target, "flowchart TD\nOld --> Result");
    const secondRender = renderer.renderMermaidIntoElement(target, "flowchart TD\nNew --> Result");

    pending[1].resolve({ svg: "<svg><text>new</text></svg>" });
    assert.equal(await secondRender, true);
    assert.equal(target.dataset.mermaidState, "rendered");
    assert.equal(target.querySelector(".mn-mermaid-svg text")?.textContent, "new");

    pending[0].resolve({ svg: "<svg><text>old</text></svg>" });
    assert.equal(await firstRender, false);
    assert.equal(target.querySelector(".mn-mermaid-svg text")?.textContent, "new");
  } finally {
    restoreDomGlobals(previous);
    windowRef.close?.();
  }
});

test("renderPreviewMermaid renders only changed Preview blocks", async () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previous = installDomGlobals(windowRef);
  const { api, calls } = createFakeMermaid((id, source) => ({
    svg: `<svg><text>${escapeHtml(source)}</text></svg>`,
  }));
  const renderer = createMermaidRenderer({ mermaidApi: api });

  try {
    windowRef.document.body.innerHTML = `
      <main class="mn-preview">
        <div id="first" class="mn-mermaid-block"><pre class="mn-mermaid-source">flowchart TD
A --> B</pre></div>
        <div id="empty" class="mn-mermaid-block"><pre class="mn-mermaid-source">   </pre></div>
      </main>
    `;

    assert.equal(renderer.renderPreviewMermaid(windowRef.document), 1);
    await delay(0);
    assert.equal(calls.render.length, 1);
    assert.equal(windowRef.document.querySelector("#first")?.dataset.mermaidState, "rendered");

    assert.equal(renderer.renderPreviewMermaid(windowRef.document), 0);
    await delay(0);
    assert.equal(calls.render.length, 1);

    const source = windowRef.document.createElement("pre");
    source.className = "mn-mermaid-source";
    source.textContent = "flowchart TD\nA --> C";
    windowRef.document.querySelector("#first")?.append(source);
    assert.equal(renderer.renderPreviewMermaid(windowRef.document), 1);
    await delay(0);
    assert.equal(calls.render.length, 2);
    assert.equal(
      windowRef.document.querySelector("#first .mn-mermaid-svg text")?.textContent,
      "flowchart TD\nA --> C",
    );
  } finally {
    restoreDomGlobals(previous);
    windowRef.close?.();
  }
});

test("Mermaid error helpers normalize common parser and runtime failures", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const previous = installDomGlobals(windowRef);

  try {
  assert.equal(friendlyMermaidErrorMessage(""), "Mermaid diagram could not be rendered.");
  assert.equal(friendlyMermaidErrorMessage("Syntax error in text"), "Mermaid syntax error.");
  assert.equal(friendlyMermaidErrorMessage("Purify.sanitize is not a function"), "Mermaid render is unavailable in this runtime.");
  assert.equal(friendlyMermaidErrorMessage("Mermaid render timed out"), "Mermaid render timed out.");
  assert.equal(friendlyMermaidErrorMessage("Custom error"), "Custom error");

  assert.equal(mermaidSvgErrorMessage(""), "Mermaid diagram could not be rendered.");
  assert.equal(mermaidSvgErrorMessage("<svg><text>Parse error on line 2</text></svg>"), "Parse error");
  assert.equal(
    mermaidSvgErrorMessage("<svg><g class=\"error-icon\"></g><text class=\"error-text\">Bad syntax</text></svg>"),
    "Bad syntax",
  );
  } finally {
    restoreDomGlobals(previous);
    windowRef.close?.();
  }
});
