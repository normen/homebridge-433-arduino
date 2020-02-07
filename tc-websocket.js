const WebSocketClient = require('./websocket-client');

function WebsocketTransceiver(log, host, port=80, ioTimeout=500){
    this.log = log;
    this.host = host;
    this.port = port;

    this._queue = [];
    this._busy = false;

    this.lastInputTime = 0;
    this.ioTimeout = ioTimeout;

    this.ws = new WebSocketClient(log);
}

WebsocketTransceiver.prototype.setCallback = function(callback){
    this.callback = callback;
}

WebsocketTransceiver.prototype.init = function(){
    let self = this;
    this.ws.open('ws://'+this.host+':'+this.port);
    this.ws.onopen = function open() {
      self.log("Connected to "+self.host+":"+self.port);
    }
    this.ws.onerror = function open() {
      self.log("Error with "+self.host+":"+self.port);
    }
    this.ws.onmessage = this.wsCallback.bind(this);
}

WebsocketTransceiver.prototype.send = function(code, pulse, protocol = 1){
    this._queue.push(code+"/"+pulse+"/"+protocol);
    if (this._busy) return;
    this._busy = true;
    this.processQueue();
};

WebsocketTransceiver.prototype.processQueue = function(inData) {
    var next = inData == undefined ? this._queue.shift() : inData;
    if (!next) {
        this._busy = false;
        return;
    }
    var curTime = new Date().getTime();
    if(curTime - this.lastInputTime < this.ioTimeout){
        setTimeout(this.processQueue.bind(this, next), this.ioTimeout);
    }else{
        this.ws.send(next);
    }
};

WebsocketTransceiver.prototype.wsCallback = function(data) {
    if(data.startsWith("OK")){
      this.processQueue();
      return;
    }
    this.lastInputTime = new Date().getTime();
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
        this.callback(value,pulse,protocol);
    }
}

module.exports = WebsocketTransceiver;
