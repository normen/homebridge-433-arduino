var Service, Characteristic;
const SerialTransceiver = require('./tc-serial');
const WebsocketTransceiver = require('./tc-websocket');
var sentCodes = [];

/** PLATFORM CLASS **/
function ArduinoSwitchPlatform (log, config) {
  const self = this;
  self.config = config;
  self.log = log;
  var ioTimeout = 100;
  if (config.input_output_timeout) ioTimeout = config.input_output_timeout;
  if (config.serial_port || config.serial_port_out) {
    const myport = config.serial_port ? config.serial_port : config.serial_port_out;
    self.log('Enabling USB mode using ', myport);
    self.transceiver = new SerialTransceiver(self.log, myport, ioTimeout);
  } else if (config.host) {
    const host = config.host;
    const port = config.port ? config.port : 80;
    self.log('Enabling WebSocket mode using ', host + ':' + port);
    self.transceiver = new WebsocketTransceiver(self.log, host, port, ioTimeout);
  } else {
    self.log('Two arduino Mode not available anymore!');
  }
}
ArduinoSwitchPlatform.prototype.listen = function () {
  this.transceiver.setCallback(this.receiveMessage.bind(this));
  this.transceiver.init();
};
ArduinoSwitchPlatform.prototype.accessories = function (callback) {
  const self = this;
  self.accessories = [];
  if (self.config.switches) {
    self.config.switches.forEach(function (sw) {
      self.accessories.push(new ArduinoSwitchAccessory(sw, self.log, self.config, self.transceiver));
    });
  }
  if (self.config.buttons) {
    self.config.buttons.forEach(function (sw) {
      self.accessories.push(new ArduinoButtonAccessory(sw, self.log, self.config));
    });
  }
  if (self.config.detectors) {
    self.config.detectors.forEach(function (sw) {
      self.accessories.push(new ArduinoSmokeAccessory(sw, self.log, self.config));
    });
  }
  if (self.config.sensors) {
    self.config.sensors.forEach(function (sw) {
      self.accessories.push(new ArduinoWaterAccessory(sw, self.log, self.config));
    });
  }
  if (self.config.motion) {
    self.config.motion.forEach(function (sw) {
      self.accessories.push(new ArduinoMotionAccessory(sw, self.log, self.config));
    });
  }
  setTimeout(self.listen.bind(self), 10);
  callback(self.accessories);
};
ArduinoSwitchPlatform.prototype.receiveMessage = function (value) {
  const self = this;
  var found = false;
  if (!checkCode(value, sentCodes, false) && self.accessories) {
    self.accessories.forEach(function (accessory) {
      if (accessory.notify.call(accessory, value)) found = true;
    });
  } else {
    found = true;
  }
  if (!found) {
    try {
      self.log(JSON.stringify(value));
    } catch (e) { this.log(e); }
  }
};

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerPlatform('homebridge-433-arduino', 'ArduinoRCSwitch', ArduinoSwitchPlatform);
};

/** SWITCH ACCESSORY CLASS **/
function ArduinoSwitchAccessory (sw, log, config, transceiver) {
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.transceiver = transceiver;
  self.currentState = false;
  self.throttle = config.throttle ? config.throttle : 500;

  self.service = new Service.Switch(self.name);

  self.service.getCharacteristic(Characteristic.On).value = self.currentState;

  self.service.getCharacteristic(Characteristic.On).on('get', function (cb) {
    cb(null, self.currentState);
  });

  self.service.getCharacteristic(Characteristic.On).on('set', function (state, cb) {
    self.currentState = state;
    if (self.currentState) {
      const out = getSendObject(self.sw, true);
      addCode(out, sentCodes);
      self.transceiver.send(out);
      self.log('Sent on code for %s', self.sw.name);
    } else {
      const out = getSendObject(self.sw, false);
      addCode(out, sentCodes);
      self.transceiver.send(out);
      self.log('Sent off code for %s', self.sw.name);
    }
    cb(null);
  });
  self.notifyOn = helpers.throttle(function () {
    self.log('Received on code for %s', self.sw.name);
    self.currentState = true;
    self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
  }, self.throttle, self);
  self.notifyOff = helpers.throttle(function () {
    self.log('Received off code for %s', self.sw.name);
    self.currentState = false;
    self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
  }, self.throttle, self);
}// TODO: code stuff
ArduinoSwitchAccessory.prototype.notify = function (message) {
  if (isSameAsSwitch(message, this.sw)) {
    if (getSwitchState(message, this.sw)) {
      this.notifyOn();
    } else {
      this.notifyOff();
    }
    return true;
  }
  return false;
};
ArduinoSwitchAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
  services.push(service);
  services.push(self.service);
  return services;
};

