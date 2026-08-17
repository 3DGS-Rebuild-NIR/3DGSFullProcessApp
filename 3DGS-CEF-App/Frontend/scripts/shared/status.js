function _applyBar(text, state) {
  var bs = document.getElementById('barStatus');
  var dot = document.getElementById('barDot');
  var cls = state === 'processing' ? ' processing live' : state === 'error' ? ' error' : ' live';
  if (dot) dot.className = 'dot' + cls;
  if (bs) bs.textContent = text;
}

function setStatus(text, state) {
  _applyBar(text, state);
}

function setProgressLabel(text) {
  var label = document.getElementById('progressLabel');
  if (label) label.textContent = text || '';
}

function _activeTabName() {
  var tab = document.querySelector('.tabs .tab.active');
  return tab ? tab.dataset.tab : '';
}

function refreshGlobalStatus() {
  var name = _activeTabName();
  if (name === 'capture') { refreshCaptureStatus(); return; }
  if (name === 'preproc') { refreshPreprocStatus(); return; }
  if (name === 'evaluate') { refreshEvaluateStatus(); return; }
}

function refreshCaptureStatus() {
  if (_captureState.recording) { _applyBar('录制中', 'processing'); return; }
  var motorOk = (typeof _motorConnected !== 'undefined') && _motorConnected;
  var camOk = !!(_captureState.preview.rgb || _captureState.preview.ir);
  if (!motorOk || !camOk) { _applyBar('未连接', 'error'); return; }
  _applyBar('就绪');
}

function refreshPreprocStatus() {
  if (_pipelineRunning) {
    var label = typeof _PREPROC_STEP_LABELS !== 'undefined' ? _PREPROC_STEP_LABELS[_currentStep] : '';
    _applyBar('正在' + (label || '处理'), 'processing');
    return;
  }
  if (typeof cefQuery === 'undefined') { _applyBar('CEF 未就绪', 'error'); return; }
  _applyBar('就绪');
}