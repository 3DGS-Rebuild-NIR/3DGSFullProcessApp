var _videoInfo = null,
    _calcFps = 0,
    _calcSplitH = 0,
    _stepSplit = false,
    _stepExtract = false,
    _pipelineRunning = false,
    _pipelineStartTime = 0,
    _currentStep = 0,
    _completedStep = 0,
    _galleryPage = 1,
    _galleryPageSize = 10,
    _galleryImages = [],
    _colmapCompleted = false;

function getInputMode() {
  var sel = document.getElementById('inputMode');
  return sel && sel.value ? sel.value : 'independent';
}

function getVideoPaths() {
  if (getInputMode() === 'independent') {
    return {
      rgb: document.getElementById('rgbPath').value,
      ir: document.getElementById('irPath').value
    };
  }
  var vp = document.getElementById('videoPath').value;
  return { rgb: vp, ir: vp };
}

function onInputModeChange() {
  var ind = getInputMode() === 'independent';
  var fused = document.getElementById('fusedVideoGroup');
  var indep = document.getElementById('independentVideoGroup');
  if (fused) fused.style.display = ind ? 'none' : '';
  if (indep) indep.style.display = ind ? '' : 'none';
  _stepSplit = false; _stepExtract = false;
  fetchVideoInfo();
}

function setActiveStep(s) {
  _currentStep = s;
  $$('.step-item').forEach(function(el) {
    var step = parseInt(el.dataset.step);
    el.className = 'step-item' + (step < s ? ' done' : step === s ? ' active' : '');
  });
}

function setStepSub(step, text) {
  var el = document.getElementById('step' + step + 'Sub');
  if (el) el.textContent = text;
}

function resetSteps() {
  _currentStep = 0;
  $$('.step-item').forEach(function(el) { el.className = 'step-item'; });
  for (var i = 1; i <= 5; i++) setStepSub(i, '-');
}

function setButtonsDisabled(d) {
  document.querySelectorAll('.btn-p, .btn-danger').forEach(function(b) { b.disabled = d; });
  document.getElementById('btnStop').disabled = !d;
}

function pickVideo(inputId) {
  log('打开文件对话框...', 'system');
  DialogCEF.openFile({
    title: '选择视频',
    filters: '视频文件|*.mp4;*.mov;*.avi;*.mkv||所有文件|*.*'
  }).then(function(path) {
    if (path) {
      document.getElementById(inputId).value = path;
      var od = document.getElementById('outputDir');
      if (getInputMode() === 'fused' && !od.value) {
        var parts = path.replace(/\\/g, '/').split('/');
        var name = parts.pop().replace(/\.[^.]+$/, '');
        od.value = parts.join('/') + '/' + name + '_output';
      }
      _stepSplit = false; _stepExtract = false;
      fetchVideoInfo();
      log('文件: ' + path, 'system');
    } else { log('未选择文件', 'system'); }
  }).catch(function(e) { log('文件对话框错误: ' + e.message, 'error'); });
}

function pickDir(inputId) {
  log('打开目录对话框...', 'system');
  DialogCEF.pickDir({ title: '选择目录' }).then(function(path) {
    if (path) {
      document.getElementById(inputId).value = path;
      log('目录: ' + path, 'system');
      if (inputId === 'outputDir' && typeof onOutputDirChange === 'function') onOutputDirChange();
    } else { log('未选择目录', 'system'); }
  }).catch(function(e) { log('目录对话框错误: ' + e.message, 'error'); });
}

async function fetchVideoInfo() {
  var vp = getVideoPaths().rgb;
  if (!vp) { _videoInfo = null; return; }
  setStatus('获取视频信息中...', 'processing');
  try {
    var res = await PreprocCEF.getVideoInfo(vp);
    if (!res) throw new Error('未返回视频信息');
    _videoInfo = JSON.parse(res);
    var n = parseInt(document.getElementById('numImgs').value) || 360;
    _calcSplitH = Math.floor(_videoInfo.height / 2);
    _calcFps = n / _videoInfo.duration;
    var interval = (_videoInfo.fps / _calcFps).toFixed(1);
    document.getElementById('videoInfoHint').textContent =
      '原始时长：' + _videoInfo.duration.toFixed(1) + 's  原始帧率：' + _videoInfo.fps + 'fps  预计抽帧间隔：' + interval;
    log('视频: ' + _videoInfo.width + 'x' + _videoInfo.height +
      ', ' + _videoInfo.fps + 'fps, ' + _videoInfo.duration.toFixed(1) + 's', 'system');
    log('自动: 分割高度=' + _calcSplitH + ', 输出帧率=' + _calcFps.toFixed(2) + 'fps (' + n + '张)', 'system');
  } catch (e) { log('获取视频信息失败: ' + e.message, 'error'); }
  setStatus('就绪');
}

async function checkFilesExist(paths) {
  try {
    var results = await Promise.all(paths.map(function(p) { return FileCEF.exists(p); }));
    return results.every(function(ok) { return ok; });
  } catch (e) { return false; }
}

function toggleAdvanced() {
  var toggle = document.getElementById('advToggle');
  var body = document.getElementById('advBody');
  if (toggle) toggle.classList.toggle('open');
  if (body) body.classList.toggle('open');
}

function openOutputDir() {
  var od = document.getElementById('outputDir').value;
  if (od) {
    PreprocCEF.openFolder(od);
    toast('打开 ' + od);
  } else { toast('请先设置输出目录', 'var(--red)'); }
}

function clearLog() {
  document.getElementById('logContainer').innerHTML = '';
}

function downloadLog() {
  var container = document.getElementById('logContainer');
  var lines = '';
  container.querySelectorAll('.e').forEach(function(el) { lines += el.textContent + '\n'; });
  var blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'log_' + new Date().toISOString().slice(0, 19).replace(/[:-]/g, '') + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toast('日志已保存');
}
