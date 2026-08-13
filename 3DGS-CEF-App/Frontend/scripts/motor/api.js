var MotorCEF = {
  scanPorts: function() {
    return sendRequest('moter scanPorts').then(function(r) { return JSON.parse(atob(r)); });
  },
  connect: function(port, baudrate) {
    return sendRequest('moter connect ' + btoa(port) + ' ' + (baudrate || 9600));
  },
  disconnect: function() {
    return sendRequest('moter disconnect');
  },
  isConnected: function() {
    return sendRequest('moter isConnected');
  },
  setStepperRPM: function(rpm) {
    return sendRequest('moter setStepperRPM ' + rpm);
  },
  setStepperDirection: function(dir) {
    return sendRequest('moter setStepperDirection ' + dir);
  },
  startStepper: function() {
    return sendRequest('moter startStepper');
  },
  stopStepper: function() {
    return sendRequest('moter stopStepper');
  },
  isStepperRunning: function() {
    return sendRequest('moter isStepperRunning');
  },
  setDCSpeed: function(pwm) {
    return sendRequest('moter setDCSpeed ' + pwm);
  },
  setDCDirection: function(dir) {
    return sendRequest('moter setDCDirection ' + dir);
  },
  startDC: function() {
    return sendRequest('moter startDC');
  },
  stopDC: function() {
    return sendRequest('moter stopDC');
  },
  isDCRunning: function() {
    return sendRequest('moter isDCRunning');
  },
  startBoth: function() {
    return sendRequest('moter startBoth');
  },
  stopBoth: function() {
    return sendRequest('moter stopBoth');
  },
  getStatus: function() {
    return sendRequest('moter getStatus').then(function(r) { return atob(r); });
  },
  sendCommand: function(cmd) {
    return sendRequest('moter sendCommand ' + btoa(cmd));
  }
};

window.updateMotorStatus = function(encodedStatus) {
  try { toast('电机状态: ' + atob(encodedStatus)); } catch(e) {}
};

window.updateMotorLimit = function(type, encodedInfo) {
  try {
    var info = typeof encodedInfo === 'string' ? atob(encodedInfo) : '';
    if (type === 'top') {
      toast('已到上限 (限位触发)', 'var(--red)');
      stopAxis('vertical');
    } else if (type === 'bottom') {
      toast('已到下限 (限位触发)', 'var(--red)');
      stopAxis('vertical');
    } else {
      toast('电机限位触发: ' + type + (info ? ' - ' + info : ''), 'var(--red)');
      captureStopAllMotors();
    }
  } catch(e) {}
};
