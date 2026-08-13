function initCapture(){
  updateMotorUI();
  updateCameraUI('rgb');updateCameraUI('ir');
  if(_captureState.devices.rgb) startCameraPreview('rgb');
  if(_captureState.devices.ir) startCameraPreview('ir');
  syncSliders();updateMotionUI();renderOrbit();
  var obs=new MutationObserver(function(){
    var pane=document.querySelector('[data-pane="capture"]');
    if(pane&&pane.style.display!=='none'){
      if(_captureState.devices.rgb&&!_captureState.preview.rgb)startCameraPreview('rgb');
      if(_captureState.devices.ir&&!_captureState.preview.ir)startCameraPreview('ir');
    }
  });
  var ws=document.getElementById('workspace');if(ws)obs.observe(ws,{attributes:true,childList:true,subtree:true,attributeFilter:['style']});
}
