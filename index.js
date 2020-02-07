var Service, Characteristic, LastUpdate;
const SerialTransceiver = require("./tc-serial");
const WebsocketTransceiver = require("./tc-websocket");
var sentCodes = [];

function ArduinoSwitchPlatform(log, config) {
    let self = this;
    self.config = config;
    self.log = log;
    var ioTimeout = 500;
    if(config.input_output_timeout) ioTimeout = config.input_output_timeout;
    if(config.serial_port || config.serial_port_out){
        let myport = config.serial_port ? config.serial_port : config.serial_port_out;
        self.log('Enabling USB mode using ',myport);
        self.transceiver = new SerialTransceiver(self.log, myport, ioTimeout);
    }
    else if(config.host){
        let host = config.host;
        let port = config.port?config.port:80;
        self.log('Enabling WebSocket mode using ',host+":"+port);
        self.transceiver = new WebsocketTransceiver(self.log, port, host, ioTimeout);
    }
    else{
        self.log('Two arduino Mode not available anymore!');
    }
}
ArduinoSwitchPlatform.prototype.listen = function() {
  this.transceiver.setCallback(this.receiveMessage.bind(this));
  this.transceiver.init();
}
ArduinoSwitchPlatform.prototype.accessories = function(callback) {
    let self = this;
    self.accessories = [];
    if(self.config.switches) self.config.switches.forEach(function(sw) {
        self.accessories.push(new ArduinoSwitchAccessory(sw, self.log, self.config, self.transceiver));
    });
    if(self.config.buttons) self.config.buttons.forEach(function(sw) {
        self.accessories.push(new ArduinoButtonAccessory(sw, self.log, self.config));
    });
    if(self.config.detectors) self.config.detectors.forEach(function(sw) {
        self.accessories.push(new ArduinoSmokeAccessory(sw, self.log, self.config));
    });
    if(self.config.sensors) self.config.sensors.forEach(function(sw) {
        self.accessories.push(new ArduinoWaterAccessory(sw, self.log, self.config));
    });
    setTimeout(self.listen.bind(self),10);
    callback(self.accessories);
}
ArduinoSwitchPlatform.prototype.receiveMessage = function(value,pulse,protocol=1) {
  let self = this;
  if(!checkCode(value, sentCodes, false) && self.accessories) {
    self.log('Got a serial message, value=[%s], pulse=[%s]', value, pulse);
    self.accessories.forEach(function(accessory) {
      accessory.notify.call(accessory, value);
    });
  }
}

function ArduinoSwitchAccessory(sw, log, config, transceiver) {
    let self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.transceiver = transceiver;
    self.currentState = false;
    self.throttle = config.throttle?config.throttle:500;

    self.service = new Service.Switch(self.name);

    self.service.getCharacteristic(Characteristic.On).value = self.currentState;

    self.service.getCharacteristic(Characteristic.On).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));

    self.service.getCharacteristic(Characteristic.On).on('set', function(state, cb) {
        self.currentState = state;
        /*if(!self.config.serial_port_out){
            cb(null);
            return;
        };*/
        if(self.currentState) {
            addCode(self.sw.on.code,sentCodes);
            let protocol = self.sw.on.protocol?self.sw.on.protocol:1;
            self.transceiver.send(self.sw.on.code, self.sw.on.pulse, protocol);
            self.log('Sent on code for %s',self.sw.name);
        } else {
            addCode(self.sw.off.code,sentCodes);
            let protocol = self.sw.off.protocol?self.sw.off.protocol:1;
            self.transceiver.send(self.sw.off.code, self.sw.off.pulse, protocol);
            self.log('Sent off code for %s',self.sw.name);
        }
        cb(null);
    }.bind(self));
    self.notifyOn = helpers.throttle(function(){
        self.log("Received on code for %s", self.sw.name);
        self.currentState = true;
        self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
    },self.throttle,self);
    self.notifyOff = helpers.throttle(function(){
        self.log("Received off code for %s", self.sw.name);
        self.currentState = false;
        self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
    },self.throttle,self);
}
ArduinoSwitchAccessory.prototype.notify = function(code) {
    let self = this;
    if(this.sw.on.code == code) {
        self.notifyOn();
    } else if (this.sw.off.code == code) {
        self.notifyOff();
    }
}
ArduinoSwitchAccessory.prototype.getServices = function() {
    let self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.Model, 'Pulse-'+self.sw.on.pulse)
    .setCharacteristic(Characteristic.SerialNumber, self.sw.on.code+'-'+self.sw.off.code)
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

