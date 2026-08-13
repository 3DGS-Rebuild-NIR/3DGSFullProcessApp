var _vpImages = [];
var _vpDir = '';
var _vpPage = 1;
var _vpPageSize = 10;

function bindViewpoints() {
  var grid = $id('reconViewpointGrid');
  if (!grid) return;
  grid.addEventListener('click', function(e) {
    var item = e.target.closest('.viewpoint-item');
    if (!item) return;
    grid.querySelectorAll('.viewpoint-item').forEach(function(i) { i.classList.remove('active'); });
    item.classList.add('active');
  });
}

function resolveReconImageDir() {
  var dir = $val('reconImageDir');
  if (!dir) return '';
  var d = _normPath(dir);
  if (/\/imgs$/i.test(d)) return d;
  return d + '/imgs';
}

function _listImages(scan, fallback) {
  RecLog('扫描图像目录: ' + scan, 'info');
  FileCEF.list(scan).then(function(items) {
    var files = (items || []).filter(function(f) {
      return f.is_file && /\.(jpg|jpeg|png|bmp)$/i.test(f.name);
    });
    _vpImages = files;
    _vpDir = scan;
    _vpPage = 1;
    $txt('reconViewpointCount', files.length);
    var pag = $id('reconViewpointPagination');
    if (files.length === 0) {
      toast('未找到图片', 'var(--red)');
      var grid = $id('reconViewpointGrid');
      _clearGrid(grid);
      grid.innerHTML = '<div class="viewpoint-item" style="grid-column:1/-1;pointer-events:none"><span style="color:var(--ink-3);font-size:11px;text-align:center;padding:12px;display:block">目录中无图片</span></div>';
      if (pag) pag.innerHTML = '';
      return;
    }
    renderViewpointGrid();
    toast('找到 ' + files.length + ' 张图片');
    RecLog('找到 ' + files.length + ' 张图片', 'info');
  }).catch(function(e) {
    if (fallback && _normPath(fallback) !== _normPath(scan)) {
      _listImages(_normPath(fallback), '');
      return;
    }
    RecLog('扫描失败: ' + e.message, 'error');
    toast('扫描失败', 'var(--red)');
  });
}

function scanImageDir() {
  var raw = $val('reconImageDir');
  if (!raw) { toast('请先选择图像目录', 'var(--red)'); return; }
  _listImages(resolveReconImageDir(), raw);
}

function renderViewpointGrid() {
  var grid = $id('reconViewpointGrid');
  if (!grid) return;
  _clearGrid(grid);
  var total = _vpImages.length;
  var totalPages = Math.max(1, Math.ceil(total / _vpPageSize));
  if (_vpPage > totalPages) _vpPage = totalPages;
  var start = (_vpPage - 1) * _vpPageSize;
  var pageFiles = _vpImages.slice(start, start + _vpPageSize);
  pageFiles.forEach(function(f) {
    var fname = f.name || f;
    var item = document.createElement('div');
    item.className = 'viewpoint-item';
    var thumb = document.createElement('div');
    thumb.className = 'thumb';
    var img = document.createElement('img');
    img.src = _appUrl(_vpDir.replace(/\\/g, '/') + '/' + fname);
    img.alt = fname;
    img.loading = 'lazy';
    img.onerror = function() {
      this.outerHTML = '<div class="ph" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="20" height="20">' +
        '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
        '<path d="M21 15l-5-5L5 21"/></svg></div>';
    };
    thumb.appendChild(img);
    item.appendChild(thumb);
    var name = document.createElement('span');
    name.className = 'name';
    name.title = fname;
    name.textContent = fname.replace(/\.(jpg|jpeg|png|bmp)$/i, '');
    item.appendChild(name);
    grid.appendChild(item);
  });
  renderViewpointPagination(total, totalPages);
}

function renderViewpointPagination(total, totalPages) {
  var pagEl = $id('reconViewpointPagination');
  if (!pagEl) return;
  pagEl.innerHTML = '';
  if (totalPages <= 1) { pagEl.style.display = 'none'; return; }
  pagEl.style.display = '';
  var prev = document.createElement('button');
  prev.textContent = '<';
  prev.disabled = _vpPage <= 1;
  prev.onclick = function() { _vpPage--; renderViewpointGrid(); };
  pagEl.appendChild(prev);
  var maxShow = 7;
  var startPage = Math.max(1, _vpPage - Math.floor(maxShow / 2));
  var endPage = Math.min(totalPages, startPage + maxShow - 1);
  if (endPage - startPage < maxShow - 1) startPage = Math.max(1, endPage - maxShow + 1);
  for (var i = startPage; i <= endPage; i++) {
    var b = document.createElement('button');
    b.textContent = i;
    if (i === _vpPage) b.className = 'active';
    b.onclick = (function(p) { return function() { _vpPage = p; renderViewpointGrid(); }; })(i);
    pagEl.appendChild(b);
  }
  if (endPage < totalPages) {
    var dots = document.createElement('button');
    dots.textContent = '...'; dots.disabled = true;
    pagEl.appendChild(dots);
    var last = document.createElement('button');
    last.textContent = totalPages;
    last.onclick = function() { _vpPage = totalPages; renderViewpointGrid(); };
    pagEl.appendChild(last);
  }
  var next = document.createElement('button');
  next.textContent = '>';
  next.disabled = _vpPage >= totalPages;
  next.onclick = function() { _vpPage++; renderViewpointGrid(); };
  pagEl.appendChild(next);
}
