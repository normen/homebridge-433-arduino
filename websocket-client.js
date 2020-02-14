const WebSocket = require('ws');

function WebSocketClient (log) {
  this.log = log;
  this.number = 0; // Message number
  this.autoReconnectInterval = 20 * 1000; // ms
  this.pongReturned = true;
}
WebSocketClient.prototype.open = function (url) {
  const self = this;
  this.url = url;
  this.instance = new WebSocket(this.url);
  this.instance.on('open', () => {
    this.onopen();
    self.pongReturned = true;
    self.checkPing();
  });
  this.instance.on('message', (data, flags) => {
    this.number++;
    this.onmessage(data, flags, this.number);
  });
  this.instance.on('close', (e) => {
    switch (e.code) {
      case 1000: // CLOSE_NORMAL
        this.reconnect(e);
        break;
      default: // Abnormal closure
        this.reconnect(e);
        break;
    }
    this.onclose(e);
  });
  this.instance.on('error', (e) => {
    switch (e.code) {
      case 'ECONNREFUSED':
        this.reconnect(e);
        break;
      default:
        this.reconnect(e);
        break;
    }
    this.onerror(e);
  });
  this.instance.on('pong', (e) => {
    self.pongReturned = true;
  });
};
WebSocketClient.prototype.checkPing = function () {
  if (!this.pongReturned) {
    this.instance.terminate();
  } else {
    this.pongReturned = false;
    this.instance.ping('ping');
    clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(this.checkPing.bind(this), this.autoReconnectInterval);
  }
};
WebSocketClient.prototype.send = function (data, option) {
  try {
    this.instance.send(data, option);
  } catch (e) {
    this.instance.emit('error', e);
  }
};
WebSocketClient.prototype.reconnect = function (e) {
  const self = this;
  this.instance.removeAllListeners();
  var that = this;
  setTimeout(function () {
    self.log('WebSocketClient: reconnecting...');
    that.open(that.url);
  }, this.autoReconnectInterval);
};
WebSocketClient.prototype.onopen = function (e) { this.log('WebSocketClient: open', arguments); };
WebSocketClient.prototype.onmessage = function (data, flags, number) { this.log('WebSocketClient: message', arguments); };
WebSocketClient.prototype.onerror = function (e) { this.log('WebSocketClient: error', arguments); };
WebSocketClient.prototype.onclose = function (e) { this.log('WebSocketClient: closed', arguments); };

module.exports = WebSocketClient;
