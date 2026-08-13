async function splitVideo() {
  if (getInputMode() === 'independent') { _stepSplit = true; return true; }
  var vp = document.getElementById('videoPath').value,
      od = document.getElementById('outputDir').value;
  if (!vp || !od) { log('请填写视频路径和输出目录', 'error'); return false; }
  await fetchVideoInfo();
  if (!_videoInfo) { log('无法获取视频信息', 'error'); return false; }
  var exist = await checkFilesExist([od + '/rgb.mp4', od + '/ir.mp4']);
  if (exist) {
    var ok = await showDialog('文件已存在', '分割文件已存在，是否重新分割？');
    if (!ok) { log('取消分割', 'system'); return false; }
  }
  setStatus('分割视频中...', 'processing');
  setActiveStep(1);
  setProgressLabel('正在执行视频切帧 ...');
  log('分割-> ' + od + '/rgb.mp4, ' + od + '/ir.mp4', 'ffmpeg');
  try {
    await PreprocCEF.splitVideo(vp, od, _videoInfo.height);
    log('分割完成', 'ffmpeg');
    setStepSub(1, '已完成');
    _stepSplit = true;
    return true;
  } catch (e) {
    log('分割错误: ' + e.message, 'error');
    setStatus('分割失败', 'error');
    return false;
  }
}

async function ensureSplitFiles(od) {
  if (getInputMode() === 'independent') return true;
  if (!_videoInfo) {
    await fetchVideoInfo();
    if (!_videoInfo) { log('无法获取视频信息，请先选择视频文件', 'error'); return false; }
  }
  var exist = await checkFilesExist([od + '/rgb.mp4', od + '/ir.mp4']);
  if (!exist) {
    var ok = await showDialog('需要先分割视频', '未找到分割后的视频文件，是否立即执行分割？');
    if (!ok) { log('取消操作', 'system'); return false; }
    var success = await splitVideo();
    if (!success) { log('分割失败', 'error'); return false; }
  }
  return true;
}

async function extractRGBFrames() {
  var od = document.getElementById('outputDir').value;
  if (!od) { log('请填写输出目录', 'error'); return false; }
  if (!(await ensureSplitFiles(od))) return false;
  var fps = _calcFps.toFixed(4);
  var src = getInputMode() === 'independent' ? getVideoPaths().rgb : od + '/rgb.mp4';
  setStatus('提取 RGB 视频帧中...', 'processing');
  setActiveStep(1);
  setProgressLabel('正在执行视频切帧 ...');
  log('提取 RGB 帧: ' + src + ' -> ' + od + '/imgs/', 'ffmpeg');
  try {
    await PreprocCEF.extractFrames(src, od + '/imgs', fps);
    log('RGB 帧提取完成', 'ffmpeg');
    setStepSub(1, '已完成');
    _stepExtract = true;
    autoFillCOLMAP();
    loadGallery(od);
    return true;
  } catch (e) {
    log('RGB 帧提取错误: ' + e.message, 'error');
    setStatus('提取失败', 'error');
    return false;
  }
}

async function extractIRFrames() {
  var od = document.getElementById('outputDir').value;
  if (!od) { log('请填写输出目录', 'error'); return; }
  if (!(await ensureSplitFiles(od))) return;
  var fps = _calcFps.toFixed(4);
  var src = getInputMode() === 'independent' ? getVideoPaths().ir : od + '/ir.mp4';
  setStatus('提取 IR 视频帧中...', 'processing');
  log('提取 IR 帧: ' + src + ' -> ' + od + '/imgs/ir/', 'ffmpeg');
  try {
    await PreprocCEF.extractFrames(src, od + '/imgs/ir', fps);
    log('IR 帧提取完成', 'ffmpeg');
  } catch (e) { log('IR 帧提取错误: ' + e.message, 'error'); }
}

function autoFillCOLMAP() {
  var od = document.getElementById('outputDir').value;
  if (!od) return;
  if (!document.getElementById('imageDir').value)
    document.getElementById('imageDir').value = od + '/imgs';
  if (!document.getElementById('databasePath').value)
    document.getElementById('databasePath').value = od + '/colmap/database.db';
  if (!document.getElementById('sparseOutputPath').value)
    document.getElementById('sparseOutputPath').value = od + '/colmap/sparse';
}

async function colmapFeatureExtract() {
  var id = document.getElementById('imageDir').value,
      dp = document.getElementById('databasePath').value;
  if (!id || !dp) { log('请填写图像目录和数据库路径', 'error'); return false; }
  setStatus('特征提取中...', 'processing');
  setActiveStep(2);
  setProgressLabel('正在执行特征提取 ...');
  log('COLMAP 特征提取: ' + id, 'colmap');
  try {
    await PreprocCEF.colmapFeatureExtractor(id, dp);
    log('特征提取完成', 'colmap');
    setStepSub(2, '已完成');
    return true;
  } catch (e) {
    log('特征提取错误: ' + e.message, 'error');
    setStatus('特征提取失败', 'error');
    return false;
  }
}

async function colmapExhaustiveMatch() {
  var dp = document.getElementById('databasePath').value;
  if (!dp) { log('请填写数据库路径', 'error'); return false; }
  var matcher = document.getElementById('colmapMatcher').value;
  setStatus('特征匹配中...', 'processing');
  setActiveStep(3);
  setProgressLabel('正在执行特征匹配 ...');
  log('COLMAP ' + matcher + ' 匹配...', 'colmap');
  try {
    await PreprocCEF.colmapExhaustiveMatcher(dp);
    log('匹配完成', 'colmap');
    setStepSub(3, '已完成');
    return true;
  } catch (e) {
    log('匹配错误: ' + e.message, 'error');
    setStatus('匹配失败', 'error');
    return false;
  }
}

