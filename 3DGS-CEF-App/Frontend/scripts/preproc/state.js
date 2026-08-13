// ==================== Preproc 任务状态 (preproc.json) ====================

var _preprocResumeState = null,
    _resumeEffectiveStep = -1;

var _PREPROC_STEP_LABELS = ['', '视频切帧', '特征提取', '特征匹配', 'COLMAP 重建', '完成'];

function _preprocStatePath(od) {
  return od.replace(/[\\/]+$/, '') + '/preproc.json';
}

function collectPreprocStateFields() {
  return {
    inputMode: getInputMode(),
    videoPath: document.getElementById('videoPath').value,
    rgbPath: document.getElementById('rgbPath').value,
    irPath: document.getElementById('irPath').value,
    targetFrames: parseInt(document.getElementById('numImgs').value) || 360,
    imgSize: document.getElementById('imgSize').value,
    colmap: {
      feature: document.getElementById('colmapFeature').value,
      matcher: document.getElementById('colmapMatcher').value,
      imageDir: document.getElementById('imageDir').value,
      databasePath: document.getElementById('databasePath').value,
      sparseOutputPath: document.getElementById('sparseOutputPath').value
    }
  };
}

async function readPreprocState(od) {
  if (!od) return null;
  var path = _preprocStatePath(od);
  try {
    var ok = await FileCEF.exists(path);
    if (!ok) return null;
    var raw = await FileCEF.read(path);
    var state = JSON.parse(_unb64(raw));
    if (!state || typeof state !== 'object') return null;
    state.outputDir = od;
    _preprocResumeState = state;
    return state;
  } catch (e) {
    return null;
  }
}

async function writePreprocState(od, patch) {
  if (!od) return;
  var prev = (_preprocResumeState && _preprocResumeState.outputDir === od) ? _preprocResumeState : null;
  var merged = {
    version: 1,
    startedAt: (prev && prev.startedAt) ? prev.startedAt : new Date().toISOString(),
    outputDir: od
  };
  merged = Object.assign(merged, collectPreprocStateFields(), patch || {});
  merged.updatedAt = new Date().toISOString();
  if (!merged.colmap || typeof merged.colmap !== 'object') merged.colmap = {};
  try {
    try { await FileCEF.mkdir(od); } catch (e) { /* 输出目录可能已存在 */ }
    await FileCEF.write(_preprocStatePath(od), JSON.stringify(merged));
    _preprocResumeState = merged;
  } catch (e) {
    log('写入任务状态失败: ' + (e.message || e), 'error');
  }
}

function applyPreprocStateToUI(state) {
  if (!state) return;
  function set(id, val) {
    if (val === undefined || val === null || val === '') return;
    var el = document.getElementById(id);
    if (el) el.value = val;
  }
  set('inputMode', state.inputMode);
  set('videoPath', state.videoPath);
  set('rgbPath', state.rgbPath);
  set('irPath', state.irPath);
  set('numImgs', state.targetFrames);
  set('imgSize', state.imgSize);
  if (state.colmap) {
    set('colmapFeature', state.colmap.feature);
    set('colmapMatcher', state.colmap.matcher);
    set('imageDir', state.colmap.imageDir);
    set('databasePath', state.colmap.databasePath);
    set('sparseOutputPath', state.colmap.sparseOutputPath);
  }
  var ind = getInputMode() === 'independent';
  var fused = document.getElementById('fusedVideoGroup');
  var indep = document.getElementById('independentVideoGroup');
  if (fused) fused.style.display = ind ? 'none' : '';
  if (indep) indep.style.display = ind ? '' : 'none';
  autoFillCOLMAP();
  fetchVideoInfo();
}

async function verifyPreprocState(state) {
  var step = (state && state.currentStep) || 0;
  var od = state && state.outputDir;
  var ind = !!(state && state.inputMode === 'independent');
  if (!od) return step;
  if (step >= 1 && !ind) {
    var splitOk = await checkFilesExist([od + '/rgb.mp4', od + '/ir.mp4']);
    if (!splitOk) step = 0;
  }
  if (step >= 2) {
    var imgs = [];
    try { imgs = (await FileCEF.list(od + '/imgs')) || []; } catch (e) { imgs = []; }
    var imgCount = imgs.filter(function(f) { return f.is_file; }).length;
    if (imgCount === 0) step = Math.min(step, 1);
  }
  var db = (state.colmap && state.colmap.databasePath) || od + '/colmap/database.db';
  if (step >= 3) {
    var dbOk = await FileCEF.exists(db);
    if (!dbOk) step = Math.min(step, 1);
  }
  var sparse = (state.colmap && state.colmap.sparseOutputPath) || od + '/colmap/sparse';
  if (step >= 4) {
    var sparseOk = await checkFilesExist([sparse + '/cameras.bin', sparse + '/images.bin', sparse + '/points3D.bin']);
    if (!sparseOk) step = Math.min(step, 3);
  }
  return step;
}

