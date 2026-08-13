function updateMotionUI(){
  var mu=_captureState.moving;
  ['up','down','cw','ccw'].forEach(function(d){
    var el=document.getElementById('ms'+d.charAt(0).toUpperCase()+d.slice(1));
    if(el) el.classList.toggle('active',mu[d]);
  });
  var keys=document.querySelectorAll('.key');
  keys.forEach(function(k){k.classList.toggle('active',mu[k.dataset.dir]);});
  var dcp=document.getElementById('msDCPWM');
  if(dcp) dcp.textContent=(mu.up||mu.down)?'PWM: '+_captureState.dcPWM:'PWM: 0';
  var sr=document.getElementById('msStepperRPM');
  if(sr) sr.textContent=(mu.cw||mu.ccw)?'RPM: '+_captureState.stepperRPM:'RPM: 0';
}

function _rad(d){return d*Math.PI/180;}
function _pol(a){var r=_rad(a);return {x:_captureCX+_captureRX*Math.cos(r), y:_captureCY+_captureRY*Math.sin(r)};}
function _tang(a){var r=_rad(a);return Math.atan2(_captureRY*Math.cos(r),-_captureRX*Math.sin(r))*180/Math.PI;}
function _arcPath(a0,a1,step){var d='';for(var a=a0;a<=a1;a+=step){var p=_pol(a);d+=(d===''?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)+' ';}return d;}

function renderOrbit(){
  var ta=document.getElementById('trackArc');
  if(ta) ta.setAttribute('d',_arcPath(195,345,4));
  var sg=document.getElementById('sampleArcs');
  if(sg){
    sg.innerHTML='';
    _captureSamples.forEach(function(a){
      var p1=_pol(a-3.5),p2=_pol(a+3.5);
      var l=document.createElementNS('http://www.w3.org/2000/svg','line');
      l.setAttribute('x1',p1.x);l.setAttribute('y1',p1.y);l.setAttribute('x2',p2.x);l.setAttribute('y2',p2.y);
      sg.appendChild(l);
    });
  }
  var da=document.getElementById('dirArrow');
  if(da){
    var ap=_pol(195),at=_tang(195);
    da.setAttribute('transform','translate('+ap.x.toFixed(1)+','+ap.y.toFixed(1)+') rotate('+at.toFixed(1)+')');
  }
}

function paintSlider(el){
  var mn=parseFloat(el.min),mx=parseFloat(el.max);
  el.style.setProperty('--p',((parseFloat(el.value)-mn)/(mx-mn)*100)+'%');
}

function syncSliders(){
  var sdc=document.getElementById('sDCPWM'),vdc=document.getElementById('vDCPWM');
  var sst=document.getElementById('sStepperRPM'),vst=document.getElementById('vStepperRPM');
  var ss=document.getElementById('sSpeed'),vs=document.getElementById('vSpeed');
  if(sdc){sdc.value=_captureState.dcPWM;if(vdc)vdc.textContent=_captureState.dcPWM;paintSlider(sdc);}
  if(sst){sst.value=_captureState.stepperRPM;if(vst)vst.textContent=_captureState.stepperRPM;paintSlider(sst);}
  if(ss){ss.value=_captureState.speed;if(vs)vs.textContent=_captureState.speed+' %';paintSlider(ss);}
}

document.addEventListener('input',function(e){
  if(e.target.id==='sDCPWM'){
    _captureState.dcPWM=+e.target.value;
    document.getElementById('vDCPWM').textContent=_captureState.dcPWM;
    paintSlider(e.target);
    if(_captureState.moving.up||_captureState.moving.down){syncMotor();}
    updateMotionUI();
  }
  if(e.target.id==='sStepperRPM'){
    _captureState.stepperRPM=+e.target.value;
    document.getElementById('vStepperRPM').textContent=_captureState.stepperRPM;
    paintSlider(e.target);
    if(_captureState.moving.cw||_captureState.moving.ccw){syncMotor();}
    updateMotionUI();
  }
  if(e.target.id==='sSpeed'){
    _captureState.speed=+e.target.value;
    document.getElementById('vSpeed').textContent=_captureState.speed+' %';
    paintSlider(e.target);
  }
});

document.addEventListener('click',function(e){
  var key=e.target.closest('.key');
  if(key){e.preventDefault();toggleMove(key.dataset.dir);}
});

function _capKeydown(e){
  if(e.target.matches('input,select,textarea')) return;
  var k=e.key.toLowerCase();
  if(k===' '){e.preventDefault();toggleRec();return;}
  if(k==='p'){e.preventDefault();togglePlay();return;}
  if(_keymap[k]&&!e.repeat){e.preventDefault();toggleMove(_keymap[k]);}
}
window.addEventListener('keydown',_capKeydown);

function captureLoop(now){
  var dt=Math.min(0.05,(now-_captureLast)/1000);_captureLast=now;

  var cm=document.getElementById('camMarker');
  if(cm){
    var p0=_pol(0);
    cm.setAttribute('transform','translate('+p0.x.toFixed(1)+','+p0.y.toFixed(1)+')');
    cm.style.visibility='visible';
  }

  var step=_captureState.moving.cw?_captureState.speed*0.6:_captureState.moving.ccw?-_captureState.speed*0.6:0;
  if(step){_captureDash+=step*dt;}else{_captureDash=_captureDash%12;}
  var ta=document.getElementById('trackArc');
  if(ta) ta.setAttribute('stroke-dashoffset',_captureDash);
  var ap=_pol(195),at=_tang(195);
  var da=document.getElementById('dirArrow');
  if(da){
    if(_captureState.moving.cw||_captureState.moving.ccw){
      var pulse=1+0.3*Math.sin(Date.now()/150);
      da.setAttribute('transform','translate('+ap.x.toFixed(1)+','+ap.y.toFixed(1)+') rotate('+at.toFixed(1)+') scale('+pulse+')');
    } else {
      da.setAttribute('transform','translate('+ap.x.toFixed(1)+','+ap.y.toFixed(1)+') rotate('+at.toFixed(1)+')');
    }
  }
  requestAnimationFrame(captureLoop);
}
requestAnimationFrame(captureLoop);