async function colmapMapper() {
  var id = document.getElementById('imageDir').value,
      dp = document.getElementById('databasePath').value,
      op = document.getElementById('sparseOutputPath').value;
  if (!id || !dp || !op) { log('请填写图像目录、数据库和输出路径', 'error'); return false; }
  setStatus('三维重建中...', 'processing');
  setActiveStep(4);
  setProgressLabel('正在执行COLMAP重建 ...');
  log('COLMAP 三维重建...', 'colmap');
  try {
    await PreprocCEF.colmapMapper(id, dp, op);
    log('重建完成', 'colmap');
    setStepSub(4, '已完成');
    _colmapCompleted = true;
    return true;
  } catch (e) {
    log('重建错误: ' + e.message, 'error');
    setStatus('重建失败', 'error');
    return false;
  }
}

async function runFullPipeline() {
  if (_pipelineRunning) return;
  var mode = getInputMode(),
      paths = getVideoPaths(),
      od = document.getElementById('outputDir').value;
  if (mode === 'independent') {
    if (!paths.rgb || !paths.ir || !od) { log('请填写 RGB/IR 视频路径和输出目录', 'error'); return; }
  } else if (!paths.rgb || !od) {
    log('请填写视频路径和输出目录', 'error'); return;
  }

  var resumeState = await readPreprocState(od);
  if (resumeState && !resumeState.isFinished && _resumeEffectiveStep < 0) {
    applyPreprocStateToUI(resumeState);
    _resumeEffectiveStep = await verifyPreprocState(resumeState);
  }
  var resumeFrom = (resumeState && !resumeState.isFinished) ? Math.max(0, _resumeEffectiveStep) : 0;

  _pipelineRunning = true;
  _pipelineStartTime = Date.now();
  setButtonsDisabled(true);
  resetSteps();
  _stepSplit = resumeFrom >= 1;
  _stepExtract = resumeFrom >= 1;
  _completedStep = resumeFrom;
  restoreStepsUI(resumeFrom, false);
  setProgressLabel(resumeFrom > 0 ? '从断点继续（已完成步骤 ' + resumeFrom + '）...' : '正在执行全流程 ...');
  setActiveStep(Math.min(resumeFrom + 1, 5));
  log('===== 全流程开始（' + (resumeFrom > 0 ? '断点继续，已完成步骤 ' + resumeFrom : '全新任务') + '） =====', 'system');
  setStatus('全流程处理中...', 'processing');
  await writePreprocState(od, { currentStep: _completedStep, currentStepLabel: _PREPROC_STEP_LABELS[_completedStep], isFinished: false });

  try {
    if (!_videoInfo) await fetchVideoInfo();
    if (!_stepSplit) {
      var splitOk = await splitVideo();
      if (!splitOk) throw new Error('分割失败');
    }
    if (!_stepExtract) {
      var extractOk = await extractRGBFrames();
      if (!extractOk) throw new Error('帧提取失败');
      await extractIRFrames();
      _completedStep = 1;
      await writePreprocState(od, { currentStep: 1, currentStepLabel: '视频切帧', isFinished: false });
    }
    if (resumeFrom < 2) {
      var featOk = await colmapFeatureExtract();
      if (!featOk) throw new Error('特征提取失败');
      _completedStep = 2;
      await writePreprocState(od, { currentStep: 2, currentStepLabel: '特征提取', isFinished: false });
    }
    if (resumeFrom < 3) {
      var matchOk = await colmapExhaustiveMatch();
      if (!matchOk) throw new Error('特征匹配失败');
      _completedStep = 3;
      await writePreprocState(od, { currentStep: 3, currentStepLabel: '特征匹配', isFinished: false });
    }
    if (resumeFrom < 4) {
      var mapOk = await colmapMapper();
      if (!mapOk) throw new Error('重建失败');
      _completedStep = 4;
      await writePreprocState(od, { currentStep: 4, currentStepLabel: 'COLMAP 重建', isFinished: false });
    }
    _colmapCompleted = true;
    setActiveStep(5);
    setStepSub(5, '点云就绪');
    setProgressLabel('预处理完成');
    setStatus('预处理完成');
    log('===== 全流程完成 =====', 'system');
    toast('预处理完成');
    await writePreprocState(od, { currentStep: 5, currentStepLabel: '完成', isFinished: true });
    loadColmapViewer(od);
    loadGallery(od);
    updateResults();
    await loadSparseModelToViewer();
  } catch (e) {
    log('全流程中断: ' + e.message, 'error');
    setStatus('处理失败', 'error');
    toast('处理失败: ' + e.message, 'var(--red)');
    await writePreprocState(od, { currentStep: _completedStep, currentStepLabel: _PREPROC_STEP_LABELS[_completedStep], isFinished: false });
  }
  _pipelineRunning = false;
  setButtonsDisabled(false);
}

function stopPipeline() {
  _pipelineRunning = false;
  setButtonsDisabled(false);
  setStatus('已停止');
  setProgressLabel('已停止');
  log('用户停止流程', 'system');
  toast('已停止', 'var(--red)');
  var od = document.getElementById('outputDir').value;
  if (od) writePreprocState(od, { currentStep: _completedStep, currentStepLabel: _PREPROC_STEP_LABELS[_completedStep], isFinished: false });
}
