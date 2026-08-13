var FileCEF = {
  read: function(path) {
    return sendRequest('file read ' + _b64(path));
  },
  write: function(path, content) {
    return sendRequest('file write ' + _b64(path) + ' ' + _b64(content));
  },
  delete: function(path) {
    return sendRequest('file delete ' + _b64(path));
  },
  mkdir: function(path) {
    return sendRequest('file mkdir ' + _b64(path));
  },
  exists: function(path) {
    return sendRequest('file exists ' + _b64(path)).then(function(r) { return r === 'true'; });
  },
  stat: function(path) {
    return sendRequest('file stat ' + _b64(path)).then(function(r) { return JSON.parse(r); });
  },
  list: function(dirPath) {
    return sendRequest('file list ' + _b64(dirPath)).then(function(r) { return JSON.parse(r); });
  }
};
