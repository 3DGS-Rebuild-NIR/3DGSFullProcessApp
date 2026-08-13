var PreprocCEF = {
  getVideoInfo: function(path) {
    return sendRequest('preproc getVideoInfo ' + _b64(path), { timeoutMs: 15000 });
  },
  splitVideo: function(videoPath, outputDir, height) {
    return sendRequest('preproc splitVideo ' + _b64(videoPath) + ' ' + _b64(outputDir) + ' ' + height, { timeoutMs: 0, heartbeat: true });
  },
  extractFrames: function(src, dst, fps) {
    return sendRequest('preproc extractFrames ' + _b64(src) + ' ' + _b64(dst) + ' ' + fps, { timeoutMs: 0, heartbeat: true });
  },
  colmapFeatureExtractor: function(imageDir, dbPath) {
    return sendRequest('preproc colmapFeatureExtractor ' + _b64(imageDir) + ' ' + _b64(dbPath), { timeoutMs: 0, heartbeat: true });
  },
  colmapExhaustiveMatcher: function(dbPath) {
    return sendRequest('preproc colmapExhaustiveMatcher ' + _b64(dbPath), { timeoutMs: 0, heartbeat: true });
  },
  colmapMapper: function(imageDir, dbPath, outPath) {
    return sendRequest('preproc colmapMapper ' + _b64(imageDir) + ' ' + _b64(dbPath) + ' ' + _b64(outPath), { timeoutMs: 0, heartbeat: true });
  },
  openFolder: function(path) {
    return CEF.cmdRun('explorer "' + path.replace(/\\/g, '\\\\') + '"');
  }
};
