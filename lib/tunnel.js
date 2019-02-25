'use strict';

var net = require('net');
var tls = require('tls');
var http = require('http');
var https = require('https');
var events = require('events');
var assert = require('assert');
var util = require('util');
var ntlm = require('./ntlm');

var os = require("os")

exports.httpOverHttp = httpOverHttp;
exports.httpsOverHttp = httpsOverHttp;
exports.httpOverHttps = httpOverHttps;
exports.httpsOverHttps = httpsOverHttps;


function httpOverHttp(options) {
  var agent = new TunnelingAgent(options);
  agent.request = http.request;
  return agent;
}

function httpsOverHttp(options) {
  var agent = new TunnelingAgent(options);
  agent.request = http.request;
  agent.createSocket = createSecureSocket;
  agent.defaultPort = 443;
  return agent;
}

function httpOverHttps(options) {
  var agent = new TunnelingAgent(options);
  agent.request = https.request;
  return agent;
}

function httpsOverHttps(options) {
  var agent = new TunnelingAgent(options);
  agent.request = https.request;
  agent.createSocket = createSecureSocket;
  agent.defaultPort = 443;
  return agent;
}


function TunnelingAgent(options) {
  var self = this;
  self.options = options || {};
  self.proxyOptions = self.options.proxy || {};
  self.maxSockets = self.options.maxSockets || http.Agent.defaultMaxSockets;
  self.requests = [];
  self.sockets = [];
  self.freeSockets = [];

  self.on('free', function onFree(socket, host, port, localAddress) {
    var options = toOptions(host, port, localAddress);
    for (var i = 0, len = self.requests.length; i < len; ++i) {
      var pending = self.requests[i];
      if (pending.host === options.host && pending.port === options.port) {
        // Detect the request to connect same origin server,
        // reuse the connection.
        self.requests.splice(i, 1);
        pending.request.onSocket(socket);
        pending.request.end();
        return;
      }
    }

    if (!self.keepAlive) {
      socket.destroy();
      self.removeSocket(socket);
    }
    else {
      // save the socket for reuse later
      self.removeSocket(socket);
      socket.removeAllListeners();
      if (!!self.freeSockets[options.host + ':' + options.port]) {
        self.freeSockets[options.host + ':' + options.port].push(socket);
      }
      else {
        self.freeSockets[options.host + ':' + options.port] = [socket];
      }
    }
  });
}
util.inherits(TunnelingAgent, events.EventEmitter);

TunnelingAgent.prototype.addRequest = function addRequest(req, host, port, localAddress) {
  var self = this;
  var options = mergeOptions({request: req}, self.options, toOptions(host, port, localAddress));

  if (self.sockets.length >= this.maxSockets) {
    // We are over limit so we'll add it to the queue.
    self.requests.push(options);
    return;
  }

  if (self.keepAlive) {
    var socket = !!self.freeSockets[options.host + ':' + options.port] ? self.freeSockets[options.host + ':' + options.port].pop() : undefined;
    if(socket){
      this.sockets.push(socket);
      executeRequest(socket);
      return
    }
  }

  // If we are under maxSockets create a new one.
  self.createSocket(options, executeRequest);

  function executeRequest(socket) {
    socket.on('free', onFree);
    socket.on('close', onCloseOrRemove);
    socket.on('agentRemove', onCloseOrRemove);
    req.onSocket(socket);
    req.end();

    function onFree() {
      self.emit('free', socket, options);
    }

    function onCloseOrRemove(err) {
      self.removeSocket(socket);
      socket.removeListener('free', onFree);
      socket.removeListener('close', onCloseOrRemove);
      socket.removeListener('agentRemove', onCloseOrRemove);
    }
  }
};

