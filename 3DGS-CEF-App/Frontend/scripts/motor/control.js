function _requireMotor(){
  if(!_motorConnected){toast('电机未连接，请在设备连接中先连接电机','var(--red)');return false;}
  return true;
}

function toggleMove(dir){
  if(!_requireMotor()) return;
  if(dir==='up'||dir==='down'){
    if(_captureState.moving.up||_captureState.moving.down){
      _captureState.moving.up=false;_captureState.moving.down=false;
    } else {
      _captureState.moving.up=(dir==='up');_captureState.moving.down=(dir==='down');
    }
  }
  if(dir==='cw'||dir==='ccw'){
    if(_captureState.moving.cw||_captureState.moving.ccw){
      _captureState.moving.cw=false;_captureState.moving.ccw=false;
    } else {
      _captureState.moving.cw=(dir==='cw');_captureState.moving.ccw=(dir==='ccw');
    }
  }
  updateMotionUI();
  syncMotor();
  var labels={up:'上升开',down:'下降开',cw:'顺时针开',ccw:'逆时针开'};
  var off={up:'上升关',down:'下降关',cw:'顺时针关',ccw:'逆时针关'};
  toast(_captureState.moving[dir]?labels[dir]:off[dir]);
}

function syncMotor(){
  if(!_motorConnected) return;
  var dcOn=_captureState.moving.up||_captureState.moving.down;
  if(dcOn){
    MotorCEF.setDCDirection(_captureState.moving.up?0:1);
    MotorCEF.setDCSpeed(_captureState.dcPWM);
    MotorCEF.startDC();
  } else { MotorCEF.stopDC(); }
  var stepOn=_captureState.moving.cw||_captureState.moving.ccw;
  if(stepOn){
    MotorCEF.setStepperDirection(_captureState.moving.cw?0:1);
    MotorCEF.setStepperRPM(_captureState.stepperRPM);
    MotorCEF.startStepper();
  } else { MotorCEF.stopStepper(); }
  if(!dcOn&&!stepOn) MotorCEF.stopBoth();
}

function captureStopAllMotors(){
  for(var k in _captureState.moving){_captureState.moving[k]=false;}
  document.querySelectorAll('.key.active').forEach(function(b){b.classList.remove('active');});
  updateMotionUI();
  if(_motorConnected){MotorCEF.stopBoth();}
}

function stopAxis(axis){
  if(axis==='vertical'){_captureState.moving.up=false;_captureState.moving.down=false;}
  if(axis==='horizontal'){_captureState.moving.cw=false;_captureState.moving.ccw=false;}
  updateMotionUI();
  syncMotor();
}
