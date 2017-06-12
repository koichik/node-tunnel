var http = require('http');
var net = require('net');
var should = require('should');
var tunnel = require('../index');

describe('HTTP over HTTP internal server error', function() {
  it('should finish without error', function(done) {
    var serverPort = 3010;
    var proxyPort = 3011;
    var poolSize = 3;
    var proxyConnect = 0;
    var clientConnect = 0;
    var proxyClosed = false;
    var clientClosed = false;
    var clientGotSocket = false;
    var clientGotError = false;
    var proxy;
    var agent;

    proxy = http.createServer(function(req, res) {
      should.fail();
    });
    proxy.on('upgrade', onConnect); // for v0.6
    proxy.on('connect', onConnect); // for v0.7 or later

    function onConnect(req, clientSocket, head) {
      tunnel.debug('PROXY: got CONNECT request');

      req.method.should.equal('CONNECT');
      req.url.should.equal('localhost:' + serverPort);
      req.headers.should.not.have.property('transfer-encoding');
      req.headers.should.have.property('proxy-authorization',
        'Basic ' + new Buffer('user:password').toString('base64'));
      ++proxyConnect;

      clientSocket.on('close', function() {
        proxyClosed = true;
        proxy.close();
      });
      tunnel.debug('PROXY: returning 500');
      clientSocket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      clientSocket.end();
    }
    proxy.listen(proxyPort, setupClient);

    function setupClient() {
      agent = tunnel.httpOverHttp({
        maxSockets: poolSize,
        proxy: {
          port: proxyPort,
          proxyAuth: 'user:password'
        }
      });

      tunnel.debug('CLIENT: Making HTTP request');
      var req = http.get({
        port: serverPort,
        path: '/',
        agent: agent
      }, function(res) {
        tunnel.debug('CLIENT: got HTTP response');
        ++clientConnect;
      });
      req.on('socket', function(socket) {
        clientGotSocket = true;
      });
      req.on('error', function(err) {
        clientGotError = true;
        err.code.should.equal('ECONNRESET');
      });
    }

    proxy.on('close', function() {
      proxyConnect.should.equal(1);
      proxyClosed.should.ok();

      clientConnect.should.equal(0);
      clientGotSocket.should.not.ok();
      clientGotError.should.ok();

      agent.sockets.should.be.empty;
      agent.requests.should.be.empty;

      done();
    });
  });
});
