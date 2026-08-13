// ==================== 双摄视频录制（浏览器 MediaRecorder API） ====================
// 与轨迹录制相互独立：点击预览区「录制视频」仅控制双摄视频，
// 同一事件循环内先后 start 两路 MediaRecorder，停止时同步 stop 并分别保存本地。
var _captureVideoRec={rgb:null,ir:null};
var _vidRecActive=false,_vidRecMs=0,_vidRecTimer=null,_vidRecStartAt=0;

function _vidRecMime(){
  if(!window.MediaRecorder)return '';
  var list=['video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for(var i=0;i<list.length;i++){
    if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(list[i]))return list[i];
  }
  return '';
}

function toggleVidRec(){
  if(_vidRecActive)stopVideoRec();
  else startVideoRec();
}

function startVideoRec(){
  if(_vidRecActive)return;
  var mime=_vidRecMime();
  ['rgb','ir'].forEach(function(type){
    var stream=_captureState.stream[type];
    if(!stream||!stream.getVideoTracks||!stream.getVideoTracks().length)return;
    try{
      var mr=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      mr._chunks=[];
      mr.addEventListener('dataavailable',function(e){if(e.data&&e.data.size>0)this._chunks.push(e.data);});
      _captureVideoRec[type]=mr;
    }catch(e){
      log(type.toUpperCase()+' 视频录制初始化失败: '+e.message,'error');
      _captureVideoRec[type]=null;
    }
  });
  // 同一事件循环内连续 start，尽量保证两路同时起录
  var started=0;
  ['rgb','ir'].forEach(function(type){
    var mr=_captureVideoRec[type];
    if(mr&&mr.state==='inactive'){
      try{mr.start(500);started++;}
      catch(e){log(type.toUpperCase()+' 录制启动失败: '+e.message,'error');_captureVideoRec[type]=null;}
    }
  });
  if(started>0){
    _vidRecActive=true;_vidRecMs=0;_vidRecStartAt=Date.now();
    _startVidRecTimer();
    updateVideoRecUI(true);updateVideoRecBarUI(true);
    log('双摄视频录制开始 ('+started+' 路)','system');
    toast('开始录制视频','#e23b3b');
  }else if(_captureState.preview.rgb||_captureState.preview.ir){
    toast('视频录制启动失败，请检查相机','var(--red)');
  }else{
    toast('请先连接 RGB / IR 相机','var(--red)');
  }
  return started;
}

function stopVideoRec(silent){
  _vidRecActive=false;
  _stopVidRecTimer();
  var pending=[];
  ['rgb','ir'].forEach(function(type){
    var mr=_captureVideoRec[type];
    _captureVideoRec[type]=null;
    if(mr&&mr.state!=='inactive')pending.push({type:type,mr:mr});
  });
  updateVideoRecUI(false);updateVideoRecBarUI(false);
  if(!pending.length){
    if(!silent)toast('未录制到视频','var(--ink-3)');
    return null;
  }
  var stamp=_vidStamp();
  return Promise.all(pending.map(function(p){
    return new Promise(function(resolve){
      var done=false;
      function fin(){
        if(done)return;done=true;
        var blob=null;
        try{blob=new Blob(p.mr._chunks||[],{type:p.mr.mimeType||'video/webm'});}catch(e){}
        resolve({type:p.type,blob:blob});
      }
      p.mr.addEventListener('stop',fin);
      try{p.mr.stop();}catch(e){fin();}
    });
  })).then(function(results){
    var saved=0;
    results.forEach(function(r){
      if(r.blob&&r.blob.size>0){_saveVideoFile(r.type,r.blob,stamp);saved++;}
    });
    if(saved>0)toast('视频已保存 ('+saved+' 段)','var(--blue)');
    else toast('视频保存失败','var(--red)');
    return saved;
  });
}

function _vidStamp(){
  var d=new Date();
  return d.getFullYear()+_pad2(d.getMonth()+1)+_pad2(d.getDate())+'_'+
         _pad2(d.getHours())+_pad2(d.getMinutes())+_pad2(d.getSeconds());
}

function _saveVideoFile(type,blob,stamp){
  var ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
  var name='capture_'+type+'_'+stamp+'.'+ext;
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=name;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},5000);
  log(type.toUpperCase()+' 视频已保存: '+name,'system');
}

function _startVidRecTimer(){
  _stopVidRecTimer();
  _vidRecTimer=setInterval(function(){
    _vidRecMs=Date.now()-_vidRecStartAt;
    var txt=_fmtHMS(_vidRecMs);
    ['rgb','ir'].forEach(function(type){
      var s=document.getElementById('vidRecTime'+type.toUpperCase());
      if(s)s.textContent=txt;
    });
  },250);
}
function _stopVidRecTimer(){
  if(_vidRecTimer){clearInterval(_vidRecTimer);_vidRecTimer=null;}
}

function updateVideoRecUI(on){
  ['rgb','ir'].forEach(function(type){
    var b=document.getElementById('vidRec'+type.toUpperCase());
    var s=document.getElementById('vidRecTime'+type.toUpperCase());
    if(b)b.classList.toggle('on',!!on);
    if(!on&&s)s.textContent='00:00:00';
  });
}
function updateVideoRecBarUI(on){
  var vt=document.getElementById('vidRecToggle');if(vt)vt.classList.toggle('recording',on);
  var txt=document.getElementById('vidRecTxt');if(txt)txt.textContent=on?'停止录制':'录制视频';
  var note=document.getElementById('vidRecNote');
  if(note)note.textContent=on?'RGB / IR 双摄录制中':'点击后 RGB / IR 双摄同步录制';
}

document.addEventListener('click',function(e){
  if(e.target.id==='vidRecToggle'||e.target.closest('#vidRecToggle'))toggleVidRec();
});
