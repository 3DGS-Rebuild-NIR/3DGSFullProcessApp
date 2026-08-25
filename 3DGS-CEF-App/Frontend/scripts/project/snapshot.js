// ==================== 工程状态快照 ====================
// 采集 / 恢复 当前界面与运行状态，确保打开工程时自动跳转到
// 之前的操作界面与进度状态。
var ProjectSnapshot = (function () {

  function _txt(id) {
    var e = document.getElementById(id);
    return e ? e.textContent : '';
  }

  function gather() {
    var activeTabEl = document.querySelector('.tab.active');
    var activeTab = activeTabEl ? activeTabEl.dataset.tab : 'preproc';

    var pre = (typeof collectPreprocStateFields === 'function') ? collectPreprocStateFields() : {};
    pre.outputDir = $val('outputDir');

    var step = (typeof _currentStep !== 'undefined') ? _currentStep : 0;

    var progress = {
      step: step,
      label: _txt('progressLabel'),
      status: (typeof Recon !== 'undefined' && Recon.training) ? 'running'
            : (typeof _pipelineRunning !== 'undefined' && _pipelineRunning) ? 'running'
            : 'idle',
      results: {
        images: _txt('resImages'),
        points: _txt('resPoints'),
        registered: _txt('resRegistered'),
        repError: _txt('resError'),
        time: _txt('resTime')
      },
      recon: {
        psnr: _txt('reconPSNR'), ssim: _txt('reconSSIM'), msssim: _txt('reconMSSSIM'),
        rmse: _txt('reconRMSE'), mae: _txt('reconMAE'), lpips: _txt('reconLPIPS'),
        renderSpeed: _txt('reconRenderSpeed'),
        imgCount: _txt('reconImgCount'), pointCount: _txt('reconPointCount'), camCount: _txt('reconCamCount'),
        curStep: _txt('reconCurrentStep'), maxStep: _txt('reconMaxStep'), pct: _txt('reconProgressPct')
      }
    };

    var recon = (typeof gatherConfig === 'function') ? gatherConfig() : {};
    var capture = (typeof _captureTrajectories !== 'undefined')
      ? { sel: (_captureState ? _captureState.sel : 0), trajectories: _captureTrajectories }
      : null;

    return { activeTab: activeTab, preproc: pre, progress: progress, recon: recon, capture: capture };
  }

  function applyProgress(p) {
    if (!p) return;
    function set(id, v) { var e = $id(id); if (e && v != null && v !== '') e.textContent = v; }

    if (p.label) set('progressLabel', p.label);
    if (p.results) {
      set('resImages', p.results.images);
      set('resPoints', p.results.points);
      set('resRegistered', p.results.registered);
      set('resError', p.results.repError);
      set('resTime', p.results.time);
    }
    if (p.recon) {
      var r = p.recon;
      set('reconPSNR', r.psnr); set('reconSSIM', r.ssim); set('reconMSSSIM', r.msssim);
      set('reconRMSE', r.rmse); set('reconMAE', r.mae); set('reconLPIPS', r.lpips);
      set('reconRenderSpeed', r.renderSpeed);
      set('reconImgCount', r.imgCount); set('reconPointCount', r.pointCount); set('reconCamCount', r.camCount);
      set('reconCurrentStep', r.curStep); set('reconMaxStep', r.maxStep); set('reconProgressPct', r.pct);
      var fill = $id('reconProgressFill');
      if (fill && r.pct) { var m = /([\d.]+)%/.exec(r.pct); if (m) fill.style.width = m[1] + '%'; }
    }

    var step = p.step || 0;
    if (p.status === 'done' && typeof restoreStepsUI === 'function') restoreStepsUI(step, true);
    else if (typeof setActiveStep === 'function') setActiveStep(step);
  }

  function apply(state) {
    if (!state) return;

    if (state.preproc) {
      var st = state.preproc;
      var fake = {
        inputMode: st.inputMode, videoPath: st.videoPath, rgbPath: st.rgbPath, irPath: st.irPath,
        targetFrames: st.targetFrames, imgSize: st.imgSize,
        colmap: st.colmap || {}
      };
      if (typeof applyPreprocStateToUI === 'function') applyPreprocStateToUI(fake);
      if (st.outputDir) { var od = $id('outputDir'); if (od) od.value = st.outputDir; }
      if (typeof onInputModeChange === 'function') onInputModeChange();
    }

    if (state.recon && typeof applyConfig === 'function') applyConfig(state.recon);

    if (state.capture && typeof _captureTrajectories !== 'undefined') {
      _captureTrajectories = state.capture.trajectories || [];
      if (_captureState) _captureState.sel = state.capture.sel || 0;
      if (typeof _saveTrajectories === 'function') _saveTrajectories();
      if (typeof renderTrajectories === 'function') renderTrajectories();
    }

    if (state.progress) applyProgress(state.progress);

    var tab = state.activeTab || 'preproc';
    var tabEl = document.querySelector('.tab[data-tab="' + tab + '"]');
    if (tabEl) tabEl.click();
  }

  return { gather: gather, apply: apply, applyProgress: applyProgress };
})();
