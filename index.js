var Service, Characteristic, LastUpdate;

var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
var blockPort;
var inPort;
var outPort;
var sentCodes = [];
var receivedCodes = [];

function removeCode(value, array){
    value = parseInt(value);
    var index = array.indexOf(value);
    if(index>-1){
        array.splice(index, 1);
        return true;
    }
    else {
        return false;
    }
}

function addCode(value, array){
    value = parseInt(value);
    array.push(value);
    setTimeout(removeCode, 3000, value, array);
}

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-433-arduino", "ArduinoRCSwitch", ArduinoSwitchPlatform);
}

function ArduinoSwitchPlatform(log, config) {
    var self = this;
    self.config = config;
    self.log = log;
    if(self.config.serial_port_in){
        inPort = new SerialPort(self.config.serial_port_in, {
            baudRate: 9600,
            parser: serialport.parsers.readline("\n")
        });
    }
    if(self.config.serial_port_out){
        outPort = new SerialPort(self.config.serial_port_out, {
            baudRate: 9600,
            parser: serialport.parsers.readline("\n")
        });
        blockPort = new Device(outPort);
    }
}
ArduinoSwitchPlatform.prototype.listen = function() {
    var self = this;
    if(!self.config.serial_port_in) return;
    var serialCallBack = function(data) {
        var content = data.split('/');
        var value = content[0];
        if(content.length == 2){
            var pulse = content[1].replace('\n','').replace('\r',"");
            self.log('Got a serial message, value=[%s], pulse=[%s]', value, pulse);
            if(!removeCode(value, sentCodes) && self.accessories) {
                addCode(value, receivedCodes);
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
            if(!removeCode(self.sw.on.code,receivedCodes)){
                addCode(self.sw.on.code,sentCodes);
                blockPort.send(self.sw.on.code +"/"+ self.sw.on.pulse +"\n");
                self.log('Sent on code %s',self.sw.name);
            }
        } else {
            if(!removeCode(self.sw.off.code,receivedCodes)){
                addCode(self.sw.off.code,sentCodes);
                blockPort.send(self.sw.off.code +"/"+  self.sw.off.pulse +"\n");
                self.log('Sent off code %s',self.sw.name);
            }
        }
        cb(null);
    }.bind(self));
}
ArduinoSwitchAccessory.prototype.notify = function(code) {
    var self = this;
    if(this.sw.on.code == code) {
        self.log("%s is turned on", self.sw.name);
        self.service.getCharacteristic(Characteristic.On).setValue(true);
    } else if (this.sw.off.code == code) {
        self.log("%s is turned off", self.sw.name);
        self.service.getCharacteristic(Characteristic.On).setValue(false);
    }
}
ArduinoSwitchAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
    .setCharacteristic(Characteristic.Manufacturer, 'El Cheapo')
    .setCharacteristic(Characteristic.Model, 'Mains Plug')
    .setCharacteristic(Characteristic.SerialNumber, '12345')
    .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
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
        device.processQueue();
    });
}
Device.prototype.send = function (data, callback) {
    this._queue.push([data, callback]);
    if (this._busy) return;
    this._busy = true;
    this.processQueue();
};
Device.prototype.processQueue = function () {
    var next = this._queue.shift();
    if (!next) {
        this._busy = false;
        return;
    }
    this._serial.write(next[0]);
};
