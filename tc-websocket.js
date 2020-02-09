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

WebsocketTransceiver.prototype.send = function(message){
    var msg = null;
    if(message.code){
        msg = message.code +"/"+ message.pulse +"/"+ message.protocol;
    }else if(message.type && message.message){
        msg = JSON.stringify(message);
    }
    if(msg == null) return;
    this._queue.push(msg);
    if (this._busy) return;
    this._busy = true;
    this.processQueue();
}

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

module.exports = WebsocketTransceiver;
