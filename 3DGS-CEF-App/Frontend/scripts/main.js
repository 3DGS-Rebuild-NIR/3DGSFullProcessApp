// ==================== Tab Navigation ====================
$$('.tabs .tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    $$('.tabs .tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var id = tab.dataset.tab;

    $$('.col, .placeholder').forEach(function(p) {
      p.style.display = 'none';
    });

    if (id === 'recon') {
      $$('.recon-col-left, .recon-col-mid, .recon-col-right').forEach(function(p) {
        p.style.display = '';
      });
    } else {
      $$('[data-pane="' + id + '"]').forEach(function(p) {
        if (!p.classList.contains('recon-col-left') &&
            !p.classList.contains('recon-col-mid') &&
            !p.classList.contains('recon-col-right')) {
          p.style.display = '';
        }
      });
    }

    if (id === 'preproc') {
      try {
        if (typeof mountColmapViewerWhenReady === 'function') mountColmapViewerWhenReady();
      } catch (e) {
        log('COLMAP Viewer 初始化失败: ' + e.message, 'error');
      }
    }

    refreshGlobalStatus();
  });
});

// ==================== Number Input Handler ====================
document.getElementById('numImgs').addEventListener('change', function() {
  if (typeof _videoInfo !== 'undefined' && _videoInfo) {
    var n = parseInt(this.value) || 360;
    _calcFps = n / _videoInfo.duration;
    var interval = (_videoInfo.fps / _calcFps).toFixed(1);
    document.getElementById('videoInfoHint').textContent =
      '原始时长：' + _videoInfo.duration.toFixed(1) + 's  原始帧率：' + _videoInfo.fps + 'fps  预计抽帧间隔：' + interval;
    log('图片数变更: 输出帧率=' + _calcFps.toFixed(2) + 'fps (' + n + '张)', 'system');
  }
});

// ==================== Settings ====================
document.getElementById('settingsBtn').addEventListener('click', function() {
  openSettings();
});

// ==================== Init ====================
(function init() {
  log('3DGS 全链路重建系统已启动', 'system');
  log('选择视频文件 -> 自动获取信息 -> 分割/提取 -> COLMAP 重建', 'system');

  var activeTab = document.querySelector('.tab.active');
  if (activeTab) activeTab.click();

  if (typeof onOutputDirChange === 'function' && document.getElementById('outputDir').value) {
    onOutputDirChange();
  }

  var captureTab = document.querySelector('.tab[data-tab="capture"]');
  if (captureTab) captureTab.click();

  try { if (typeof initCapture === 'function') initCapture(); } catch (e) { log('初始化捕获模块失败: ' + e.message, 'error'); }
  try { if (typeof renderTrajectories === 'function') renderTrajectories(); } catch (e) { log('渲染轨迹失败: ' + e.message, 'error'); }
  try { if (typeof updateProgress === 'function') updateProgress(); } catch (e) { log('更新进度失败: ' + e.message, 'error'); }
  try { if (typeof initEvaluate === 'function') initEvaluate(); } catch (e) { log('初始化评估模块失败: ' + e.message, 'error'); }

  try { if (typeof ProjectUI !== 'undefined' && ProjectUI.init) ProjectUI.init(); } catch (e) { log('初始化工程项目失败: ' + e.message, 'error'); }

  startSystemMonitor();
})();

// ==================== System Monitor ====================
function startSystemMonitor() {
  updateSystemMetrics();
  setInterval(updateSystemMetrics, 1000);
}

function updateSystemMetrics() {
  sendRequest('getSystemPerformance').then(function(r) {
    if (!r) {
      _resetSystemMetrics();
      return;
    }
    try {
      var d = JSON.parse(r);
      if (d.error || !d.cpu || !d.memory) {
        _resetSystemMetrics();
        return;
      }
      _setTxt('barCPU', d.cpu.usagePercent.toFixed(1) + '%');
      _setTxt('barMem', d.memory.usedGB.toFixed(1) + ' / ' + d.memory.totalGB.toFixed(1) + ' GB');
      if (d.gpu && d.gpu.length > 0) {
        var g = d.gpu[0];
        _setTxt('barGPU', g.usagePercent.toFixed(1) + '%');
        _setTxt('barVRAM', g.usedDedicatedMemoryMB.toFixed(0) + ' / ' + g.dedicatedMemoryMB.toFixed(0) + ' MB');
      } else {
        _setTxt('barGPU', '--%');
        _setTxt('barVRAM', '--');
      }
    } catch(e) { _resetSystemMetrics(); }
  }).catch(function() { _resetSystemMetrics(); });
}

function _resetSystemMetrics() {
  _setTxt('barCPU', '--%');
  _setTxt('barMem', '-- / -- GB');
  _setTxt('barGPU', '--%');
  _setTxt('barVRAM', '--');
}
