function toggleDevice(type){
  if(type==='motor'){
    if(_motorConnected){
      captureStopAllMotors();
      MotorCEF.disconnect();
      _motorConnected=false;_motorPort=null;_motorBaud=null;
      updateMotorUI();
      refreshGlobalStatus();
      toast('电机控制器已断开','var(--ink-3)');
    } else {
      showMotorConnectDialog();
    }
    return;
  }
  if(type==='rgb'||type==='ir'){
    if(_captureState.preview[type]){stopCameraPreview(type);}
    else{startCameraPreview(type);}
  }
}

function updateCameraUI(type){
  var el=document.querySelector('.device[data-device="'+type+'"]');
  if(!el) return;
  var st=el.querySelector('.st');
  if(st){
    var connected=_captureState.preview[type];
    st.textContent=connected?'连接':'断开';
    st.style.color=connected?'var(--green)':'var(--ink-3)';
  }
  el.style.opacity=_captureState.preview[type]?'1':'0.5';
}

function updateMotorUI(){
  var el=document.querySelector('.device[data-device="motor"]');
  if(!el) return;
  var st=el.querySelector('.st');
  if(st){
    st.textContent=_motorConnected?'连接':'断开';
    st.style.color=_motorConnected?'var(--green)':'var(--ink-3)';
  }
  var small=el.querySelector('.meta small');
  if(small)small.textContent=_motorConnected?(_motorPort||'串口')+' · '+(_motorBaud||'--')+' baud':'未连接';
  el.style.opacity=_motorConnected?'1':'0.5';
  el.title=_motorConnected?('电机控制器 · '+(_motorPort||'串口')+' · 已连接'):'电机控制器 · 点击切换连接';
}

document.addEventListener('click',function(e){
  var dev=e.target.closest('.device');
  if(dev){var t=dev.dataset.device;if(t)toggleDevice(t);}
});

document.addEventListener('click',function(e){
  var tb=e.target.closest('.preview .tools button');
  if(tb){var pv=tb.closest('.preview');if(pv)captureSnapshot(pv.id==='pvRGB'?'rgb':'ir');}
});
