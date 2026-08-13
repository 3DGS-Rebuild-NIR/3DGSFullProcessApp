var ReconCEF = {
  send: function(params) {
    return sendRequest('recon ' + _b64(params), { timeoutMs: 0, heartbeat: true });
  },
  killBrush: function() {
    return CEF.cmdRun('taskkill /f /im brush.exe 2>nul');
  },
  pickDir: function() {
    return DialogCEF.pickDir({ title: '选择数据集目录' });
  }
};
