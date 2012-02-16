# node-tunnel - HTTP/HTTPS Agents for tunneling proxies

## Example

    var tunnel = require('tunnel');

    var myAgent = tunnel.httpsOverHttp({
      proxy: {
        host: 'localhost',
        port: 3128
      }
    });

    var req = https.request({
      host: 'example.com',
      port: 443,
      agent: myAgent
    });

## Installation

    $ npm install tunnel

## Usages

### HTTP over HTTP tunneling

    var myAgent = tunnel.httpOverHttp({
      maxSockets: poolSize, // Defaults to 5

      proxy: { // Proxy settings
        host: proxyHost, // Defaults to 'localhost'
        port: proxyPort, // Defaults to 80

        // Basic authorization for proxy server if necessary
        proxyAuth: 'user:password',

        // Header fields for proxy server if necessary
        headers: {
          'User-Agent': 'Node'
        }
      }
    });

    var req = http.request({
      host: 'example.com',
      port: 80,
      agent: myAgent
    });

### HTTPS over HTTP tunneling

    var myAgent = tunnel.httpsOverHttp({
      maxSockets: poolSize, // Defaults to 5

      // CA for origin server if necessary
      ca: [ fs.readFileSync('origin-server-ca.pem')],

      // Client certification for origin server if necessary
      key: fs.readFileSync('origin-server-key.pem'),
      cert: fs.readFileSync('origin-server-cert.pem'),

      proxy: { // Proxy settings
        host: proxyHost, // Defaults to 'localhost'
        port: proxyPort, // Defaults to 80

        // Basic authorization for proxy server if necessary
        proxyAuth: 'user:password',

        // Header fields for proxy server if necessary
        headers: {
          'User-Agent': 'Node'
        },
      }
    });

    var req = https.request({
      host: 'example.com',
      port: 443,
      agent: myAgent
    });

### HTTP over HTTPS tunneling

    var myAgent = tunnel.httpOverHttps({
      maxSockets: poolSize, // Defaults to 5

      proxy: { // Proxy settings
        host: proxyHost, // Defaults to 'localhost'
        port: proxyPort, // Defaults to 443

        // Basic authorization for proxy server if necessary
        proxyAuth: 'user:password',

        // Header fields for proxy server if necessary
        headers: {
          'User-Agent': 'Node'
        },

        // CA for proxy server if necessary
        ca: [ fs.readFileSync('origin-server-ca.pem')],

        // Client certification for proxy server if necessary
        key: fs.readFileSync('origin-server-key.pem'),
        cert: fs.readFileSync('origin-server-cert.pem'),
      }
    });

    var req = http.request({
      host: 'example.com',
      port: 80,
      agent: myAgent
    });

### HTTPS over HTTPS tunneling

    var myAgent = tunnel.httpsOverHttps({
      maxSockets: poolSize, // Defaults to 5

      // CA for origin server if necessary
      ca: [ fs.readFileSync('origin-server-ca.pem')],

      // Client certification for origin server if necessary
      key: fs.readFileSync('origin-server-key.pem'),
      cert: fs.readFileSync('origin-server-cert.pem'),

      proxy: { // Proxy settings
        host: proxyHost, // Defaults to 'localhost'
        port: proxyPort, // Defaults to 443

        // Basic authorization for proxy server if necessary
        proxyAuth: 'user:password',

        // Header fields for proxy server if necessary
        headers: {
          'User-Agent': 'Node'
        }

        // CA for proxy server if necessary
        ca: [ fs.readFileSync('origin-server-ca.pem')],

        // Client certification for proxy server if necessary
        key: fs.readFileSync('origin-server-key.pem'),
        cert: fs.readFileSync('origin-server-cert.pem'),
      }
    });

    var req = https.request({
      host: 'example.com',
      port: 443,
      agent: myAgent
    });
