function saveReconConfig() {
  try {
    localStorage.setItem('reconConfig', JSON.stringify(gatherConfig()));
    toast('配置已保存至本地');
  } catch(e) { toast('保存失败', 'var(--red)'); }
}

function loadReconConfig() {
  try {
    var raw = localStorage.getItem('reconConfig');
    if (raw) { applyConfig(JSON.parse(raw)); toast('配置已加载'); }
    else toast('无保存的配置', 'var(--red)');
  } catch(e) { toast('加载失败', 'var(--red)'); }
}

function loadReconPrefs() {
  try { var raw = localStorage.getItem('reconConfig'); if (raw) applyConfig(JSON.parse(raw)); } catch(e) {}
}

function gatherConfig() {
  return {
    mode: Recon.mode, colmapPath: $val('reconColmapPath'), imageDir: $val('reconImageDir'),
    trainSteps: $num('reconTrainSteps',30000), maxSplats: $num('reconMaxSplats',10000000),
    enableIR: $id('reconEnableIR')?$id('reconEnableIR').checked:true,
    irSteps: $num('reconIRSteps',5000), irLR: $num('reconIRLR',0.01), irRefine: $num('reconIRRefine',0),
    irTransX: $num('reconIRTransX',0), irTransY: $num('reconIRTransY',0), irTransZ: $num('reconIRTransZ',0),
    irSubdir: $val('reconIRSubdir')||'ir',
    irQuatW: $num('reconIRQuatW',1), irQuatX: $num('reconIRQuatX',0),
    irQuatY: $num('reconIRQuatY',0), irQuatZ: $num('reconIRQuatZ',0),
    shDegree: $num('reconSHDegree',3),
    renderMode: $val('reconRenderMode')||'default',
    maxResolution: $num('reconMaxResolution',1920),
    exportEvery: $num('reconExportEvery',5000), exportPath: $val('reconExportPath'),
    maxFrames: $num('reconMaxFrames',0), evalSplitEvery: $num('reconEvalSplitEvery',0),
    subsampleFrames: $num('reconSubsampleFrames',0)
  };
}

function applyConfig(cfg) {
  function ss(id, v) { var e = $id(id); if (e && v != null) { e.value = v; paintSlider(e); } }
  function sn(id, v) { var e = $id(id); if (e && v != null) e.value = v; }
  ss('reconTrainSteps', cfg.trainSteps); sn('reconTrainStepsVal', cfg.trainSteps);
  ss('reconMaxSplats', cfg.maxSplats);   sn('reconMaxSplatsVal', cfg.maxSplats);
  ss('reconIRSteps', cfg.irSteps);       sn('reconIRStepsVal', cfg.irSteps);
  ss('reconIRLR', cfg.irLR);             sn('reconIRLRVal', cfg.irLR);
  ss('reconIRRefine', cfg.irRefine);     sn('reconIRRefineVal', cfg.irRefine);
  ss('reconSHDegree', cfg.shDegree);     sn('reconSHDegreeVal', cfg.shDegree);
  ss('reconMaxResolution', cfg.maxResolution); sn('reconMaxResolutionVal', cfg.maxResolution);
  if ($id('reconEnableIR'))     $id('reconEnableIR').checked = cfg.enableIR!==false;
  if ($id('reconIRTransX')) $id('reconIRTransX').value = cfg.irTransX||0;
  if ($id('reconIRTransY')) $id('reconIRTransY').value = cfg.irTransY||0;
  if ($id('reconIRTransZ')) $id('reconIRTransZ').value = cfg.irTransZ||0;
  if ($id('reconIRSubdir')) $id('reconIRSubdir').value = cfg.irSubdir||'ir';
  if ($id('reconIRQuatW')) $id('reconIRQuatW').value = cfg.irQuatW||1;
  if ($id('reconIRQuatX')) $id('reconIRQuatX').value = cfg.irQuatX||0;
  if ($id('reconIRQuatY')) $id('reconIRQuatY').value = cfg.irQuatY||0;
  if ($id('reconIRQuatZ')) $id('reconIRQuatZ').value = cfg.irQuatZ||0;
  if ($id('reconRenderMode'))   $id('reconRenderMode').value = cfg.renderMode||'default';
  if ($id('reconExportEvery'))  $id('reconExportEvery').value = cfg.exportEvery||5000;
  if ($id('reconExportPath'))   $id('reconExportPath').value = cfg.exportPath||'';
  if ($id('reconMaxFrames'))    $id('reconMaxFrames').value = cfg.maxFrames||0;
  if ($id('reconEvalSplitEvery')) $id('reconEvalSplitEvery').value = cfg.evalSplitEvery||0;
  if ($id('reconSubsampleFrames')) $id('reconSubsampleFrames').value = cfg.subsampleFrames||0;
  if ($id('reconColmapPath'))   $id('reconColmapPath').value = cfg.colmapPath||'';
  if ($id('reconImageDir'))     $id('reconImageDir').value = cfg.imageDir||'';
  if (cfg.mode) setTrainMode(cfg.mode);
}
