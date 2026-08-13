var _tagMap = { ffmpeg:'FFmpeg', colmap:'COLMAP', system:'System', error:'Error' };
function log(msg, category) {
  var c = document.getElementById('logContainer');
  if (!c) return;
  var d = document.createElement('div');
  var cls = '';
  if (category === 'colmap') cls = 'i';
  else if (category === 'system') cls = 's';
  else if (category === 'error') cls = 'er';
  d.className = 'e ' + cls;
  d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}