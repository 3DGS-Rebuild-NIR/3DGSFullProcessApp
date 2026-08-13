var _camDeviceId={rgb:null,ir:null};

function _pickCameraId(type){
  if(!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices)return Promise.resolve(null);
  var other=(type==='rgb')?'ir':'rgb';
  return navigator.mediaDevices.enumerateDevices().then(function(devs){
    var vis=devs.filter(function(d){return d.kind==='videoinput';});
    if(!vis.length)return null;
    var exclude=[];
    if(_camDeviceId[other])exclude.push(_camDeviceId[other]);
    for(var i=0;i<vis.length;i++){
      if(vis[i].deviceId&&exclude.indexOf(vis[i].deviceId)===-1)return vis[i].deviceId;
    }
    return vis[0].deviceId||null;
  });
}

function startCameraPreview(type){
  var videoEl=document.getElementById('pv'+type.toUpperCase());
  if(!videoEl) return;
  var attempt={video:true};
  _pickCameraId(type).then(function(id){
    if(id){attempt={video:{deviceId:{exact:id}}};}
    return navigator.mediaDevices.getUserMedia(attempt);
  }).catch(function(){
    _camDeviceId[type]=null;
    return navigator.mediaDevices.getUserMedia({video:true});
  }).then(function(stream){
    _captureState.stream[type]=stream;_captureState.preview[type]=true;
    var vid=document.createElement('video');
    vid.srcObject=stream;vid.playsInline=true;vid.muted=true;vid.autoplay=true;
    vid.style.width='100%';vid.style.height='100%';vid.style.objectFit='cover';vid.setAttribute('playsinline','');
    var img=videoEl.querySelector('img'),ph=videoEl.querySelector('.ph');
    if(img)img.style.display='none';if(ph)ph.style.display='none';
    var existingVid=videoEl.querySelector('video');if(existingVid)existingVid.remove();
    videoEl.insertBefore(vid,videoEl.querySelector('.tag'));
    if(type==='ir') vid.style.filter='grayscale(1) hue-rotate(60deg)';
    videoEl.classList.remove('broken');
    updateCameraUI(type);updateCameraDeviceInfo(type,stream);
    refreshGlobalStatus();
    log(type.toUpperCase()+' 预览已启动','system');
  }).catch(function(err){
    log(type.toUpperCase()+' 预览启动失败: '+err.message,'error');
    toast(type.toUpperCase()+' 相机不可用','var(--red)');
    videoEl.classList.add('broken');
    var ph=videoEl.querySelector('.ph span');if(ph)ph.textContent=type.toUpperCase()+' 不可用';
    updateCameraUI(type);
    refreshGlobalStatus();
  });
}

function updateCameraDeviceInfo(type,stream){
  var track=stream.getVideoTracks&&stream.getVideoTracks()[0];
  if(!track)return;
  var st={};
  try{st=track.getSettings?track.getSettings():{};}catch(e){}
  var w=st.width||'--',h=st.height||'--',fps=st.frameRate||'--';
  if(st.deviceId)_camDeviceId[type]=st.deviceId;
  if(!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices){
    setCameraDeviceMeta(type,type.toUpperCase()+' 相机',w,h,fps);
    return;
  }
  navigator.mediaDevices.enumerateDevices().then(function(devs){
    var name='';
    if(st.deviceId){
      for(var i=0;i<devs.length;i++){
        if(devs[i].kind==='videoinput'&&devs[i].deviceId===st.deviceId){name=devs[i].label||'';break;}
      }
    }
    setCameraDeviceMeta(type,name||(type.toUpperCase()+' 相机'),w,h,fps);
  });
}

function setCameraDeviceMeta(type,name,w,h,fps){
  var el=document.querySelector('.device[data-device="'+type+'"]');
  if(!el)return;
  var txt=name+' · '+w+'×'+h+' @ '+fps+'fps';
  var small=el.querySelector('.meta small');
  if(small)small.textContent=txt;
  el.title=name+' · '+txt;
}

function stopCameraPreview(type){
  var stream=_captureState.stream[type];
  if(stream){stream.getTracks().forEach(function(t){t.stop();});_captureState.stream[type]=null;}
  _captureState.preview[type]=false;
  var videoEl=document.getElementById('pv'+type.toUpperCase());
  if(videoEl){
    var vid=videoEl.querySelector('video');if(vid)vid.remove();
    var img=videoEl.querySelector('img'),ph=videoEl.querySelector('.ph');
    if(img)img.style.display='';if(ph)ph.style.display='';
    var phSpan=videoEl.querySelector('.ph span');if(phSpan)phSpan.textContent=type.toUpperCase()+' 未连接';
  }
  updateCameraUI(type);
  refreshGlobalStatus();
}
function captureSnapshot(type){
  var videoEl=document.getElementById('pv'+type.toUpperCase());
  if(!videoEl)return;
  var vid=videoEl.querySelector('video');
  if(!vid||!vid.videoWidth){toast('预览未启动，无法截图','var(--red)');return;}
  var c=document.createElement('canvas');c.width=vid.videoWidth;c.height=vid.videoHeight;
  var ctx=c.getContext('2d');if(type==='ir')ctx.filter='grayscale(1) hue-rotate(60deg)';
  ctx.drawImage(vid,0,0);
  var link=document.createElement('a');link.download='snapshot_'+type+'_'+Date.now()+'.png';link.href=c.toDataURL('image/png');link.click();
  toast(type.toUpperCase()+' 截图已保存','var(--blue)');
}
