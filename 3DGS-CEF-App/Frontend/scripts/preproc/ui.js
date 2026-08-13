var _colmapViewer = null,
    _colmapViewerMounted = false,
    _colmapViewerPending = false;

var _viewerHintHTML = function(title, sub) {
  return '<div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><b>' + title + '</b><span>' + sub + '</span>';
};

function showViewerDropHint() {
  var loadingEl = document.getElementById('viewerLoading');
  if (!loadingEl) return;
  loadingEl.innerHTML = _viewerHintHTML(
    '拖入文件即可预览',
    '支持 points.bin / camera.bin / images.bin<br>单个或混合拖入，也可拖入包含三者的 sparse 文件夹'
  );
  loadingEl.style.display = '';
}

function prepareColmapViewer() {
  if (_colmapViewerMounted) return;
  var vw = window.__viewer;
  var rootEl = document.getElementById('colmap-viewer-root');
  if (!vw || !vw.mountColmapViewer || !rootEl) return;
  try {
    _colmapViewer = vw.mountColmapViewer(rootEl, {
      onError: function() { _colmapViewerMounted = false; _colmapViewer = null; }
    });
  } catch (e) {
    log('COLMAP Viewer 初始化失败: ' + e.message, 'error');
    return;
  }
  _colmapViewerMounted = true;
  bindViewerControls();
  rootEl.style.display = 'none';
  bindViewerDrop();
}

function bindViewerControls() {
  var bind = function(el, evt, fn) {
    if (!el || el.dataset.vcBound) return;
    el.dataset.vcBound = '1';
    el.addEventListener(evt, fn);
  };
  bind(document.getElementById('colmapProjection'), 'change', function() {
    if (_colmapViewer) _colmapViewer.viewer.updateSettings({ projection: this.value });
  });
  bind(document.getElementById('colmapPointSize'), 'input', function() {
    if (_colmapViewer) _colmapViewer.viewer.updateSettings({ pointSize: Number(this.value) });
  });
  bind(document.getElementById('colmapCameraSize'), 'input', function() {
    if (_colmapViewer) _colmapViewer.viewer.updateSettings({ cameraSize: Number(this.value) });
  });
}

function loadColmapViewer(outputDir) {
  prepareColmapViewer();
  var loadingEl = document.getElementById('viewerLoading');
  var rootEl = document.getElementById('colmap-viewer-root');
  var statsEl = document.getElementById('viewerStats');
  if (loadingEl) {
    loadingEl.innerHTML = _viewerHintHTML(
      outputDir ? '重建完成，拖入文件预览' : '拖入文件即可预览',
      '支持 points.bin / camera.bin / images.bin<br>单个或混合拖入，也可拖入包含三者的 sparse 文件夹'
    );
    loadingEl.style.display = '';
  }
  if (rootEl) rootEl.style.display = 'none';
  if (statsEl) statsEl.style.display = 'none';
}

function mountColmapViewerWhenReady() {
  if (_colmapViewerMounted) return;
  if (window.__viewer) {
    loadColmapViewer();
  } else {
    _colmapViewerPending = true;
    window.addEventListener('colmap-viewer-ready', function() {
      _colmapViewerPending = false;
      loadColmapViewer();
    }, { once: true });
  }
}

function viewerVisible() {
  var rootEl = document.getElementById('colmap-viewer-root');
  return rootEl ? rootEl.style.display === 'block' : false;
}

function bindViewerDrop() {
  var wrap = document.getElementById('viewerWrap');
  if (!wrap || wrap.dataset.dropBound) return;
  wrap.dataset.dropBound = '1';
  ['dragenter', 'dragover'].forEach(function(evt) {
    wrap.addEventListener(evt, function(e) {
      e.preventDefault();
      if (!viewerVisible()) wrap.classList.add('drag-over');
    });
  });
  wrap.addEventListener('dragleave', function(e) {
    if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-over');
  });
  wrap.addEventListener('drop', function(e) {
    e.preventDefault();
    wrap.classList.remove('drag-over');
    if (viewerVisible()) return;
    handleViewerDrop(e.dataTransfer);
  });
}

