var ReconCEF = {
  send: function(params) {
    return sendRequest('recon ' + _b64(params), { timeoutMs: 0, heartbeat: true });
  },
  killBrush: function() {
    // 优先走管道协议优雅停止 brush-headless；失败时兜底强杀
    return sendRequest('recon stop', { timeoutMs: 8000 }).catch(function() {
      return CEF.cmdRun('taskkill /f /im brush-headless.exe 2>nul && taskkill /f /im brush.exe 2>nul');
    });
  },
  evalPly: function(params) {
    // 对已训练 PLY 出评估报告：recon eval-ply <base64>（brush-headless --ply 模式）
    return sendRequest('recon ' + _b64(params), { timeoutMs: 0, heartbeat: true });
  },
  pickDir: function() {
    return DialogCEF.pickDir({ title: '选择数据集目录' });
  }
};
