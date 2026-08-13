import "./viewer.css";

import {discoverSparseModels, parseReconstruction} from "./parser";
import type {LocalFile, Reconstruction, SparseModelCandidate} from "./types";
import {ReconstructionViewer} from "./viewer";

export {discoverSparseModels, parseReconstruction, ReconstructionViewer};
export type {LocalFile, Reconstruction};

export interface ColmapViewerOptions {
  onError?: (error: Error) => void;
}

export interface ColmapViewerHandle {
  readonly viewer: ReconstructionViewer;
  load(source: Reconstruction | readonly LocalFile[], imageFiles?: readonly LocalFile[]): Promise<void>;
  clear(): void;
  dispose(): void;
}

const mountedViewers = new WeakMap<HTMLElement, ColmapViewerHandle>();

export function mountColmapViewer(container: HTMLElement, options: ColmapViewerOptions = {}): ColmapViewerHandle {
  mountedViewers.get(container)?.dispose();
  container.classList.add("colmap-viewer-host");
  container.innerHTML = `
    <section class="colmap-viewer" aria-label="COLMAP sparse reconstruction viewer">
      <div class="viewer-workspace">
        <div class="viewer-stage">
          <canvas class="viewer-canvas" data-viewer="canvas" aria-label="Interactive 3D reconstruction"></canvas>
          <div class="viewer-status" data-viewer="status" role="status" hidden></div>
        </div>
      </div>
    </section>`;

  const canvas = viewerElement<HTMLCanvasElement>(container, "canvas");
  let viewer: ReconstructionViewer;
  try {
    viewer = new ReconstructionViewer(canvas);
  } catch (error) {
    const message = `WebGL2 is unavailable: ${error instanceof Error ? error.message : String(error)}`;
    showFatal(container, message);
    throw new Error(message, {cause: error});
  }

  const status = viewerElement<HTMLElement>(container, "status");
  const lifecycle = new AbortController();
  let activeLoad: AbortController | null = null;
  let statusTimeout: number | null = null;
  let disposed = false;

  const setStatus = (message: string | null, error = false): void => {
    if (disposed) return;
    if (statusTimeout !== null) {
      window.clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    status.hidden = message === null;
    status.textContent = message ?? "";
    status.title = message ?? "";
    status.classList.toggle("is-error", error);
  };

  const clearLoadedModel = (): void => {
    viewer.clearReconstruction();
  };

  const displayReconstruction = (parsed: Reconstruction): void => {
    if (disposed) throw new Error("Cannot load a disposed COLMAP viewer");
    viewer.setReconstruction(parsed);
    setStatus(null);
  };

  const showLoadError = (phase: string, error: unknown): Error => {
    const parsedError = error instanceof Error ? error : new Error(String(error));
    clearLoadedModel();
    console.error(`[COLMAP viewer] Failed to ${phase}`, parsedError);
    setStatus(`Failed to ${phase}: ${parsedError.name}: ${parsedError.message || "Unknown error"}`, true);
    options.onError?.(parsedError);
    return parsedError;
  };

  const loadCandidate = async (candidate: SparseModelCandidate): Promise<void> => {
    activeLoad?.abort();
    const load = new AbortController();
    activeLoad = load;
    clearLoadedModel();
    setStatus("Parsing reconstruction...");
    let phase = "parse model";
    try {
      const parsed = await parseInWorker(candidate.files, load.signal);
      if (load.signal.aborted || activeLoad !== load) return;
      phase = "build Three.js scene";
      displayReconstruction(parsed);
    } catch (error) {
      if (load.signal.aborted || activeLoad !== load || (error instanceof DOMException && error.name === "AbortError")) return;
      throw showLoadError(phase, error);
    } finally {
      if (activeLoad === load) activeLoad = null;
    }
  };

  const loadFromEntries = async (entries: LocalFile[]): Promise<void> => {
    const found = discoverSparseModels(entries);
    if (found.length === 0) {
      const error = new Error("No binary sparse model was found in that folder");
      setStatus(error.message, true);
      options.onError?.(error);
      throw error;
    }
    await loadCandidate(found[0]!);
  };

  const listenerOptions = {signal: lifecycle.signal};
  viewer.onError = (error) => {
    console.error("[COLMAP viewer] WebGL render failed", error);
    setStatus(`WebGL render failed: ${error.name}: ${error.message || "Unknown error"}`, true);
    options.onError?.(error);
  };
  viewer.onContextChange = (contextLost) => {
    setStatus(contextLost ? "WebGL context lost. Waiting for the browser to restore it..." : null, contextLost);
  };

  const handle: ColmapViewerHandle = {
    viewer,
    async load(source, _sourceImages = []): Promise<void> {
      if (disposed) throw new Error("Cannot load a disposed COLMAP viewer");
      if (Array.isArray(source)) {
        await loadFromEntries([...source]);
        return;
      }
      activeLoad?.abort();
      const load = new AbortController();
      activeLoad = load;
      clearLoadedModel();
      setStatus("Building Three.js scene...");
      try {
        displayReconstruction(source as Reconstruction);
      } catch (error) {
        throw showLoadError("build Three.js scene", error);
      } finally {
        if (activeLoad === load) activeLoad = null;
      }
    },
    clear(): void {
      if (disposed) return;
      activeLoad?.abort();
      activeLoad = null;
      clearLoadedModel();
      setStatus(null);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      activeLoad?.abort();
      if (statusTimeout !== null) window.clearTimeout(statusTimeout);
      lifecycle.abort();
      viewer.dispose();
      container.replaceChildren();
      container.classList.remove("colmap-viewer-host");
      if (mountedViewers.get(container) === handle) mountedViewers.delete(container);
    },
  };
  mountedViewers.set(container, handle);
  return handle;
}

function viewerElement<T extends Element = HTMLElement>(root: ParentNode, name: string): T {
  const selector = `[data-viewer="${name}"]`;
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing viewer element ${selector}`);
  return element;
}

async function parseInWorker(files: Map<string, File>, signal: AbortSignal): Promise<Reconstruction> {
  const worker = new Worker(new URL("./parser.worker.ts", import.meta.url), {type: "module"});
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      worker.terminate();
      callback();
    };
    const abort = (): void => finish(() => reject(new DOMException("Model load superseded", "AbortError")));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, {once: true});
    worker.onmessage = (event: MessageEvent<{ok: boolean; reconstruction?: Reconstruction; error?: string}>) => {
      if (event.data.ok && event.data.reconstruction) finish(() => resolve(event.data.reconstruction!));
      else finish(() => reject(new Error(event.data.error ?? "Could not parse reconstruction")));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || "Parser worker failed")));
    worker.onmessageerror = () => finish(() => reject(new Error("Parser worker returned an unreadable result")));
    try {
      worker.postMessage(files);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}

function showFatal(container: HTMLElement, message: string): void {
  container.replaceChildren();
  const alert = document.createElement("div");
  alert.className = "viewer-fatal";
  alert.setAttribute("role", "alert");
  alert.textContent = message;
  container.append(alert);
}
