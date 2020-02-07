const WebSocket = require('ws');

function WebSocketClient(log){
	this.log = log;
	this.number = 0;	// Message number
	this.autoReconnectInterval = 5*1000;	// ms
}
WebSocketClient.prototype.open = function(url){
	let self = this;
	this.url = url;
	this.instance = new WebSocket(this.url);
	this.instance.on('open',()=>{
		this.onopen();
	});
	this.instance.on('message',(data,flags)=>{
		this.number ++;
		this.onmessage(data,flags,this.number);
	});
	this.instance.on('close',(e)=>{
		switch (e.code){
		case 1000:	// CLOSE_NORMAL
			self.log("WebSocket: closed");
			break;
		default:	// Abnormal closure
			this.reconnect(e);
			break;
		}
		this.onclose(e);
	});
	this.instance.on('error',(e)=>{
		switch (e.code){
		case 'ECONNREFUSED':
			this.reconnect(e);
			break;
		default:
			this.onerror(e);
			break;
		}
	});
}
WebSocketClient.prototype.send = function(data,option){
	try{
		this.instance.send(data,option);
	}catch (e){
		this.instance.emit('error',e);
	}
}
WebSocketClient.prototype.reconnect = function(e){
	let self = this;
	this.log(`WebSocketClient: retry in ${this.autoReconnectInterval}ms`,e);
        this.instance.removeAllListeners();
	var that = this;
	setTimeout(function(){
		self.log("WebSocketClient: reconnecting...");
		that.open(that.url);
	},this.autoReconnectInterval);
}
WebSocketClient.prototype.onopen = function(e){	this.log("WebSocketClient: open",arguments);	}
WebSocketClient.prototype.onmessage = function(data,flags,number){	this.log("WebSocketClient: message",arguments);	}
WebSocketClient.prototype.onerror = function(e){	this.log("WebSocketClient: error",arguments);	}
WebSocketClient.prototype.onclose = function(e){	this.log("WebSocketClient: closed",arguments);	}

module.exports = WebSocketClient;
