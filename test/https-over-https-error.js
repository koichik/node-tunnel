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

describe('HTTPS over HTTPS authentication failed', function() {
  it('should finish without error', function(done) {
    var serverPort = 3008;
    var proxyPort = 3009;
    var serverConnect = 0;
    var proxyConnect = 0;
    var clientConnect = 0;
    var clientError = 0;
    
    var server = https.createServer({
      key: readPem('agent2-key'),
      cert: readPem('agent2-cert'),
      ca: [ readPem('ca1-cert') ], // ca for agent1
      requestCert: true,
      rejectUnauthorized: true
    }, function(req, res) {
      ++serverConnect;
      res.writeHead(200);
      res.end('Hello, ' + serverConnect);
    });
    server.listen(serverPort, function() {
      var proxy = https.createServer({
        key: readPem('agent4-key'),
        cert: readPem('agent4-cert'),
        ca: [ readPem('ca2-cert') ], // ca for agent3
        requestCert: true,
        rejectUnauthorized: true
      }, function(req, res) {
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
          // workaround, see #2524
          serverSocket.on('end', function() {
            clientSocket.end();
          });
        });
      });
      proxy.listen(proxyPort, function() {
        function doRequest(options) {
          var agent = tunnel.httpsOverHttps(options);
          var req = https.get({
            port: serverPort,
            agent: agent
          }, function(res) {
            ++clientConnect;
            req.emit('finish');
          });
          req.on('error', function(err) {
            ++clientError;
            req.emit('finish');
          });
          req.on('finish', function() {
            if (clientConnect + clientError === 4) {
              proxy.close();
              server.close();
            }
          });
        }
    
        doRequest({ // invalid
          maxSockets: 1,
          // no certificate for origin server
          proxy: {
            port: proxyPort
            // no certificate for proxy
          }
        });
        doRequest({ // invalid
          maxSockets: 1,
          // client certification for origin server
          key: readPem('agent1-key'),
          cert: readPem('agent1-cert'),
          proxy: {
            port: proxyPort
            // no certificate for proxy
          }
        });
        doRequest({ // invalid
          maxSockets: 1,
          // no certificate for origin server
          proxy: {
            port: proxyPort,
            // client certification for proxy
            key: readPem('agent3-key'),
            cert: readPem('agent3-cert')
          }
        });
        doRequest({ // valid
          maxSockets: 1,
          // client certification for origin server
          key: readPem('agent1-key'),
          cert: readPem('agent1-cert'),
          proxy: {
            port: proxyPort,
            // client certification for proxy
            key: readPem('agent3-key'),
            cert: readPem('agent3-cert')
          }
        });
      });
    });
    
    server.on('close', function() {
      serverConnect.should.equal(1);
      proxyConnect.should.equal(2);
      clientConnect.should.equal(1);
      clientError.should.equal(3);
  
      done();
    });
  });
});
