// ==================== CEF Communication ====================
// opts: { timeoutMs: 毫秒, 0 表示不超时; heartbeat: true 表示收到进度时延长超时 }

// 字符串参数编码：UTF-8 安全的 Base64（支持中文路径/内容）
function _b64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

// Base64 响应解码：还原为 UTF-8 字符串，失败时原样返回
function _unb64(b) {
  try { return decodeURIComponent(escape(atob(b))); } catch (e) { return b; }
}

var _activeLong = null;

function _heartbeatPing() {
  if (_activeLong) _activeLong.arm();
}

function _clearLong() {
  _activeLong = null;
}

function sendRequest(req, opts) {
  opts = opts || {};
  var timeoutMs = (opts.timeoutMs === undefined) ? 5000 : opts.timeoutMs;
  var useHeartbeat = !!(opts.heartbeat && timeoutMs > 0);
  return new Promise(function(resolve, reject) {
    if (typeof cefQuery === 'undefined') {
      reject(new Error('CEF 环境未就绪'));
      return;
    }
    var timedOut = false;
    var timer = null;
    if (timeoutMs > 0) {
      var arm = function() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function() {
          timedOut = true;
          if (useHeartbeat) _clearLong();
          reject(new Error('CEF 请求超时'));
        }, timeoutMs);
      };
      arm();
      if (useHeartbeat) _activeLong = { arm: arm };
    }
    cefQuery({
      request: req,
      onSuccess: function(r) {
        if (timedOut) return;
        if (timer) clearTimeout(timer);
        if (useHeartbeat) _clearLong();
        resolve(r);
      },
      onFailure: function(c, m) {
        if (timedOut) return;
        if (timer) clearTimeout(timer);
        if (useHeartbeat) _clearLong();
        reject(new Error(m));
      }
    });
  });
}

// ==================== CEF Output Callbacks ====================
// 后端通过 CallJSFunction 调用这些全局函数推送异步消息

// 预处理系统输出（FFmpeg / COLMAP 日志）
window.updatePreprocOutput = function(encodedMsg) {
  _heartbeatPing();
  try { log(_unb64(encodedMsg), 'system'); } catch (e) { log(encodedMsg, 'system'); }
};