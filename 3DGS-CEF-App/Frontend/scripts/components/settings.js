// ==================== 设置窗口 ====================
var _SETTINGS_KEY = 'app_settings';
var _APP_VERSION = 'v1.0.0 dev';
var _APP_NAME = 'IR强化的3DGS全链路重建系统';
var _APP_DESC = '基于 IR（红外）强化的 3D Gaussian Splatting 全链路重建系统，' +
  '覆盖拍摄采集（RGB/IR 双摄 + 电机轨道）、视频切帧、COLMAP 稀疏重建与 3DGS 训练全流程，' +
  '一站式全链路处理';

var Settings = {
  load: function() {
    try { return JSON.parse(localStorage.getItem(_SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
  },

  save: function(cfg) {
    try { localStorage.setItem(_SETTINGS_KEY, JSON.stringify(cfg)); }
    catch (e) { toast('设置保存失败', 'var(--red)'); }
  },

  // 启动时恢复默认路径到主界面
  applyDefaults: function() {
    var cfg = this.load();
    if (cfg.defaultOutdir && $id('outputDir') && !$id('outputDir').value) $id('outputDir').value = cfg.defaultOutdir;
    if (cfg.defaultImgs && $id('imageDir') && !$id('imageDir').value) $id('imageDir').value = cfg.defaultImgs;
  }
};

function openSettings() {
  $id('settingsOverlay').style.display = 'flex';
  var cfg = Settings.load();
  $id('setDefaultOutdir').value = cfg.defaultOutdir || '';
  $id('setDefaultImgs').value = cfg.defaultImgs || '';
  fillAboutInfo();
}

function closeSettings() {
  $id('settingsOverlay').style.display = 'none';
}

function switchSetPanel(panel) {
  $$('.nav-item').forEach(function(n) { n.classList.toggle('active', n.dataset.panel === panel); });
  $$('.set-panel').forEach(function(p) { p.classList.toggle('active', p.dataset.panel === panel); });
}

function settingsPickDir(inputId) {
  DialogCEF.pickDir({ title: '选择目录' }).then(function(path) {
    if (path) {
      $id(inputId).value = path;
      // 联动：默认图像目录为空时自动补 outdir/imgs
      if (inputId === 'setDefaultOutdir') {
        var imgs = $id('setDefaultImgs');
        if (imgs && !imgs.value) imgs.value = path.replace(/[\\/]+$/, '') + '/imgs';
      }
    }
  }).catch(function(e) { toast('目录选择失败: ' + e.message, 'var(--red)'); });
}

function settingsSave() {
  var outdir = $id('setDefaultOutdir').value.trim().replace(/[\\/]+$/, '');
  var imgs = $id('setDefaultImgs').value.trim();
  if (!imgs && outdir) imgs = outdir + '/imgs';
  Settings.save({ defaultOutdir: outdir, defaultImgs: imgs });
  if (outdir && $id('outputDir')) $id('outputDir').value = outdir;
  if (imgs && $id('imageDir')) $id('imageDir').value = imgs;
  toast('设置已保存');
}

// ==================== 调试：CEF 传参 ====================
// 自动 Base64 规则：
//   2 个参数          → 第 2 个参数 Base64（纯数字除外）
//   >= 3 个参数       → 第 3 个及之后的参数 Base64（纯数字除外）
function _buildDebugRequest(raw, encode) {
  var parts = raw.trim().split(/\s+/);
  if (!parts.length) return null;
  var head, params;
  if (parts.length === 2) {
    head = [parts[0]];
    params = [parts[1]];
  } else {
    head = parts.slice(0, 2);
    params = parts.slice(2);
  }
  if (encode) {
    params = params.map(function(p) {
      return /^-?\d+(\.\d+)?$/.test(p) ? p : _b64(p);
    });
  }
  return head.concat(params).join(' ');
}

function settingsSendDebug() {
  var raw = $id('setDebugReq').value;
  if (!raw || !raw.trim()) { toast('请输入请求字符串', 'var(--red)'); return; }
  var encode = $id('setDebugB64').checked;
  var req = _buildDebugRequest(raw, encode);
  var box = $id('setDebugResult');
  box.style.display = 'block';
  box.innerHTML = '';
  var reqLine = document.createElement('div');
  reqLine.innerHTML = '<span class="req">请求</span> ' + escHtml(req);
  box.appendChild(reqLine);
  sendRequest(req, { timeoutMs: 0, heartbeat: true }).then(function(r) {
    var line = document.createElement('div');
    line.innerHTML = '<span class="ok">响应</span> ' + escHtml(String(r));
    box.appendChild(line);
    toast('请求成功');
  }).catch(function(e) {
    var line = document.createElement('div');
    line.innerHTML = '<span class="err">错误</span> ' + escHtml(e.message || e);
    box.appendChild(line);
    toast('请求失败', 'var(--red)');
  });
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// 打开 DevTools（CEF 方法：devTools，无参数，成功返回 Success）
function settingsOpenDevTools() {
  sendRequest('devTools', { timeoutMs: 5000 }).then(function(r) {
    var v = String(r || '').trim().toLowerCase();
    if (!v || v === 'success' || v === 'succ') toast('DevTools 已打开');
    else toast('DevTools: ' + r);
  }).catch(function(e) {
    toast('DevTools 打开失败: ' + e.message, 'var(--red)');
  });
}

// 打开 Chrome 内置设置（CEF 方法：chromeSettings，无参数，成功返回 Success）
function settingsOpenChromeSettings() {
  sendRequest('chromeSettings', { timeoutMs: 5000 }).then(function(r) {
    var v = String(r || '').trim().toLowerCase();
    if (!v || v === 'success' || v === 'succ') toast('Chrome 设置已打开');
    else toast('Chrome 设置: ' + r);
  }).catch(function(e) {
    toast('Chrome 设置打开失败: ' + e.message, 'var(--red)');
  });
}

function settingsReload() { location.reload(); }

function settingsClearData() {
  try { localStorage.clear(); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}
  toast('页面数据已清空');
  setTimeout(function() { location.reload(); }, 300);
}

// ==================== 关于 ====================
function _uaChrome() {
  var m = navigator.userAgent.match(/Chrome\/([\d.]+)/);
  return m ? m[1] : '--';
}

function fillAboutInfo() {
  _setTxt('aboutName', _APP_NAME);
  _setTxt('aboutDesc', _APP_DESC);
  _setTxt('aboutVersion', _APP_VERSION);
  _setTxt('aboutCef', _uaChrome());
  _setTxt('aboutUa', navigator.userAgent);
  var env = typeof cefQuery !== 'undefined' ? 'CEF 环境已就绪' : '非 CEF 环境';
  _setTxt('aboutEnv', env);
  // 尝试获取程序目录
  if (typeof CEF !== 'undefined' && CEF.getExeDir) {
    CEF.getExeDir().then(function(dir) {
      _setTxt('aboutExe', dir || '--');
    }).catch(function() { _setTxt('aboutExe', '--'); });
  }
}

function settingsCopy(el) {
  var text = el.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() { toast('已复制'); })
      .catch(function() { toast('复制失败', 'var(--red)'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败', 'var(--red)'); }
    document.body.removeChild(ta);
  }
}

// ==================== 事件绑定 ====================
(function initSettings() {
  if (!$id('settingsOverlay')) return;
  $id('settingsClose').addEventListener('click', closeSettings);
  $id('settingsOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeSettings();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && $id('settingsOverlay').style.display === 'flex') closeSettings();
  });
  $$('.nav-item').forEach(function(n) {
    n.addEventListener('click', function() { switchSetPanel(n.dataset.panel); });
  });
  Settings.applyDefaults();
})();
