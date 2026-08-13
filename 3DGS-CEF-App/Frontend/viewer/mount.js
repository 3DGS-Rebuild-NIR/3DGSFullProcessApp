import { mountColmapViewer, discoverSparseModels, parseReconstruction } from './component.js';
window.__viewer = { mountColmapViewer, discoverSparseModels, parseReconstruction };
window.dispatchEvent(new CustomEvent('colmap-viewer-ready'));