/** BUTTON ACCESSORY CLASS **/
function ArduinoButtonAccessory (sw, log, config) {
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.currentState = false;
  self.throttle = config.throttle ? config.throttle : 500;

  self.service = new Service.Switch(self.name);

  self.service.getCharacteristic(Characteristic.On).value = self.currentState;

  self.service.getCharacteristic(Characteristic.On).on('get', function (cb) {
    cb(null, self.currentState);
  });

  self.service.getCharacteristic(Characteristic.On).on('set', function (state, cb) {
    self.currentState = state;
    if (state) {
      setTimeout(this.resetButton.bind(this), 1000);
    }
    cb(null);
  }.bind(self));

  self.notifyOn = helpers.throttle(function () {
    this.log('Received button code for %s', this.sw.name);
    this.currentState = true;
    this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
    setTimeout(this.resetButton.bind(this), 1000);
  }, self.throttle, self);
}
ArduinoButtonAccessory.prototype.notify = function (message) {
  if (isSameAsSwitch(message, this.sw, true)) {
    this.notifyOn();
    return true;
  }
  return false;
};
ArduinoButtonAccessory.prototype.resetButton = function () {
  this.currentState = false;
  this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
};
ArduinoButtonAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
  services.push(service);
  services.push(self.service);
  return services;
};

/** SMOKE ACCESSORY CLASS **/
function ArduinoSmokeAccessory (sw, log, config) {
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.currentState = false;
  self.throttle = config.throttle ? config.throttle : 10000;
  self.service = new Service.SmokeSensor(self.name);
  self.service.getCharacteristic(Characteristic.SmokeDetected).value = self.currentState;
  self.service.getCharacteristic(Characteristic.SmokeDetected).on('get', function (cb) {
    cb(null, self.currentState);
  });
  self.notifyOn = helpers.throttle(function () {
    this.log('Received smoke detector code for %s', this.sw.name);
    this.currentState = true;
    this.service.getCharacteristic(Characteristic.SmokeDetected).updateValue(this.currentState);
    setTimeout(this.resetButton.bind(this), 60000);
  }, self.throttle, self);
}
ArduinoSmokeAccessory.prototype.notify = function (message) {
  if (isSameAsSwitch(message, this.sw, true)) {
    this.notifyOn();
    return true;
  }
  return false;
};
ArduinoSmokeAccessory.prototype.resetButton = function () {
  this.currentState = false;
  this.service.getCharacteristic(Characteristic.SmokeDetected).updateValue(this.currentState);
};
ArduinoSmokeAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
  services.push(service);
  services.push(self.service);
  return services;
};

