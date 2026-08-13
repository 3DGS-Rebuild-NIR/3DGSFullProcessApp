import {expect, test} from "@playwright/test";

import {cameraFile, imageFile, pointFile} from "../binary_fixture";

type EncodedFile = {name: string; base64: string};

async function encodeFiles(files: File[]): Promise<EncodedFile[]> {
  return await Promise.all(files.map(async (file) => ({
    name: file.name,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  })));
}

test("initializes the trimmed embedded viewer", async ({page}) => {
  await page.goto("/tests/viewer.html");
  await expect(page.locator('[data-viewer="canvas"]')).toBeAttached();
  await expect(page.locator('[data-viewer="status"]')).toBeHidden();

  // The toolbar (title / reset) and the render controls were removed.
  await expect(page.locator('[data-viewer="title"]')).toHaveCount(0);
  await expect(page.locator('[data-viewer="reset"]')).toHaveCount(0);
  await expect(page.locator('[data-viewer="projection"]')).toHaveCount(0);

  // WebGL context loss is surfaced in the status overlay.
  const canvas = page.locator('[data-viewer="canvas"]');
  await canvas.evaluate((element) => element.dispatchEvent(new Event("webglcontextlost", {cancelable: true})));
  await expect(page.locator('[data-viewer="status"]')).toContainText("WebGL context lost");
  await canvas.evaluate((element) => element.dispatchEvent(new Event("webglcontextrestored")));
  await expect(page.locator('[data-viewer="status"]')).toBeHidden();
});

test("exposes model stats through the viewer handle", async ({page}) => {
  await page.goto("/tests/viewer.html");
  const encoded = await encodeFiles([cameraFile(), imageFile(), pointFile(2, 42n, 3)]);
  const stats = await page.evaluate(async (list: EncodedFile[]) => {
    const modulePath = "/viewer_src/main.ts";
    const {mountColmapViewer} = await import(/* @vite-ignore */ modulePath) as typeof import("../../viewer_src/main");
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountColmapViewer(host);
    const files = list.map(({name, base64}) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      return {path: name, file: new File([bytes], name)};
    });
    try {
      await handle.load(files);
      return handle.viewer.modelStats;
    } finally {
      handle.dispose();
    }
  }, encoded);
  expect(stats).toEqual({registeredImages: 1, cameras: 1, points: 1, meanReprojectionError: 0.25});
});

test("rejects malformed models and clears the model", async ({page}) => {
  await page.goto("/tests/viewer.html");
  const good = await encodeFiles([cameraFile(), imageFile(), pointFile(2, 42n, 3)]);
  const malformed = good.map((entry) => entry.name === "cameras.bin" ? {...entry, base64: Buffer.from([1]).toString("base64")} : entry);
  const result = await page.evaluate(async (list: EncodedFile[]) => {
    const modulePath = "/viewer_src/main.ts";
    const {mountColmapViewer} = await import(/* @vite-ignore */ modulePath) as typeof import("../../viewer_src/main");
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountColmapViewer(host);
    const files = list.map(({name, base64}) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      return {path: name, file: new File([bytes], name)};
    });
    try {
      let message = "";
      try {
        await handle.load(files);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      return {
        message,
        status: host.querySelector('[data-viewer="status"]')?.textContent ?? "",
        stats: handle.viewer.modelStats,
      };
    } finally {
      handle.dispose();
    }
  }, malformed);
  expect(result.status).toContain("Failed to parse model");
  expect(result.message).toContain("Failed to parse model");
  expect(result.stats).toBeNull();
});

test("dispose tears the host down", async ({page}) => {
  await page.goto("/tests/viewer.html");
  const lifecycle = await page.evaluate(async () => {
    const modulePath = "/viewer_src/main.ts";
    const {mountColmapViewer} = await import(/* @vite-ignore */ modulePath) as typeof import("../../viewer_src/main");
    const host = document.createElement("div");
    document.body.append(host);
    const handle = mountColmapViewer(host);
    handle.clear();
    handle.dispose();
    return {childCount: host.childElementCount, hasHostClass: host.classList.contains("colmap-viewer-host")};
  });
  expect(lifecycle).toEqual({childCount: 0, hasHostClass: false});
});
