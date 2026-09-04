function RecLog(msg, type) {
  var box = $id('reconLogContainer');
  if (!box) return;
  var ph = box.querySelector('.log-placeholder');
  if (ph) ph.remove();
  var d = document.createElement('div');
  d.className = 'e';
  if (type === 'system') d.classList.add('s');
  else if (type === 'error') d.classList.add('er');
  else if (type === 'info') d.classList.add('i');
  d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function clearReconLog() {
  var box = $id('reconLogContainer');
  if (box) box.innerHTML = '<div class="log-placeholder" style="color:var(--ink-3);font-size:11px;padding:8px">日志输出区域</div>';
}

function downloadReconLog() {
  var box = $id('reconLogContainer');
  if (!box) return;
  var lines = [];
  box.querySelectorAll('.e').forEach(function(el) { lines.push(el.textContent); });
  if (!lines.length) { toast('日志为空', 'var(--red)'); return; }
  var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'recon_log_' + new Date().toISOString().slice(0,19).replace(/[:-]/g,'') + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toast('日志已保存');
}

window.update3DGSOutput = function(encodedMsg) {
  _heartbeatPing();
  try {
    var msg = _unb64(encodedMsg);
    parseReconOutput(msg);
  } catch (e) {
    try { RecLog(encodedMsg, 'system'); } catch(_) {}
  }
};