/** WATER ACCESSORY CLASS **/
function ArduinoWaterAccessory (sw, log, config) {
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.currentState = false;
  self.throttle = config.throttle ? config.throttle : 10000;
  self.service = new Service.LeakSensor(self.name);
  self.service.getCharacteristic(Characteristic.LeakDetected).value = self.currentState;
  self.service.getCharacteristic(Characteristic.LeakDetected).on('get', function (cb) {
    cb(null, self.currentState);
  });
  self.notifyOn = helpers.throttle(function () {
    this.log('Received leak detector code for %s', this.sw.name);
    this.currentState = true;
    this.service.getCharacteristic(Characteristic.LeakDetected).updateValue(this.currentState);
    setTimeout(this.resetButton.bind(this), 60000);
  }, self.throttle, self);
}
ArduinoWaterAccessory.prototype.notify = function (message) {
  if (isSameAsSwitch(message, this.sw, true)) {
    this.notifyOn();
    return true;
  }
  return false;
};
ArduinoWaterAccessory.prototype.resetButton = function () {
  this.currentState = false;
  this.service.getCharacteristic(Characteristic.LeakDetected).updateValue(this.currentState);
};
ArduinoWaterAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
  services.push(service);
  services.push(self.service);
  return services;
};

/** MOTION DETECTOR ACCESSORY CLASS **/
function ArduinoMotionAccessory (sw, log, config) {
  const self = this;
  self.name = sw.name;
  self.sw = sw;
  self.log = log;
  self.config = config;
  self.currentState = false;
  self.throttle = config.throttle ? config.throttle : 10000;
  self.service = new Service.MotionSensor(self.name);
  self.service.getCharacteristic(Characteristic.MotionDetected).value = self.currentState;
  self.service.getCharacteristic(Characteristic.MotionDetected).on('get', function (cb) {
    cb(null, self.currentState);
  });
  self.notifyOn = helpers.throttle(function () {
    this.log('Received motion detector code for %s', this.sw.name);
    this.currentState = true;
    this.service.getCharacteristic(Characteristic.MotionDetected).updateValue(this.currentState);
    setTimeout(this.resetButton.bind(this), 10000);
  }, self.throttle, self);
}
ArduinoMotionAccessory.prototype.notify = function (message) {
  if (isSameAsSwitch(message, this.sw, true)) {
    this.notifyOn();
    return true;
  }
  return false;
};
ArduinoMotionAccessory.prototype.resetButton = function () {
  this.currentState = false;
  this.service.getCharacteristic(Characteristic.MotionDetected).updateValue(this.currentState);
};
ArduinoMotionAccessory.prototype.getServices = function () {
  const self = this;
  var services = [];
  var service = new Service.AccessoryInformation();
  service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
  services.push(service);
  services.push(self.service);
  return services;
};

/** HELPERS SECTION **/
var helpers = {
  throttle: function (fn, threshold, scope) {
    threshold || (threshold = 250);
    var last;

    return function () {
      var context = scope || this;
      var now = +new Date(); var args = arguments;

      if (last && now < last + threshold) {
      } else {
        last = now;
        fn.apply(context, args);
      }
    };
  }
};

function checkCode (value, array, remove) {
  var index = array.findIndex(imSameMessage, value);
  if (index > -1) {
    if (remove) array.splice(index, 1);
    return true;
  } else {
    return false;
  }
}

function addCode (value, array) {
  array.push(value);
  setTimeout(checkCode, 2000, value, array, true);
}

