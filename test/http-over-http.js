var http = require('http');
var net = require('net');
var should = require('should');
var tunnel = require('../index');

describe('HTTP over HTTP', function() {
  it('should finish without error', function(done) {
    var serverPort = 3000;
    var proxyPort = 3001;
    var poolSize = 3;
    var N = 10;
    var serverConnect = 0;
    var proxyConnect = 0;
    var clientConnect = 0;
    var agent;
    
    var server = http.createServer(function(req, res) {
      ++serverConnect;
      res.writeHead(200);
      res.end('Hello' + req.url);
    });
    server.listen(serverPort, function() {
      var proxy = http.createServer(function(req, res) {
        should.fail();
      });
      proxy.on('connect', function(req, clientSocket, head) {
        req.method.should.equal('CONNECT');
        req.url.should.equal('localhost:' + serverPort);
        ++proxyConnect;
    
        var serverSocket = net.connect(serverPort, function() {
          clientSocket.write('HTTP/1.1 200 Connection established\r\n\r\n');
          clientSocket.pipe(serverSocket);
          serverSocket.write(head);
          serverSocket.pipe(clientSocket);
          // workaround, see joyent/node#2524
          serverSocket.on('end', function() {
            clientSocket.end();
          });
        });
      });
      proxy.listen(proxyPort, function() {
        agent = tunnel.httpOverHttp({
          maxSockets: poolSize,
          proxy: {
            port: proxyPort
          }
        });
    
        for (var i = 0; i < N; ++i) {
          (function(i) {
            var req = http.get({
              port: serverPort,
              path: '/' + i,
              agent: agent
            }, function(res) {
              res.setEncoding('utf8');
              res.on('data', function(data) {
                data.should.equal('Hello/' + i);
              });
              res.on('end', function() {
                ++clientConnect;
                if (clientConnect === N) {
                  proxy.close();
                  server.close();
                }
              });
            });
          })(i);
        }
      });
    });
    
    server.on('close', function() {
      serverConnect.should.equal(N);
      proxyConnect.should.equal(poolSize);
      clientConnect.should.equal(N);
    
      agent.sockets.should.have.lengthOf(0);
      agent.requests.should.have.lengthOf(0);
  
      done();
    });
  });
});
