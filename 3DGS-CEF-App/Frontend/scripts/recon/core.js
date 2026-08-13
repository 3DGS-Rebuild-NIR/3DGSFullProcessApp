var Recon = {
  training: false, step: 0, total: 30000, mode: 'rgb',
  metrics: { psnr: '-', ssim: '-', lpips: '-', speed: '-', timeLeft: '--:--:--' },
  plyLoaded: false,
  _scene: null, _cam: null, _engine: null, _plyRoot: null,
  _startTime: null, _timerInterval: null
};

var _ = {};

function initRecon() {
  bindSliders();
  bindViewpoints();
  $id('reconStartBtn').addEventListener('click', startReconTraining);
  $id('reconStopBtn').addEventListener('click', stopReconTraining);
  loadReconPrefs();
  queryGPUInfo();
  document.querySelectorAll('.settings-section-header').forEach(function(h){
    h.addEventListener('click', function(){
      var body = this.nextElementSibling;
      if (!body || !body.classList.contains('sec-body')) return;
      var isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? '' : 'none';
      this.classList.toggle('collapsed', !isCollapsed);
      this.classList.toggle('expanded', isCollapsed);
    });
  });
  $id('reconEnableIR').addEventListener('change', function() {
    var subs = this.closest('.ir-sub-settings');
    if (subs) subs.querySelectorAll('input, select, button').forEach(function(el) {
      if (el.id !== 'reconEnableIR') el.disabled = !this.checked;
    }.bind(this));
  });
  setTimeout(initPLYViewer, 100);
}

function queryGPUInfo() {
  sendRequest('getSystemPerformance').then(function(r) {
    if (!r) return;
    try {
      var d = JSON.parse(r);
      if (d.gpu && d.gpu.length > 0) {
        var g = d.gpu[0];
        RecLog('GPU: ' + g.name + ' · 显存 ' + g.dedicatedMemoryMB.toFixed(0) + ' MB', 'info');
      }
    } catch(e) {}
  }).catch(function() {});
}

function paintSlider(el) {
  var mn = parseFloat(el.min), mx = parseFloat(el.max);
  var pct = ((parseFloat(el.value) - mn) / (mx - mn)) * 100;
  el.style.background = 'linear-gradient(to right, var(--blue) 0%, var(--blue) ' + pct +
    '%, var(--line) ' + pct + '%, var(--line) 100%)';
}

function bindSliders() {
  [['reconTrainSteps','reconTrainStepsVal'],['reconMaxSplats','reconMaxSplatsVal'],
   ['reconIRSteps','reconIRStepsVal'],['reconIRLR','reconIRLRVal'],
   ['reconIRRefine','reconIRRefineVal'],['reconSHDegree','reconSHDegreeVal'],
   ['reconMaxResolution','reconMaxResolutionVal']].forEach(function(p){
    var s = $id(p[0]), n = $id(p[1]);
    if (!s || !n) return;
    s.addEventListener('input', function() { n.value = s.value; paintSlider(s); });
    n.addEventListener('input', function() { s.value = n.value; paintSlider(s); });
    paintSlider(s);
  });
  var t = $id('reconTotalSteps');
  if (t) t.addEventListener('change', function() {
    Recon.total = parseInt(t.value) || 30000;
    $txt('reconMaxStep', Recon.total);
    updateReconProgress();
  });
}

function setTrainMode(mode) {
  Recon.mode = mode;
  document.querySelectorAll('.train-mode-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

function startReconTraining() {
  if (Recon.training) return;
  var args = buildBrushArgs();
  var hasIR = $id('reconEnableIR') && $id('reconEnableIR').checked;
  Recon.training = true; Recon.step = 0;
  Recon._startTime = Date.now();
  startReconTimer();
  updateReconUI();
  $txt('barStatus', '训练中' + (hasIR ? ' (RGB + IR)' : ' (RGB)'));
  RecLog('启动训练: ' + args, 'system');
  toast('训练已开始');
  ReconCEF.send(args).catch(function(e) {
    RecLog('CEF 通信结束: ' + e.message + ' (训练可能仍在后台运行)', 'system');
  });
}

function stopReconTraining() {
  if (!Recon.training) return;
  if (!confirm('确定停止训练？当前: ' + Recon.step + '/' + Recon.total)) return;
  ReconCEF.killBrush().then(function() {
    Recon.training = false; stopReconTimer();
    updateReconUI();
    $txt('barStatus', '训练已停止');
    RecLog('训练已停止', 'system');
    toast('训练已停止');
  }).catch(function(e) { toast('停止失败', 'var(--red)'); });
}

function startReconTimer() {
  stopReconTimer();
  Recon._timerInterval = setInterval(function() {
    if (!Recon._startTime) return;
    var elapsed = Math.floor((Date.now() - Recon._startTime) / 1000);
    var h = Math.floor(elapsed / 3600);
    var m = Math.floor((elapsed % 3600) / 60);
    var s = elapsed % 60;
    var fmt = (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    $txt('reconTimeLeft', fmt);
  }, 1000);
}

function stopReconTimer() {
  if (Recon._timerInterval) { clearInterval(Recon._timerInterval); Recon._timerInterval = null; }
}

function updateReconUI() {
  var sb = $id('reconStopBtn');
  if (sb) sb.disabled = !Recon.training;
  var st = $id('reconStartBtn');
  if (st) st.disabled = Recon.training;
}

function updateReconProgress() {
  $txt('reconCurrentStep', Recon.step);
  $txt('reconMaxStep', Recon.total);
  var pct = Recon.total > 0 ? (Recon.step / Recon.total) * 100 : 0;
  var pf = $id('reconProgressFill');
  if (pf) pf.style.width = pct + '%';
  $txt('reconProgressPct', pct.toFixed(2) + '%');
}

function updateReconMetrics(m) {
  if (m.psnr != null) { $txt('reconPSNR', Number(m.psnr).toFixed(2)); Recon.metrics.psnr = m.psnr; }
  if (m.ssim != null) { $txt('reconSSIM', Number(m.ssim).toFixed(3)); Recon.metrics.ssim = m.ssim; }
  if (m.lpips != null) { $txt('reconLPIPS', Number(m.lpips).toFixed(3)); Recon.metrics.lpips = m.lpips; }
  if (m.speed != null) { $txt('reconRenderSpeed', Number(m.speed).toFixed(1) + ' it/s'); Recon.metrics.speed = m.speed; }
  if (m.step != null) { Recon.step = parseInt(m.step); updateReconProgress(); }
  if (m.total != null) { Recon.total = parseInt(m.total); updateReconProgress(); }
  if (m.plyPath) loadPLYModel(m.plyPath);
  if (m.status === 'complete' || m.status === 'done') {
    Recon.training = false; updateReconUI();
    $txt('barStatus', '训练完成'); toast('训练完成！');
  }
}
