var DialogCEF = {
  openFile: function(opts) {
    opts = opts || {};
    return sendRequest('dialog openFile ' + _b64(opts.title || '选择文件') + ' ' +
      _b64(opts.filters || '所有文件|*.*'), { timeoutMs: 0 })
      .then(function(r) { return r ? _unb64(r) : null; });
  },
  saveFile: function(opts) {
    opts = opts || {};
    return sendRequest('dialog saveFile ' + _b64(opts.defaultName || '') + ' ' +
      _b64(opts.title || '保存文件') + ' ' + _b64(opts.filters || '所有文件|*.*'), { timeoutMs: 0 })
      .then(function(r) { return r ? _unb64(r) : null; });
  },
  pickDir: function(opts) {
    opts = opts || {};
    return sendRequest('dialog pickDir ' + _b64(opts.title || '选择文件夹'), { timeoutMs: 0 })
      .then(function(r) { return r ? _unb64(r) : null; });
  }
};
