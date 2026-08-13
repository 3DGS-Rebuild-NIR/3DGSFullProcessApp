var _videoInfo = null,
    _calcFps = 0,
    _calcSplitH = 0,
    _stepSplit = false,
    _stepExtract = false,
    _dialogResolve = null;

function log(msg, t) {
    var c = document.getElementById('logContainer'),
        d = document.createElement('div');
    d.className = 'e ' + (t === 'success' ? 's' : t === 'error' ? 'er' : 'i');
    d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function setStatus(text, state) {
    var dot = document.getElementById('statusDot');
    dot.className = 'status-dot' + (state === 'processing' ? ' processing' : state === 'error' ? ' error' : '');
    document.getElementById('statusText').textContent = text;
}

function setProgress(p) {
    var fill = document.getElementById('progressFill');
    if (p >= 0) {
        fill.style.width = p + '%';
    } else {
        fill.style.width = '0%';
    }
}

function setActiveStep(s) {
    for (var i = 1; i <= 7; i++) {
        var el = document.getElementById('step' + i);
        el.className = 'step' + (i < s ? ' done' : i === s ? ' active' : '');
    }
}

function resetSteps() {
    for (var i = 1; i <= 7; i++) {
        document.getElementById('step' + i).className = 'step';
    }
}

function setButtonsDisabled(d) {
    document.querySelectorAll('button').forEach(function(b) {
        b.disabled = d;
    });
}

function showDialog(title, msg) {
    return new Promise(function(resolve) {
        _dialogResolve = resolve;
        document.getElementById('dialogTitle').textContent = title;
        document.getElementById('dialogMsg').textContent = msg;
        document.getElementById('iosDialog').style.display = 'block';
    });
}

function closeDialog(ok) {
    document.getElementById('iosDialog').style.display = 'none';
    if (_dialogResolve) {
        _dialogResolve(ok);
        _dialogResolve = null;
    }
}

function sendRequest(req) {
    return new Promise(function(resolve, reject) {
        if (typeof cefQuery !== 'undefined') {
            cefQuery({
                request: req,
                onSuccess: function(r) { resolve(r); },
                onFailure: function(c, m) { reject(new Error(m)); }
            });
        } else {
            log('CEF 环境未就绪，模拟模式', 'info');
            setTimeout(function() { resolve('simulated'); }, 100);
        }
    });
}

async function fetchVideoInfo() {
    var vp = document.getElementById('videoPath').value;
    if (!vp) {
        _videoInfo = null;
        return;
    }
    setStatus('获取视频信息中...', 'processing');
    try {
        var res = await sendRequest('3dgsProcessor getVideoInfo ' + btoa(vp));
        if (res && res !== 'simulated') {
            _videoInfo = JSON.parse(res);
            var n = parseInt(document.getElementById('numImgs').value) || 400;
            _calcSplitH = Math.floor(_videoInfo.height / 2);
            _calcFps = n / _videoInfo.duration;
            document.getElementById('infoWidth').textContent = _videoInfo.width;
            document.getElementById('infoHeight').textContent = _videoInfo.height;
            document.getElementById('infoFps').textContent = _videoInfo.fps;
            document.getElementById('infoDuration').textContent = _videoInfo.duration.toFixed(1);
            document.getElementById('infoSplitH').textContent = _calcSplitH;
            document.getElementById('infoOutFps').textContent = _calcFps.toFixed(2);
            document.getElementById('videoInfoPanel').style.display = 'grid';
            log('视频: ' + _videoInfo.width + 'x' + _videoInfo.height +
                ', ' + _videoInfo.fps + 'fps, ' + _videoInfo.duration.toFixed(1) + 's', 'success');
            log('自动: 分割高度=' + _calcSplitH + ', 输出帧率=' +
                _calcFps.toFixed(2) + 'fps (' + n + '张)', 'info');
        } else {
            log('获取视频信息成功 (模拟)', 'success');
        }
    } catch (e) {
        log('获取视频信息失败: ' + e.message, 'error');
    }
    setStatus('就绪');
}

function pickVideo() {
    var ps = 'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms;' +
        ' $f=New-Object System.Windows.Forms.OpenFileDialog;' +
        ' $f.Title=\'Select Video\';$f.Filter=\'MP4 Files|*.mp4|All Files|*.*\';' +
        ' if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){Write-Host $f.FileName}else{Write-Host \'\'}"';
    log('打开文件对话框...', 'info');
    sendRequest('cmdRun ' + btoa(ps)).then(function(res) {
        var path = (res || '').trim();
        if (path && path !== 'simulated') {
            document.getElementById('videoPath').value = path;
            var od = document.getElementById('outputDir');
            if (!od.value) {
                var parts = path.replace(/\\/g, '/').split('/');
                var name = parts.pop().replace(/\.[^.]+$/, '');
                od.value = parts.join('/') + '/' + name + '_output';
            }
            _stepSplit = false;
            _stepExtract = false;
            fetchVideoInfo();
            log('文件: ' + path, 'success');
        } else {
            log('未选择文件', 'info');
        }
    }).catch(function(e) {
        log('文件对话框错误: ' + e.message, 'error');
    });
}

function pickDir(inputId) {
    var ps = 'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms;' +
        ' $f=New-Object System.Windows.Forms.FolderBrowserDialog;' +
        ' $f.Description=\'Select Folder\';' +
        ' if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){Write-Host $f.SelectedPath}else{Write-Host \'\'}"';
    log('打开目录对话框...', 'info');
    sendRequest('cmdRun ' + btoa(ps)).then(function(res) {
        var path = (res || '').trim();
        if (path && path !== 'simulated') {
            document.getElementById(inputId).value = path;
            log('目录: ' + path, 'success');
        } else {
            log('未选择目录', 'info');
        }
    }).catch(function(e) {
        log('目录对话框错误: ' + e.message, 'error');
    });
}

async function checkFilesExist(paths) {
    var ps = 'powershell -NoProfile -Command "if(';
    for (var i = 0; i < paths.length; i++) {
        if (i > 0) ps += ' -and ';
        ps += '(Test-Path \'' + paths[i].replace(/'/g, '\'\'') + '\')';
    }
    ps += '){Write-Host \'EXISTS\'}else{Write-Host \'NOT\'}"';
    try {
        var res = await sendRequest('cmdRun ' + btoa(ps));
        return res && res.trim() === 'EXISTS';
    } catch (e) {
        return false;
    }
}

async function splitVideo() {
    var vp = document.getElementById('videoPath').value,
        od = document.getElementById('outputDir').value;
    if (!vp || !od) {
        log('请填写视频路径和输出目录', 'error');
        return;
    }
    await fetchVideoInfo();
    if (!_videoInfo) {
        log('无法获取视频信息', 'error');
        return;
    }
    var exist = await checkFilesExist([od + '/rgb.mp4', od + '/ir.mp4']);
    if (exist) {
        var ok = await showDialog('文件已存在', '分割文件已存在，是否重新分割？');
        if (!ok) {
            log('取消分割', 'info');
            return;
        }
    }
    setStatus('分割视频中...', 'processing');
    setActiveStep(3);
    setProgress(0);
    log('分割-> ' + od + '/rgb.mp4, ' + od + '/ir.mp4', 'info');
    try {
        var res = await sendRequest('3dgsProcessor splitVideo ' +
            btoa(vp) + ' ' + btoa(od) + ' ' + _videoInfo.height);
        if (res === 'true' || res === 'simulated') {
            log('分割完成', 'success');
            setProgress(100);
            _stepSplit = true;
        } else {
            log('分割失败', 'error');
        }
        setStatus('就绪');
        setProgress(-1);
        resetSteps();
    } catch (e) {
        log('分割错误: ' + e.message, 'error');
        setStatus('分割失败', 'error');
        setProgress(-1);
    }
}

async function ensureSplitFiles(od) {
    if (!_videoInfo) {
        await fetchVideoInfo();
        if (!_videoInfo) {
            log('无法获取视频信息，请先选择视频文件', 'error');
            return false;
        }
    }
    var exist = await checkFilesExist([od + '/rgb.mp4', od + '/ir.mp4']);
    if (!exist) {
        var ok = await showDialog('需要先分割视频',
            '未找到分割后的视频文件(' + od + '/rgb.mp4, ' + od + '/ir.mp4)，是否立即执行分割？');
        if (!ok) {
            log('取消操作', 'info');
            return false;
        }
        await splitVideo();
        if (!_stepSplit) {
            log('分割失败', 'error');
            return false;
        }
    }
    return true;
}

async function extractRGBFrames() {
    var od = document.getElementById('outputDir').value;
    if (!od) {
        log('请填写输出目录', 'error');
        return;
    }
    if (!(await ensureSplitFiles(od))) return;

    var fps = _calcFps.toFixed(4);
    setStatus('提取 RGB 视频帧中...', 'processing');
    setActiveStep(4);
    setProgress(0);
    log('提取 RGB 帧: ' + od + '/rgb.mp4 -> ' + od + '/imgs/', 'info');
    try {
        var res = await sendRequest('3dgsProcessor extractFrames ' +
            btoa(od + '/rgb.mp4') + ' ' + btoa(od + '/imgs') + ' ' + fps);
        if (res !== 'true' && res !== 'simulated') {
            log('RGB 帧提取失败: ' + (res || '无返回'), 'error');
            setStatus('就绪');
            setProgress(-1);
            resetSteps();
            return;
        }
        log('RGB 帧提取完成', 'success');
        setProgress(100);
        _stepExtract = true;
        autoFillCOLMAP();
    } catch (e) {
        log('RGB 帧提取错误: ' + e.message, 'error');
        setStatus('提取失败', 'error');
        setProgress(-1);
    }
    setStatus('就绪');
    setProgress(-1);
    resetSteps();
}

async function extractIRFrames() {
    var od = document.getElementById('outputDir').value;
    if (!od) {
        log('请填写输出目录', 'error');
        return;
    }
    if (!(await ensureSplitFiles(od))) return;

    var fps = _calcFps.toFixed(4);
    setStatus('提取 IR 视频帧中...', 'processing');
    setActiveStep(4);
    setProgress(0);
    log('提取 IR 帧: ' + od + '/ir.mp4 -> ' + od + '/imgs_ir/', 'info');
    try {
        var res = await sendRequest('3dgsProcessor extractFrames ' +
            btoa(od + '/ir.mp4') + ' ' + btoa(od + '/imgs_ir') + ' ' + fps);
        if (res !== 'true' && res !== 'simulated') {
            log('IR 帧提取失败: ' + (res || '无返回'), 'error');
            setStatus('就绪');
            setProgress(-1);
            resetSteps();
            return;
        }
        log('IR 帧提取完成', 'success');
        setProgress(100);
        _stepExtract = true;
        autoFillCOLMAP();
    } catch (e) {
        log('IR 帧提取错误: ' + e.message, 'error');
        setStatus('提取失败', 'error');
        setProgress(-1);
    }
    setStatus('就绪');
    setProgress(-1);
    resetSteps();
}

async function extractFrames() {
    await extractRGBFrames();
    if (_stepExtract) {
        await extractIRFrames();
    }
}

function autoFillCOLMAP() {
    var od = document.getElementById('outputDir').value;
    if (!od) return;
    document.getElementById('imageDir').value = od + '/imgs';
    document.getElementById('databasePath').value = od + '/colmap/database.db';
    document.getElementById('sparseOutputPath').value = od + '/colmap/sparse';
}

async function checkExtractForCOLMAP() {
    if (_stepExtract) return true;
    var id = document.getElementById('imageDir').value;
    if (id && id !== (document.getElementById('outputDir').value + '/imgs') && id.length > 5) return true;
    var ok = await showDialog('需要先提取视频帧',
        'COLMAP 处理需要基于 RGB 图集，是否先执行提取视频帧操作？');
    if (!ok) return false;
    await extractRGBFrames();
    return _stepExtract;
}

async function colmapFeatureExtract() {
    if (!(await checkExtractForCOLMAP())) return;
    var id = document.getElementById('imageDir').value,
        dp = document.getElementById('databasePath').value;
    if (!id || !dp) {
        log('请填写图像目录和数据库路径', 'error');
        return;
    }
    setStatus('特征提取中...', 'processing');
    setActiveStep(5);
    setProgress(0);
    log('COLMAP 特征提取: ' + id, 'info');
    try {
        var res = await sendRequest('3dgsProcessor colmapFeatureExtractor ' + btoa(id) + ' ' + btoa(dp));
        if (res === 'true' || res === 'simulated') {
            log('特征提取完成', 'success');
            setProgress(100);
        } else {
            log('特征提取失败', 'error');
        }
        setStatus('就绪');
        setProgress(-1);
        resetSteps();
    } catch (e) {
        log('特征提取错误: ' + e.message, 'error');
        setStatus('特征提取失败', 'error');
        setProgress(-1);
    }
}

async function colmapExhaustiveMatch() {
    if (!(await checkExtractForCOLMAP())) return;
    var dp = document.getElementById('databasePath').value;
    if (!dp) {
        log('请填写数据库路径', 'error');
        return;
    }
    setStatus('特征匹配中...', 'processing');
    setActiveStep(6);
    setProgress(0);
    log('COLMAP 穷尽匹配...', 'info');
    try {
        var res = await sendRequest('3dgsProcessor colmapExhaustiveMatcher ' + btoa(dp));
        if (res === 'true' || res === 'simulated') {
            log('匹配完成', 'success');
            setProgress(100);
        } else {
            log('匹配失败', 'error');
        }
        setStatus('就绪');
        setProgress(-1);
        resetSteps();
    } catch (e) {
        log('匹配错误: ' + e.message, 'error');
        setStatus('匹配失败', 'error');
        setProgress(-1);
    }
}

async function colmapMapper() {
    if (!(await checkExtractForCOLMAP())) return;
    var id = document.getElementById('imageDir').value,
        dp = document.getElementById('databasePath').value,
        op = document.getElementById('sparseOutputPath').value;
    if (!id || !dp || !op) {
        log('请填写图像目录、数据库和输出路径', 'error');
        return;
    }
    setStatus('三维重建中...', 'processing');
    setActiveStep(7);
    setProgress(0);
    log('COLMAP 三维重建...', 'info');
    try {
        var res = await sendRequest('3dgsProcessor colmapMapper ' +
            btoa(id) + ' ' + btoa(dp) + ' ' + btoa(op));
        if (res === 'true' || res === 'simulated') {
            log('重建完成', 'success');
            setProgress(100);
        } else {
            log('重建失败', 'error');
        }
        setStatus('就绪');
        setProgress(-1);
        resetSteps();
    } catch (e) {
        log('重建错误: ' + e.message, 'error');
        setStatus('重建失败', 'error');
        setProgress(-1);
    }
}

async function runFullPipeline() {
    log('===== 全流程开始 =====', 'info');
    setStatus('全流程处理中...', 'processing');
    setButtonsDisabled(true);
    setProgress(0);
    try {
        setActiveStep(1);
        log('[1] 配置', 'info');
        setProgress(5);
        if (!_videoInfo) {
            setActiveStep(2);
            await fetchVideoInfo();
            setProgress(15);
        } else {
            setProgress(15);
        }
        if (!_stepSplit) {
            setActiveStep(3);
            await splitVideo();
            setProgress(35);
        } else {
            setProgress(35);
        }
        if (!_stepExtract) {
            setActiveStep(4);
            await extractFrames();
            setProgress(55);
        } else {
            setProgress(55);
        }
        setActiveStep(5);
        await colmapFeatureExtract();
        setProgress(70);
        setActiveStep(6);
        await colmapExhaustiveMatch();
        setProgress(85);
        setActiveStep(7);
        await colmapMapper();
        setProgress(100);
        log('===== 全流程完成 =====', 'success');
    } catch (e) {
        log('全流程中断: ' + e.message, 'error');
    }
    setStatus('就绪');
    setButtonsDisabled(false);
    setTimeout(function() {
        setProgress(-1);
        resetSteps();
    }, 2000);
}

function clearVideoInput() {
    _videoInfo = null;
    _calcFps = 0;
    _calcSplitH = 0;
    _stepSplit = false;
    _stepExtract = false;
    document.getElementById('videoPath').value = '';
    document.getElementById('outputDir').value = '';
    document.getElementById('numImgs').value = '400';
    document.getElementById('videoInfoPanel').style.display = 'none';
    log('已清空视频输入', 'info');
}

function clearColmapInput() {
    document.getElementById('imageDir').value = '';
    document.getElementById('databasePath').value = '';
    document.getElementById('sparseOutputPath').value = '';
    log('已清空 COLMAP 输入', 'info');
}

function clearLog() {
    document.getElementById('logContainer').innerHTML = '';
}

window.updateCmdOutput = function(encodedMsg) {
    try {
        log(atob(encodedMsg), 'info');
    } catch (e) {
        log(encodedMsg, 'info');
    }
};

document.getElementById('numImgs').addEventListener('change', function() {
    if (_videoInfo) {
        var n = parseInt(this.value) || 400;
        _calcFps = n / _videoInfo.duration;
        document.getElementById('infoOutFps').textContent = _calcFps.toFixed(2);
        log('图片数变更: 输出帧率=' + _calcFps.toFixed(2) + 'fps (' + n + '张)', 'info');
    }
});

log('3DGS视频预处理器已启动', 'success');
log('选择视频文件 -> 自动获取信息 -> 分割/提取 -> COLMAP 重建', 'info');