function restoreStepsUI(step, isFinished) {
  for (var i = 1; i <= 5; i++) setStepSub(i, '-');
  $$('.step-item').forEach(function(el) {
    var s = parseInt(el.dataset.step);
    var done = isFinished || s < step || step >= 5;
    el.className = 'step-item' + (done ? ' done' : (s === step ? ' active' : ''));
  });
  if (isFinished) setStepSub(5, '已完成');
}

async function restorePreprocState(od, state) {
  applyPreprocStateToUI(state);
  var step = await verifyPreprocState(state);
  var isFinished = !!(state.isFinished && step >= 4);
  if (!isFinished && step >= 4) {
    isFinished = true;
    await writePreprocState(od, { currentStep: 5, currentStepLabel: '完成', isFinished: true });
  }
  _resumeEffectiveStep = step;
  _completedStep = step;
  _stepSplit = step >= 1;
  _stepExtract = step >= 1;
  _colmapCompleted = step >= 4;
  restoreStepsUI(step, isFinished);
  if (isFinished) {
    setProgressLabel('预处理已完成');
    setStatus('预处理完成');
    log('恢复任务: 已完成，加载预览', 'system');
    loadGallery(od);
    await loadSparseModelToViewer();
    updateResults();
  } else {
    setProgressLabel('检测到未完成任务（步骤 ' + step + '：' + _PREPROC_STEP_LABELS[step] + '）');
    setStatus('待继续');
    log('恢复任务: 当前进度步骤 ' + step + '（' + _PREPROC_STEP_LABELS[step] + '），点击「开始预处理」断点继续', 'system');
    if (step >= 2) loadGallery(od);
  }
}

async function onOutputDirChange() {
  var od = document.getElementById('outputDir').value;
  _preprocResumeState = null;
  _resumeEffectiveStep = -1;
  if (!od) return;
  var state = await readPreprocState(od);
  if (!state) {
    log('输出目录未发现 preproc.json，将作为全新任务', 'system');
    return;
  }
  await restorePreprocState(od, state);
}

function ensureColmapViewerReady() {
  if (_colmapViewerMounted && _colmapViewer) return Promise.resolve(true);
  if (window.__viewer) { prepareColmapViewer(); return Promise.resolve(!!_colmapViewer); }
  return new Promise(function(resolve) {
    window.addEventListener('colmap-viewer-ready', function() {
      prepareColmapViewer();
      resolve(!!_colmapViewer);
    }, { once: true });
  });
}

function updateViewerStats() {
  var stats = (_colmapViewer && _colmapViewer.viewer) ? _colmapViewer.viewer.modelStats : null;
  var p = document.getElementById('statPoints');
  var c = document.getElementById('statCameras');
  if (stats) {
    if (p) p.textContent = stats.points.toLocaleString();
    if (c) c.textContent = stats.cameras.toLocaleString();
  } else {
    if (p) p.textContent = '-';
    if (c) c.textContent = '-';
  }
}

async function loadSparseModelToViewer(sparseDir) {
  var od = document.getElementById('outputDir').value;
  if (!sparseDir) {
    sparseDir = document.getElementById('sparseOutputPath').value || od + '/colmap/sparse';
  }
  if (!sparseDir) return;
  var ready = await ensureColmapViewerReady();
  if (!ready) { toast('COLMAP Viewer 未就绪', 'var(--red)'); return; }
  var names = ['cameras.bin', 'images.bin', 'points3D.bin'];
  var ok = await checkFilesExist(names.map(function(n) { return sparseDir + '/' + n; }));
  if (!ok) { log('稀疏模型文件缺失: ' + sparseDir, 'error'); return; }
  var files = [];
  for (var i = 0; i < names.length; i++) {
    try {
      var b64 = await FileCEF.read(sparseDir + '/' + names[i]);
      var bytes = Uint8Array.from(atob(b64), function(c) { return c.charCodeAt(0); });
      files.push({ path: sparseDir + '/' + names[i], file: new File([bytes], names[i]) });
    } catch (e) {
      log('读取 ' + names[i] + ' 失败: ' + (e.message || e), 'error');
      return;
    }
  }
  var loadingEl = document.getElementById('viewerLoading');
  if (loadingEl) {
    loadingEl.innerHTML = '<div class="ring"></div><b>解析中...</b><span>正在加载 COLMAP 稀疏模型</span>';
    loadingEl.style.display = '';
  }
  try {
    await _colmapViewer.load(files);
    if (loadingEl) loadingEl.style.display = 'none';
    var rootEl = document.getElementById('colmap-viewer-root');
    var statsEl = document.getElementById('viewerStats');
    if (rootEl) rootEl.style.display = 'block';
    if (statsEl) statsEl.style.display = 'flex';
    updateViewerStats();
    updateResults();
  } catch (e) {
    if (loadingEl) loadingEl.style.display = 'none';
    showViewerDropHint();
    log('加载 COLMAP 预览失败: ' + (e.message || e), 'error');
  }
}
