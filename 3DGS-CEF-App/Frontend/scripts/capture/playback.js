function togglePlay(){_captureState.playing?stopPlay():startPlay();}
function startPlay(){
  if(_captureState.recording) stopRec();
  var traj=_captureTrajectories[_captureState.sel];
  if(!traj||!traj.ops||!traj.ops.length){toast('该轨迹无操作数据','var(--red)');return;}
  _captureState.playDurMs=_parseDur(traj.dur);
  _captureState.playing=true;
  document.getElementById('playBtn').classList.add('on');
  document.getElementById('playTxt').textContent='暂停（P）';
  setStatus('轨迹回放');

  var ops=traj.ops;
  _capturePlayTimer=setInterval(function(){
    _captureState.playMs+=100;
    var idx=0;
    while(idx<ops.length-1&&ops[idx+1].t<=_captureState.playMs){idx++;}
    var op=ops[idx];
    for(var k in _captureState.moving){_captureState.moving[k]=op[k]||false;}
    if(op.dcPWM!==undefined)_captureState.dcPWM=op.dcPWM;
    if(op.stepperRPM!==undefined)_captureState.stepperRPM=op.stepperRPM;
    updateMotionUI();
    updateProgress();
    if(_captureState.playMs>=_captureState.playDurMs){_captureState.playMs=0;}
  },100);
}
function stopPlay(){
  if(!_captureState.playing)return;
  _captureState.playing=false;clearInterval(_capturePlayTimer);
  document.getElementById('playBtn').classList.remove('on');
  document.getElementById('playTxt').textContent='播放（P）';
  setStatus('就绪');
  captureStopAllMotors();
}
function updateProgress(){
  if(!_captureState.playDurMs)return;
  var p=_clamp(_captureState.playMs/_captureState.playDurMs*100,0,100);
  var pf=document.getElementById('progFill'),pk=document.getElementById('progKnob'),pc=document.getElementById('playCur');
  if(pf)pf.style.width=p+'%';if(pk)pk.style.left=p+'%';if(pc)pc.textContent=_fmtHMS(_captureState.playMs);
}
document.addEventListener('click',function(e){
  if(e.target.id==='playBtn'||e.target.closest('#playBtn'))togglePlay();
  if(e.target.id==='playStopBtn'||e.target.closest('#playStopBtn')){stopPlay();_captureState.playMs=0;updateProgress();}
  var prog=e.target.closest('#progress');
  if(prog){
    var r=prog.getBoundingClientRect();
    _captureState.playMs=_clamp((e.clientX-r.left)/r.width,0,1)*_captureState.playDurMs;
    updateProgress();
  }
});
