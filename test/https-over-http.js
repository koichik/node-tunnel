var http = require('http');
var https = require('https');
var net = require('net');
var fs = require('fs');
var path = require('path');
var should = require('should');
var tunnel = require('../index');

function readPem(file) {
  return fs.readFileSync(path.join('test/keys', file + '.pem'));
}

describe('HTTPS over HTTP', function() {
  it('should finish without error', function(done) {
    var serverPort = 3004;
    var proxyPort = 3005;
    var poolSize = 3;
    var N = 10;
    var serverConnect = 0;
    var proxyConnect = 0;
    var clientConnect = 0;
    var agent;

    var server = https.createServer({
      key: readPem('agent2-key'),
      cert: readPem('agent2-cert'),
      ca: [readPem('ca1-cert')], // ca for agent1
      requestCert: true,
      rejectUnauthorized: true
    }, function(req, res) {
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
        agent = tunnel.httpsOverHttp({
          maxSockets: poolSize,
          // client certification for origin server
          key: readPem('agent1-key'),
          cert: readPem('agent1-cert'),
          proxy: {
            port: proxyPort
          }
        });

        for (var i = 0; i < N; ++i) {
          (function(i) {
            var req = https.get({
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

      var name = 'localhost:' + serverPort;
      agent.sockets.should.not.have.ownProperty(name);
      agent.requests.should.not.have.ownProperty(name);

      done();
    });
  });
});