function ArduinoButtonAccessory(sw, log, config) {
    let self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.throttle = config.throttle?config.throttle:500;

    self.service = new Service.Switch(self.name);

    self.service.getCharacteristic(Characteristic.On).value = self.currentState;

    self.service.getCharacteristic(Characteristic.On).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));

    self.service.getCharacteristic(Characteristic.On).on('set', function(state, cb) {
        self.currentState = state;
        if(state){
            setTimeout(this.resetButton.bind(this), 1000);
        }
        cb(null);
    }.bind(self));

    self.notifyOn = helpers.throttle(function(){
        this.log("Received button code for %s", this.sw.name);
        this.currentState = true;
        this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
        setTimeout(this.resetButton.bind(this), 1000);
    },self.throttle,self);
}
ArduinoButtonAccessory.prototype.notify = function(code) {
    if(this.sw.code == code) {
        this.notifyOn();
    }
}
ArduinoButtonAccessory.prototype.resetButton = function() {
    this.currentState = false;
    this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
}
ArduinoButtonAccessory.prototype.getServices = function() {
    let self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.Model, 'Pulse-'+self.sw.pulse)
    .setCharacteristic(Characteristic.SerialNumber, self.sw.code)
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

function ArduinoSmokeAccessory(sw, log, config) {
    let self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.throttle = config.throttle?config.throttle:10000;
    self.service = new Service.SmokeSensor(self.name);
    self.service.getCharacteristic(Characteristic.SmokeDetected).value = self.currentState;
    self.service.getCharacteristic(Characteristic.SmokeDetected).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));
    self.notifyOn = helpers.throttle(function(){
        this.log("Received smoke detector code for %s", this.sw.name);
        this.currentState = true;
        this.service.getCharacteristic(Characteristic.SmokeDetected).updateValue(this.currentState);
        setTimeout(this.resetButton.bind(this), 60000);
    },self.throttle,self);
}
ArduinoSmokeAccessory.prototype.notify = function(code) {
    if(this.sw.code == code) {
        this.notifyOn();
    }
}
ArduinoSmokeAccessory.prototype.resetButton = function() {
    this.currentState = false;
    this.service.getCharacteristic(Characteristic.SmokeDetected).updateValue(this.currentState);
}
ArduinoSmokeAccessory.prototype.getServices = function() {
    let self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.Model, 'Pulse-'+self.sw.pulse)
    .setCharacteristic(Characteristic.SerialNumber, self.sw.code)
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

function ArduinoWaterAccessory(sw, log, config) {
    let self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.throttle = config.throttle?config.throttle:10000;
    self.service = new Service.LeakSensor(self.name);
    self.service.getCharacteristic(Characteristic.LeakDetected).value = self.currentState;
    self.service.getCharacteristic(Characteristic.LeakDetected).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));
    self.notifyOn = helpers.throttle(function(){
        this.log("Received leak detector code for %s", this.sw.name);
        this.currentState = true;
        this.service.getCharacteristic(Characteristic.LeakDetected).updateValue(this.currentState);
        setTimeout(this.resetButton.bind(this), 60000);
    },self.throttle,self);
}
ArduinoWaterAccessory.prototype.notify = function(code) {
    if(this.sw.code == code) {
        this.notifyOn();
    }
}
ArduinoWaterAccessory.prototype.resetButton = function() {
    this.currentState = false;
    this.service.getCharacteristic(Characteristic.LeakDetected).updateValue(this.currentState);
}
ArduinoWaterAccessory.prototype.getServices = function() {
    let self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, '433 MHz RC')
    .setCharacteristic(Characteristic.Model, 'Pulse-'+self.sw.pulse)
    .setCharacteristic(Characteristic.SerialNumber, self.sw.code)
    .setCharacteristic(Characteristic.FirmwareRevision, process.env.version)
    .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}


function checkCode(value, array, remove){
    value = parseInt(value);
    var index = array.indexOf(value);
    if(index>-1){
        if(remove) array.splice(index, 1);
        return true;
    }
    else {
        return false;
    }
}

function addCode(value, array){
    value = parseInt(value);
    array.push(value);
    setTimeout(checkCode, 2000, value, array, true);
}

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-433-arduino", "ArduinoRCSwitch", ArduinoSwitchPlatform);
}

var helpers = {
  throttle: function(fn, threshold, scope) {
    threshold || (threshold = 250);
    var last, deferTimer;

    return function() {
      var context = scope || this;
      var now = +new Date, args = arguments;

      if (last && now < last + threshold) {
      } else {
        last = now;
        fn.apply(context, args);
      }
    };
  }
}
