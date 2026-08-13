var CEF = {
  cmdRun: function(cmd, timeoutMs) {
    return sendRequest('cmdRun ' + btoa(cmd), { timeoutMs: timeoutMs });
  },
  getExeDir: function() {
    return sendRequest('getExeDir').then(function(r) { return atob(r); });
  },
  msgBox: function(message, title, type) {
    return sendRequest('msgBox ' + btoa(message) + ' ' + btoa(title) + ' ' + (type || 0));
  },
  windowControl: function(action) {
    return sendRequest('window ' + action, { timeoutMs: 2000 });
  }
};
