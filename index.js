var Service, Characteristic, LastUpdate;

var SerialPort = require('serialport');
var blockPort;
var inPort;
var outPort;
var sentCodes = [];
var lastInputTime = 0;
var inputOutputTimeout = 500;

function ArduinoSwitchPlatform(log, config) {
    var self = this;
    self.config = config;
    self.log = log;
    if(config.input_output_timeout) inputOutputTimeout = config.input_output_timeout;
    if(config.serial_port_in == config.serial_port_out){
        inPort = new SerialPort(self.config.serial_port_in, {
            baudRate: 9600,
            parser: SerialPort.parsers.readline("\n")
        });
        outPort = inPort;
        blockPort = new Device(inPort);
        self.log('Enabling one-arduino-mode using ',config.serial_port_in);
    }
    else{
        if(self.config.serial_port_in){
            inPort = new SerialPort(self.config.serial_port_in, {
                baudRate: 9600,
                parser: SerialPort.parsers.readline("\n")
            });
        }
        if(self.config.serial_port_out){
            outPort = new SerialPort(self.config.serial_port_out, {
                baudRate: 9600,
                parser: SerialPort.parsers.readline("\n")
            });
            blockPort = new Device(outPort);
        }
        self.log('Enabling two-arduino-mode using ',config.serial_port_in, config.serial_port_out);
    }
}
ArduinoSwitchPlatform.prototype.listen = function() {
    var self = this;
    if(!self.config.serial_port_in) return;
    var serialCallBack = function(data) {
        if(data.startsWith("OK")) return;
        var content = data.split('/');
        if(content.length == 2){
            var value = content[0];
            var pulse = content[1].replace('\n','').replace('\r',"");
            if(!checkCode(value, sentCodes, false) && self.accessories) {
                self.log('Got a serial message, value=[%s], pulse=[%s]', value, pulse);
                lastInputTime = new Date().getTime();
                self.accessories.forEach(function(accessory) {
                    accessory.notify.call(accessory, value);
                });
            }
        }
    };
    inPort.on('data', serialCallBack);
}
ArduinoSwitchPlatform.prototype.accessories = function(callback) {
    var self = this;
    self.accessories = [];
    self.config.switches.forEach(function(sw) {
        self.accessories.push(new ArduinoSwitchAccessory(sw, self.log, self.config));
    });
    self.config.buttons.forEach(function(sw) {
        self.accessories.push(new ArduinoButtonAccessory(sw, self.log, self.config));
    });
    setTimeout(self.listen.bind(self),10);
    callback(self.accessories);
}

function ArduinoSwitchAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;

    self.service = new Service.Switch(self.name);

    self.service.getCharacteristic(Characteristic.On).value = self.currentState;

    self.service.getCharacteristic(Characteristic.On).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));

    self.service.getCharacteristic(Characteristic.On).on('set', function(state, cb) {
        self.currentState = state;
        if(!self.config.serial_port_out){
            cb(null);
            return;
        };
        if(self.currentState) {
            addCode(self.sw.on.code,sentCodes);
            blockPort.send(self.sw.on.code +"/"+ self.sw.on.pulse +"\n");
            self.log('Sent on code for %s',self.sw.name);
        } else {
            addCode(self.sw.off.code,sentCodes);
            blockPort.send(self.sw.off.code +"/"+  self.sw.off.pulse +"\n");
            self.log('Sent off code for %s',self.sw.name);
        }
        cb(null);
    }.bind(self));
}
ArduinoSwitchAccessory.prototype.notify = function(code) {
    var self = this;
    if(this.sw.on.code == code) {
        self.log("Received on code for %s", self.sw.name);
        self.currentState = true;
        self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
    } else if (this.sw.off.code == code) {
        self.log("Received off code for %s", self.sw.name);
        self.currentState = false;
        self.service.getCharacteristic(Characteristic.On).updateValue(self.currentState);
    }
}
ArduinoSwitchAccessory.prototype.getServices = function() {
    var self = this;
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
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;

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
}
ArduinoButtonAccessory.prototype.notify = function(code) {
    if(this.sw.code == code) {
        this.log("Received button code for %s", this.sw.name);
        this.currentState = true;
        this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
        setTimeout(this.resetButton.bind(this), 1000);
    }
}
ArduinoButtonAccessory.prototype.resetButton = function() {
    this.currentState = false;
    this.service.getCharacteristic(Characteristic.On).updateValue(this.currentState);
}
ArduinoButtonAccessory.prototype.getServices = function() {
    var self = this;
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

function Device (serial) {
    this._serial = serial;
    this._queue = [];
    this._busy = false;
    var device = this;
    serial.on('data', function (data) {
        if(data.startsWith("OK")) device.processQueue();
    });
}
Device.prototype.send = function (data, callback) {
    this._queue.push([data, callback]);
    if (this._busy) return;
    this._busy = true;
    this.processQueue();
};
Device.prototype.processQueue = function (inData) {
    var next = inData == undefined ? this._queue.shift() : inData;
    if (!next) {
        this._busy = false;
        return;
    }
    var curTime = new Date().getTime();
    if(curTime - lastInputTime < inputOutputTimeout){
        setTimeout(this.processQueue.bind(this, next), inputOutputTimeout);
    }else{
        this._serial.write(next[0]);
    }
};

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
