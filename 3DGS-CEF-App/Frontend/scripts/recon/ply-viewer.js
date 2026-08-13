function initPLYViewer() {
  var canvas = $id('reconViewerCanvas'), ph = $id('reconViewerPlaceholder');
  if (!canvas || !ph) return;
  if (typeof BABYLON === 'undefined') {
    if (ph.querySelector('span')) ph.querySelector('span').textContent = 'Babylon.js 加载中…';
    return;
  }

  var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, adaptToDeviceRatio: true });
  engine.samples = 4;
  var scene = new BABYLON.Scene(engine);
  scene.clearColor = BABYLON.Color3.Black();

  var camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 0.8, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 50;
  camera.minZ = 0.005;

  Recon._engine = engine; Recon._scene = scene; Recon._cam = camera;

  engine.runRenderLoop(function() { scene.render(); });

  function doResize() {
    if (Recon._engine && canvas.style.display !== 'none') Recon._engine.resize();
  }
  window.addEventListener('resize', doResize);
  var container = $id('reconViewerContainer');
  if (container && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function() { doResize(); }).observe(container);
  }

  if (container) {
    container.addEventListener('dragover', function(e) { e.preventDefault(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', function() { container.classList.remove('drag-over'); });
    container.addEventListener('drop', function(e) {
      e.preventDefault();
      container.classList.remove('drag-over');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (!f.name.toLowerCase().endsWith('.ply')) { toast('请拖入 .ply 文件', 'var(--red)'); return; }
      loadPLYModel(f);
    });
  }
}

function loadPLYModel(src) {
  if (!src) return;
  $show('reconViewerPlaceholder', false); $show('reconViewerCanvas', true);
  if (Recon._engine) Recon._engine.resize();
  if (typeof BABYLON === 'undefined') {
    $show('reconViewerPlaceholder', true);
    var sp = $id('reconViewerPlaceholder').querySelector('span');
    if (sp) sp.textContent = 'Babylon.js 未就绪';
    return;
  }
  function doLoad(arrBuf, label) {
    try {
      if (Recon._plyRoot) { Recon._plyRoot.dispose(); Recon._plyRoot = null; }
      var loader = new BABYLON.SPLATFileLoader();
      loader.importMeshAsync(null, Recon._scene, arrBuf, '').then(function(res) {
        var meshes = res.meshes;
        if (!meshes || !meshes.length) { RecLog('PLY 解析后未找到网格', 'error'); toast('PLY 加载失败', 'var(--red)'); return; }
        var mesh = meshes[0];
        mesh.refreshBoundingInfo();
        mesh.computeWorldMatrix(true);
        var min = mesh.getBoundingInfo().minimum.clone();
        var max = mesh.getBoundingInfo().maximum.clone();
        var maxDim = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
        if (maxDim > 0 && isFinite(maxDim)) {
          var s = Math.min(15 / maxDim, 1000);
          mesh.scaling = mesh.scaling.clone().multiply(new BABYLON.Vector3(s, s, s));
          mesh.computeWorldMatrix(true);
          var bb = mesh.getBoundingInfo().boundingBox;
          var wcenter = bb.minimumWorld.add(bb.maximumWorld).scale(0.5);
          mesh.position = wcenter.scale(-1);
        }
        mesh.computeWorldMatrix(true);
        Recon._plyRoot = mesh; Recon.plyLoaded = true; resetPLYView();
        toast('PLY 模型已加载'); RecLog('PLY 加载完成: ' + label, 'info');
      }).catch(function(err) {
        RecLog('PLY 加载失败: ' + (err.message || err), 'error'); toast('PLY 加载失败', 'var(--red)');
      });
    } catch (err) {
      RecLog('PLY 解析失败: ' + err.message, 'error'); toast('PLY 解析失败', 'var(--red)');
    }
  }
  if (src instanceof File) {
    RecLog('加载 PLY: ' + src.name, 'info');
    var reader = new FileReader();
    reader.onload = function(e) { doLoad(e.target.result, src.name); };
    reader.onerror = function() { RecLog('PLY 读取失败', 'error'); toast('PLY 读取失败', 'var(--red)'); };
    reader.readAsArrayBuffer(src);
  } else if (typeof src === 'string') {
    RecLog('加载 PLY: ' + src, 'info');
    fetch(_appUrl(src)).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function(buf) { doLoad(buf, src); }).catch(function(err) {
      RecLog('PLY 读取失败: ' + err.message, 'error'); toast('PLY 读取失败', 'var(--red)');
    });
  }
}

function resetPLYView() {
  if (Recon._cam) {
    Recon._cam.target = BABYLON.Vector3.Zero();
    Recon._cam.alpha = -Math.PI / 4;
    Recon._cam.beta = Math.PI / 3;
    var radius = 0.8;
    if (Recon._plyRoot) {
      Recon._plyRoot.computeWorldMatrix(true);
      var bb = Recon._plyRoot.getBoundingInfo().boundingBox;
      var diag = BABYLON.Vector3.Distance(bb.minimumWorld, bb.maximumWorld);
      radius = Math.max(diag * 0.75, 0.3);
    }
    Recon._cam.radius = radius;
  }
}

function capturePLYScreenshot() {
  var engine = Recon._engine;
  if (!engine) { toast('无预览内容', 'var(--red)'); return; }
  engine.onEndFrameObservable.addOnce(function() {
    var link = document.createElement('a');
    link.download = 'screenshot_' + Date.now() + '.png';
    link.href = Recon._engine.getRenderingCanvas().toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    toast('截图已保存');
  });
}

function exportModel() {
  var ep = $val('reconExportPath') || './{dataset}_exports/';
  RecLog('模型在训练过程中通过 --export-every 自动导出至: ' + ep, 'info');
  toast('导出路径: ' + ep);
}

function autoLoadLatestExport() {
  var ep = $val('reconExportPath');
  var root = (typeof _datasetRoot === 'function')
    ? _datasetRoot($val('reconImageDir'), $val('reconColmapPath'))
    : _normPath($val('reconImageDir'));
  var dir = ep ? _normPath(ep) : (root ? root + '_exports' : '');
  if (!dir) return;
  FileCEF.list(dir).then(function(items) {
    var best = null, bestIter = -1;
    (items || []).forEach(function(f) {
      var m = /^export_(\d+)\.ply$/i.exec(f.name);
      if (m) {
        var it = parseInt(m[1], 10);
        if (it > bestIter) { bestIter = it; best = f; }
      }
    });
    if (best) {
      RecLog('自动加载最新导出模型: ' + dir + '/' + best.name, 'info');
      loadPLYModel(dir.replace(/\\/g, '/') + '/' + best.name);
    }
  }).catch(function() {});
}

function reconPickDir(inputId) {
  ReconCEF.pickDir().then(function(dir) {
    dir = (dir || '').trim();
    if (dir) {
      $id(inputId).value = dir;
      RecLog('选择目录: ' + dir, 'info');
      if (inputId === 'reconImageDir') {
        setTimeout(scanImageDir, 50);
        setTimeout(autoLoadLatestExport, 250);
      }
    }
  }).catch(function(e) { console.warn('[Recon] pickDir:', e); });
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', function() { setTimeout(initRecon, 50); });
else
  setTimeout(initRecon, 50);

setTimeout(function() {
  if ($val('reconImageDir')) {
    scanImageDir();
    autoLoadLatestExport();
  }
}, 600);