function getSwitchState (message, sw) {
  if (message.code && sw.on) {
    if (message.code === sw.on.code) return true;
  } else if (message.code && sw.off) {
    if (message.code === sw.off.code) return false;
  } else if (message.code && sw.code) {
    if (message.code === sw.code) return true;
  } else if (message.message && message.message.state) {
    const state = message.message.state;
    if (state === 'on') return true;
    if (state === 'off') return false;
    if (state === 'up') return true;
    if (state === 'down') return false;
    if (state === 1) return true;
    if (state === 0) return false;
    if (state === '1') return true;
    if (state === '0') return false;
  }
  return false;
}
// TODO not needed since isSameMessage on/off addition?
function isSameAsSwitch (message, sw, compareState = false) {
  if (sw.on && sw.off) { // on/off format
    if (isSameMessage(message, sw.on, compareState)) return true;
    if (isSameMessage(message, sw.off, compareState)) return true;
  } else { // button/espilight format
    if (isSameMessage(message, sw, compareState)) return true;
  }
  return false;
}
function imSameMessage (message) {
  // int idx = sentCodes.findIndex(imSameMessage, sw);
  // "this" is compare message info or switch info
  return isSameMessage(message, this, true);
}
function isSameMessage (message, prototype, compareState = false) {
  if (!message || !prototype) return;
  if (message.code && prototype.code) {
    if (prototype.code == message.code) return true;
  } else if (message.code && prototype.on) {
    if (prototype.on.code == message.code) return true;
  } else if (message.code && prototype.off) {
    if (prototype.off.code == message.code) return true;
  }
  // TODO: other kinds of espilight messages without id/unit
  else if (message.type && prototype.type) {
    if (prototype.type == message.type &&
        prototype.message.id == message.message.id &&
        prototype.message.unit == message.message.unit) {
      if (compareState) {
        if (prototype.message.state == message.message.state) {
          return true;
        }
      } else return true;
    }
  }
  return false;
}
// make a new object to send
function getSendObject (sw, on = undefined) {
  var out = {};
  if (sw.on && on === true) {
    out.code = sw.on.code;
    out.pulse = sw.on.pulse;
    out.protocol = sw.on.protocol ? sw.on.protocol : 1;
  } else if (sw.off && on === false) {
    out.code = sw.off.code;
    out.pulse = sw.off.pulse;
    out.protocol = sw.off.protocol ? sw.off.protocol : 1;
  } else if (sw.code) {
    out.code = sw.code;
    out.pulse = sw.pulse;
    out.protocol = sw.protocol ? sw.protocol : 1;
  } else if (sw.type && sw.message) { // different for on/off switches
    out.type = sw.type;
    out.message = makeTransmitMessage(sw.message, on);
  }
  return out;
}
// change message from "state":"off" to "off":1 etc.
// if on is undefined use state, else change to value of on
function makeTransmitMessage (message, on = undefined) {
  if (!message) return message;
  try {
    var clonedMessage = JSON.parse(JSON.stringify(message));
  } catch (e) { this.log(e); }
  if (!clonedMessage) return {};
  if (clonedMessage.state) {
    const state = clonedMessage.state;
    if (state === 'on') {
      if (on === undefined) {
        clonedMessage.on = 1;
      } else if (on) {
        clonedMessage.on = 1;
      } else {
        clonedMessage.off = 1;
      }
    } else if (state === 'up') {
      if (on === undefined) {
        clonedMessage.up = 1;
      } else if (on) {
        clonedMessage.up = 1;
      } else {
        clonedMessage.down = 1;
      }
    } else if (state === 'off') {
      if (on === undefined) {
        clonedMessage.off = 1;
      } else if (on) {
        clonedMessage.on = 1;
      } else {
        clonedMessage.off = 1;
      }
    } else if (state === 'down') {
      if (on === undefined) {
        clonedMessage.down = 1;
      } else if (on) {
        clonedMessage.up = 1;
      } else {
        clonedMessage.down = 1;
      }
    } else if (on) {
      clonedMessage.on = 1;
    } else if (on !== undefined) {
      clonedMessage.off = 1;
    }
    delete clonedMessage.state;
  } else if (on) {
    clonedMessage.on = 1;
  } else if (on !== undefined) {
    clonedMessage.off = 1;
  }
  // make id and unit numbers if possible
  if (clonedMessage.id) {
    const conv = Number(clonedMessage.id);
    if (!Number.isNaN(conv)) {
      clonedMessage.id = conv;
    }
  }
  if (clonedMessage.unit) {
    const conv = Number(clonedMessage.unit);
    if (!Number.isNaN(conv)) {
      clonedMessage.unit = conv;
    }
  }
  return clonedMessage;
}
