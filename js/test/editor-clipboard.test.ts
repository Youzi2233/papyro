import test from "node:test";
import assert from "node:assert/strict";

import {
  blobToBase64,
  dataUrlPayload,
  imageFileFromTransfer,
  sendEditorImageRequest,
} from "../src/editor-clipboard.js";

test("dataUrlPayload strips the data URL prefix", () => {
  assert.equal(dataUrlPayload("data:image/png;base64,abc123"), "abc123");
  assert.equal(dataUrlPayload("plain-base64"), "plain-base64");
});

test("blobToBase64 reads blobs through the provided FileReader", async () => {
  class FakeFileReader {
    readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${blob.payload}`;
      this.onload();
    }
  }

  const data = await blobToBase64(
    { type: "image/png", payload: "abc123" },
    FakeFileReader,
  );

  assert.equal(data, "abc123");
});

test("imageFileFromTransfer prefers image transfer items", () => {
  const file = { type: "image/png", name: "paste.png" };
  const image = imageFileFromTransfer({
    items: [
      { kind: "string", type: "text/plain" },
      { kind: "file", type: "application/pdf", getAsFile: () => ({}) },
      { kind: "file", type: "image/png", getAsFile: () => file },
    ],
    files: [{ type: "image/jpeg", name: "fallback.jpg" }],
  });

  assert.deepEqual(image, { file, mimeType: "image/png" });
});

test("imageFileFromTransfer falls back to image files", () => {
  const file = { type: "image/jpeg", name: "drop.jpg" };
  const image = imageFileFromTransfer({
    items: [],
    files: [{ type: "text/plain" }, file],
  });

  assert.deepEqual(image, { file, mimeType: "image/jpeg" });
});

test("sendEditorImageRequest emits the Rust paste image protocol", async () => {
  const messages = [];
  const sent = await sendEditorImageRequest({
    tabId: "tab-a",
    image: {
      file: { type: "", payload: "drop123" },
      mimeType: "image/jpeg",
    },
    getEntry: () => ({ dioxus: { send: (message) => messages.push(message) } }),
    readBlobAsBase64: async (file) => file.payload,
  });

  assert.equal(sent, true);
  assert.deepEqual(messages, [
    {
      type: "paste_image_requested",
      tab_id: "tab-a",
      mime_type: "image/jpeg",
      data: "drop123",
    },
  ]);
});

test("sendEditorImageRequest reports missing channels without emitting", async () => {
  assert.equal(
    await sendEditorImageRequest({
      tabId: "tab-a",
      image: { file: { type: "image/png" } },
      getEntry: () => null,
      readBlobAsBase64: async () => "abc123",
    }),
    false,
  );
});