TunnelingAgent.prototype.createSocket = function createSocket(options, cb) {
  var self = this;
  var placeholder = {};
  self.sockets.push(placeholder);
  const keepAliveAgent = new http.Agent({ 
    keepAlive: true, 
    maxSockets: 1,
    maxFreeSockets: 1
  })
  var connectOptions = mergeOptions({}, self.proxyOptions, {
    method: 'CONNECT',
    path: options.host + ':' + options.port,
    agent: keepAliveAgent,
    headers: {
      host: options.host + ':' + options.port
    }
  });
  if (options.localAddress) {
    connectOptions.localAddress = options.localAddress;
  }
  
  if (connectOptions.proxyAuth) {
    connectOptions.headers = connectOptions.headers || {};
    if (typeof (connectOptions.proxyAuth) === 'string') {
      connectOptions.headers['Proxy-Authorization'] = 'Basic ' +
        new Buffer(connectOptions.proxyAuth).toString('base64');
    }
    else {
      connectOptions.headers['Proxy-Authorization'] = 'Basic ' +
        new Buffer(connectOptions.proxyAuth.username + ':' + connectOptions.proxyAuth.password).toString('base64');
    }
  }

  debug('making CONNECT request');
  var connectReq = self.request(connectOptions);
  connectReq.useChunkedEncodingByDefault = false; // for v0.6
  connectReq.once('response', onResponse); // for v0.6
  connectReq.once('upgrade', onUpgrade);   // for v0.6
  connectReq.once('connect', onConnect);   // for v0.7 or later
  connectReq.once('error', onError);
  connectReq.end();

  function onResponse(res) {
    // Very hacky. This is necessary to avoid http-parser leaks.
    res.upgrade = true;
  }

  function onUpgrade(res, socket, head) {
    // Hacky.
    process.nextTick(function() {
      onConnect(res, socket, head);
    });
  }

  function onConnect(res, socket, head) {
    connectReq.removeAllListeners();
    socket.removeAllListeners();

    if(res.statusCode !== 200 && res.headers["proxy-authenticate"] == 'NTLM') {
      connectOptions.headers = connectOptions.headers || {};
      connectOptions.headers['Proxy-Connection'] = 'keep-alive',
      connectOptions.headers['connection'] = 'keep-alive';

      if (typeof (connectOptions.proxyAuth) === 'string') {
        throw "Expected proxyAuth to be object with username and password fields"
      }

      var ntlmOpts = {
        domain: '',
        workstation: os.hostname(),
        username: connectOptions.proxyAuth.username,
        password: connectOptions.proxyAuth.password
      };

      connectOptions.headers['proxy-authorization'] = ntlm.createType1Message(ntlmOpts);
      connectOptions.headers['keep-alive'] = 'true';

      connectReq = self.request(connectOptions)
      connectReq.once('response', onResponse); // for v0.6
      connectReq.once('upgrade', onUpgrade);   // for v0.6
      connectReq.once('connect', onConnect);   // for v0.7 or later
      connectReq.once('error', onError);
      connectReq.end();
    }
    else if (res.statusCode !== 200 && !!res.headers["proxy-authenticate"] && res.headers["proxy-authenticate"].indexOf('NTLM') !== -1) {

      var type2msg = ntlm.parseType2Message(res.headers['proxy-authenticate'], function (error) {
                return null;
            }.bind(this));
      if (!type2msg) {
          return;
      }

      var ntlmOpts = {
        domain: '',
        workstation: os.hostname(),
        username: connectOptions.proxyAuth.username,
        password: connectOptions.proxyAuth.password
      };
      connectOptions.headers['proxy-authorization'] = ntlm.createType3Message(type2msg, ntlmOpts);

      connectOptions.agent.freeSockets[connectOptions.agent.getName(connectOptions)] = [socket];
      connectReq = self.request(connectOptions)
      connectReq.once('response', onResponse); // for v0.6
      connectReq.once('upgrade', onUpgrade);   // for v0.6
      connectReq.once('connect', onConnect);   // for v0.7 or later
      connectReq.once('error', onError);
      connectReq.end();
    }
    else if (res.statusCode != 200) {
      debug('tunneling socket could not be established, statusCode=%d, statusMessage=%d', res.statusCode, res.statusMessage);
      socket.destroy();
      var error = new Error('tunneling socket could not be established, statusCode=' + res.statusCode + ' statusMessage=' + res.statusMessage);
      error.code = 'ECONNRESET';
      options.request.emit('error', error);
      self.removeSocket(placeholder);
      return;
    }
    
    if (res.statusCode == 200)
    {
      if (head.length > 0) {
        debug('got illegal response body from proxy');
        socket.destroy();
        var error = new Error('got illegal response body from proxy');
        error.code = 'ECONNRESET';
        options.request.emit('error', error);
        self.removeSocket(placeholder);
        return;
      }
      debug('tunneling connection has established');
      self.sockets[self.sockets.indexOf(placeholder)] = socket;
      return cb(socket);
    }
  }

  function onError(cause) {
    connectReq.removeAllListeners();

    debug('tunneling socket could not be established, cause=%s\n',
          cause.message, cause.stack);
    var error = new Error('tunneling socket could not be established, ' +
                          'cause=' + cause.message);
    error.code = 'ECONNRESET';
    options.request.emit('error', error);
    self.removeSocket(placeholder);
  }
};

TunnelingAgent.prototype.removeSocket = function removeSocket(socket) {
  var pos = this.sockets.indexOf(socket)
  if (pos === -1) {
    return;
  }
  this.sockets.splice(pos, 1);

  var pending = this.requests.shift();
  if (pending) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createSocket(pending, function(socket) {
      pending.request.onSocket(socket);
      pending.request.end();
    });
  }
};

function createSecureSocket(options, cb) {
  var self = this;
  TunnelingAgent.prototype.createSocket.call(self, options, function(socket) {
    var hostHeader = options.request.getHeader('host');
    var tlsOptions = mergeOptions({}, self.options, {
      socket: socket,
      servername: hostHeader ? hostHeader.replace(/:.*$/, '') : options.host
    });

    // 0 is dummy port for v0.6
    var secureSocket = tls.connect(0, tlsOptions);
    self.sockets[self.sockets.indexOf(socket)] = secureSocket;
    cb(secureSocket);
  });
}

function toOptions(host, port, localAddress) {
  if (typeof host === 'string') { // since v0.10
    return {
      host: host,
      port: port,
      localAddress: localAddress
    };
  }
  return host; // for v0.11 or later
}

function mergeOptions(target) {
  for (var i = 1, len = arguments.length; i < len; ++i) {
    var overrides = arguments[i];
    if (typeof overrides === 'object') {
      var keys = Object.keys(overrides);
      for (var j = 0, keyLen = keys.length; j < keyLen; ++j) {
        var k = keys[j];
        if (overrides[k] !== undefined) {
          target[k] = overrides[k];
        }
      }
    }
  }
  return target;
}


var debug;
if (process.env.NODE_DEBUG && /\btunnel\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    var args = Array.prototype.slice.call(arguments);
    if (typeof args[0] === 'string') {
      args[0] = 'TUNNEL: ' + args[0];
    } else {
      args.unshift('TUNNEL:');
    }
    console.error.apply(console, args);
  }
} else {
  debug = function() {};
}
exports.debug = debug; // for test
