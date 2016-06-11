var http = require('http');
var should = require('should');
var tunnel = require('../index');

describe('Tunnel agent', function() {
  it('should properly release socket if proxy response is not 200', function (done) {
    var proxyPort = 3001;
    var agent;

    setupProxy();
    function setupProxy() {
      proxy = http.createServer(function(req, res) {
        should.fail();
      });
      proxy.on('upgrade', onConnect); // for v0.6
      proxy.on('connect', onConnect); // for v0.7 or later

      function onConnect(req, clientSocket, head) {
        tunnel.debug('PROXY: got CONNECT request');

        req.method.should.equal('CONNECT');
        req.url.should.equal('localhost:80');
        req.headers.should.not.have.property('transfer-encoding');

        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
      }
      proxy.listen(proxyPort, setupClient);
  }

    function setupClient() {
      http.requestOrig = http.request;
      http.request = function() {
        var args = Array.prototype.slice.call(arguments);
        var req = http.requestOrig.apply(http, args);
        if (req.method == 'CONNECT') {
          req.on('socket', function(socket) {
            console.log('got socket from connect method')
            socket.on('close', function() {
              http.request = http.requestOrig;
              done();
            });
          });
        }
        return req;
      }

      agent = tunnel.httpOverHttp({
        proxy: {
          port: proxyPort
        }
      });

      var req = http.get({
        path: '/',
        agent: agent
      });
      req.on('error', function(err) {
        console.log('got req error', err);
      });
    }
  });
});
