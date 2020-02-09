const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;

function SerialTransceiver(log, portName, ioTimeout = 500){
    this.log = log;
    this.portName = portName;
    this.ioTimeout = ioTimeout;
    this.blockPort = null;
    this.inPort = null;
}

SerialTransceiver.prototype.setCallback = function(callback){
    this.callback = callback;
}

SerialTransceiver.prototype.init = function(){
    this.port = new SerialPort(this.portName, {baudRate: 9600});
    this.inPort = this.port.pipe(new Readline({ delimiter: '\n' }));
    this.blockPort = new Device(this.port, this.ioTimeout);
    this.inPort.on('data', this.serialCallback.bind(this));
}

SerialTransceiver.prototype.send = function(message){
    if(message.code){
        this.blockPort.send(message.code +"/"+ message.pulse +"/"+ message.protocol + "\n");
    }else if(message.type && message.message){
        this.blockPort.send(JSON.stringify(message) + "\n");
    }
}

SerialTransceiver.prototype.serialCallback = function(data) {
    if(data.startsWith("OK")) return;
    this.blockPort.lastInputTime = new Date().getTime();
    if(data.startsWith("{")){
        let message = JSON.parse(data);
        this.callback(message);
        return;
    }
    if(data.startsWith("pilight")){
        this.log(data);
        return;
    }
    var content = data.split('/');
    if(content.length >= 2){
        var value = content[0];
        var pulse = content[1].replace('\n','').replace('\r',"");
        var protocol = content[2];
        if(protocol){
          protocol = protocol.replace('\n','').replace('\r',"");
        }
        else{
          protocol = 1;
        }
        this.callback({"code":value,"pulse":pulse,"protocol":protocol});
    }
}

/*private class device, send to serial port with queue*/
function Device (serial, ioTimeout = 500) {
    this.lastInputTime = 0;
    this.ioTimeout = ioTimeout;
    this._serial = serial;
    this._queue = [];
    this._busy = false;
    var device = this;
    var pipedSerial = serial.pipe(new Readline({ delimiter: '\n' }));
    pipedSerial.on('data', function (data) {
        if(data.startsWith("OK")){
          device.processQueue();
        }
    });
}
Device.prototype.send = function (data) {
    this._queue.push(data);
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
    if(curTime - this.lastInputTime < this.ioTimeout){
        setTimeout(this.processQueue.bind(this, next), this.ioTimeout);
    }else{
        this._serial.write(next);
    }
};

module.exports = SerialTransceiver;