async function handleViewerDrop(dt) {
  var files;
  try {
    files = await readDataTransfer(dt);
  } catch (e) { files = []; }
  if (!files || files.length === 0) { toast('未读取到文件', 'var(--red)'); return; }
  if (!_colmapViewerMounted) prepareColmapViewer();
  if (!_colmapViewer) { toast('COLMAP Viewer 未就绪', 'var(--red)'); return; }
  var loadingEl = document.getElementById('viewerLoading');
  if (loadingEl) {
    loadingEl.innerHTML = '<div class="ring"></div><b>解析中...</b><span>正在解析 COLMAP 二进制文件</span>';
    loadingEl.style.display = '';
  }
  try {
    await _colmapViewer.load(files);
    if (loadingEl) loadingEl.style.display = 'none';
    var rootEl = document.getElementById('colmap-viewer-root');
    var statsEl = document.getElementById('viewerStats');
    if (rootEl) rootEl.style.display = 'block';
    if (statsEl) statsEl.style.display = 'flex';
    updateResults();
  } catch (err) {
    showViewerDropHint();
    toast('无法解析: ' + (err.message || err), 'var(--red)');
  }
}

function readDataTransfer(dt) {
  if (!dt) return Promise.resolve([]);
  var items = Array.prototype.slice.call(dt.items || [])
    .map(function(it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; })
    .filter(function(en) { return en !== null; });
  if (items.length > 0) {
    return Promise.all(items.map(function(en) { return readEntry(en, en.name); }))
      .then(function(lists) {
        return lists.reduce(function(a, b) { return a.concat(b); }, []);
      });
  }
  return Promise.resolve(Array.prototype.slice.call(dt.files || [])
    .map(function(f) { return { path: f.name, file: f }; }));
}

