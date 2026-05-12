import test from "node:test";
import assert from "node:assert/strict";

import {
  blobToBase64,
  dataUrlPayload,
  imageFileFromFile,
  imageFileFromFiles,
  imageFileFromTransfer,
  sendEditorImageRequest,
  supportedImageMimeType,
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

test("supportedImageMimeType normalizes supported editor images", () => {
  assert.equal(supportedImageMimeType("image/png"), "image/png");
  assert.equal(supportedImageMimeType("image/jpg"), "image/jpeg");
  assert.equal(supportedImageMimeType("IMAGE/WEBP; charset=binary"), "image/webp");
  assert.equal(supportedImageMimeType("", "capture.GIF"), "image/gif");
  assert.equal(supportedImageMimeType("image/svg+xml", "vector.svg"), "");
  assert.equal(supportedImageMimeType("application/octet-stream", "photo.png"), "");
});

test("imageFileFromFile accepts extension fallback only when MIME is missing", () => {
  const file = { type: "", name: "drop.webp" };

  assert.deepEqual(imageFileFromFile(file), { file, mimeType: "image/webp" });
  assert.equal(imageFileFromFile({ type: "application/octet-stream", name: "drop.webp" }), null);
});

test("imageFileFromFiles returns the first supported editor image", () => {
  const file = { type: "", name: "paste.png" };

  assert.deepEqual(
    imageFileFromFiles([
      { type: "text/plain", name: "note.txt" },
      { type: "image/svg+xml", name: "vector.svg" },
      file,
    ]),
    { file, mimeType: "image/png" },
  );
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

test("imageFileFromTransfer supports dropped files with missing MIME", () => {
  const file = { type: "", name: "screenshot.png" };
  const image = imageFileFromTransfer({
    items: [
      { kind: "file", type: "", getAsFile: () => file },
    ],
    files: [],
  });

  assert.deepEqual(image, { file, mimeType: "image/png" });
});

test("imageFileFromTransfer ignores unsupported image-like files", () => {
  const image = imageFileFromTransfer({
    items: [
      {
        kind: "file",
        type: "image/svg+xml",
        getAsFile: () => ({ type: "image/svg+xml", name: "vector.svg" }),
      },
    ],
    files: [{ type: "image/bmp", name: "bitmap.bmp" }],
  });

  assert.equal(image, null);
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

test("sendEditorImageRequest does not read blobs without a live channel", async () => {
  let read = false;
  const sent = await sendEditorImageRequest({
    tabId: "tab-a",
    image: { file: { type: "image/png" } },
    getEntry: () => ({ dioxus: {} }),
    readBlobAsBase64: async () => {
      read = true;
      return "abc123";
    },
  });

  assert.equal(sent, false);
  assert.equal(read, false);
});

test("sendEditorImageRequest rejects empty pasted image data", async () => {
  await assert.rejects(
    sendEditorImageRequest({
      tabId: "tab-a",
      image: { file: { type: "", name: "paste.png" } },
      getEntry: () => ({ dioxus: { send: () => {} } }),
      readBlobAsBase64: async () => " ",
    }),
    /empty/u,
  );
});

test("sendEditorImageRequest refuses unsupported image protocols", async () => {
  const messages = [];
  const sent = await sendEditorImageRequest({
    tabId: "tab-a",
    image: { file: { type: "image/svg+xml", name: "vector.svg" } },
    getEntry: () => ({ dioxus: { send: (message) => messages.push(message) } }),
    readBlobAsBase64: async () => "abc123",
  });

  assert.equal(sent, false);
  assert.deepEqual(messages, []);
});