function readEntry(entry, path) {
  if (entry.isFile) {
    return new Promise(function(res, rej) {
      entry.file(function(f) { res([{ path: path, file: f }]); }, rej);
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);
  var reader = entry.createReader();
  var batch = [];
  return new Promise(function(res, rej) {
    function readBatch() {
      reader.readEntries(function(entries) {
        if (entries.length === 0) {
          Promise.all(batch.map(function(en) { return readEntry(en, path + '/' + en.name); }))
            .then(function(lists) { res(lists.reduce(function(a, b) { return a.concat(b); }, [])); })
            .catch(rej);
          return;
        }
        batch = batch.concat(entries);
        readBatch();
      }, rej);
    }
    readBatch();
  });
}

function resetViewer() {
  if (_colmapViewer && _colmapViewer.viewer) {
    _colmapViewer.viewer.resetView();
    toast('视图已重置');
  } else {
    toast('尚未加载模型');
  }
}

function toggleFullscreen() {
  var wrap = document.getElementById('viewerWrap');
  if (!document.fullscreenElement) {
    wrap.requestFullscreen().catch(function() {});
  } else { document.exitFullscreen(); }
}

function loadGallery(outputDir) {
  var imgsDir = outputDir + '/imgs';
  FileCEF.list(imgsDir).then(function(items) {
    var files = items || [];
    _galleryImages = files
      .filter(function(f) { return f.is_file && /\.(jpg|jpeg|png|bmp)$/i.test(f.name); })
      .map(function(f) { return f.name; }).sort();
    renderGallery(imgsDir);
  }).catch(function(e) {
    log('读取抽帧目录失败: ' + (e && e.message ? e.message : imgsDir), 'error');
    _galleryImages = [];
    renderGallery(imgsDir);
  });
}

function renderGallery(basePath) {
  var grid = document.getElementById('galleryGrid');
  var countEl = document.getElementById('galleryCount');
  var pagEl = document.getElementById('galleryPagination');
  var total = _galleryImages.length;
  var totalPages = Math.ceil(total / _galleryPageSize);
  if (_galleryPage > totalPages) _galleryPage = totalPages || 1;
  countEl.textContent = total + ' 张';
  var start = (_galleryPage - 1) * _galleryPageSize;
  var pageImages = _galleryImages.slice(start, start + _galleryPageSize);
  _clearGrid(grid);
  pageImages.forEach(function(name) {
    var item = document.createElement('div');
    item.className = 'gallery-item';
    var imgPath = basePath.replace(/\\/g, '/') + '/' + name;
    var img = document.createElement('img');
    img.src = _appUrl(imgPath);
    img.alt = name;
    img.onerror = function() {
      item.innerHTML = '<div class="gallery-ph"><span>' + name + '</span></div>';
    };
    item.appendChild(img);
    var label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    item.appendChild(label);
    grid.appendChild(item);
  });
  if (total === 0) {
    grid.innerHTML = '<div class="gallery-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>等待抽帧完成</span></div>';
  }
  pagEl.innerHTML = '';
  if (totalPages > 1) {
    var prevBtn = document.createElement('button');
    prevBtn.textContent = '<';
    prevBtn.disabled = _galleryPage <= 1;
    prevBtn.onclick = function() { _galleryPage--; renderGallery(basePath); };
    pagEl.appendChild(prevBtn);
    var maxShow = 5;
    var startPage = Math.max(1, _galleryPage - Math.floor(maxShow / 2));
    var endPage = Math.min(totalPages, startPage + maxShow - 1);
    if (endPage - startPage < maxShow - 1) startPage = Math.max(1, endPage - maxShow + 1);
    for (var i = startPage; i <= endPage; i++) {
      var btn = document.createElement('button');
      btn.textContent = i;
      if (i === _galleryPage) btn.className = 'active';
      btn.onclick = (function(p) { return function() { _galleryPage = p; renderGallery(basePath); }; })(i);
      pagEl.appendChild(btn);
    }
    if (endPage < totalPages) {
      var dots = document.createElement('button');
      dots.textContent = '...'; dots.disabled = true;
      pagEl.appendChild(dots);
      var lastBtn = document.createElement('button');
      lastBtn.textContent = totalPages;
      lastBtn.onclick = function() { _galleryPage = totalPages; renderGallery(basePath); };
      pagEl.appendChild(lastBtn);
    }
    var nextBtn = document.createElement('button');
    nextBtn.textContent = '>';
    nextBtn.disabled = _galleryPage >= totalPages;
    nextBtn.onclick = function() { _galleryPage++; renderGallery(basePath); };
    pagEl.appendChild(nextBtn);
  }
}

function updateResults() {
  var n = parseInt(document.getElementById('numImgs').value) || 360;
  document.getElementById('resImages').textContent = n;
  var stats = (_colmapViewer && _colmapViewer.viewer) ? _colmapViewer.viewer.modelStats : null;
  var pointsEl = document.getElementById('resPoints'),
      regEl = document.getElementById('resRegistered'),
      errEl = document.getElementById('resError');
  if (stats && stats.points > 0) {
    pointsEl.textContent = stats.points.toLocaleString();
    regEl.textContent = stats.registeredImages.toLocaleString();
    errEl.textContent = isFinite(stats.meanReprojectionError)
      ? stats.meanReprojectionError.toFixed(3) + ' px'
      : (stats.cameras > 0 ? stats.cameras.toLocaleString() : '--');
  } else {
    pointsEl.textContent = '--';
    regEl.textContent = '--';
    errEl.textContent = '--';
  }
  var startTime = _pipelineStartTime || Date.now();
  var elapsed = Math.round((Date.now() - startTime) / 1000);
  var mins = Math.floor(elapsed / 60);
  var secs = elapsed % 60;
  document.getElementById('resTime').textContent = '00:' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}
