RelayProxy.js
=============

RelayProxy.js implements a forward proxy server in node.js with support for:

- HTTP and HTTPS requests (SOCKS5 support coming in a future version)
- Basic HTTP authorization
- Forwarding to a remote proxy (with support for remote authorization),
  selectable at run-time based on incoming header and credentials

I wrote this server as I had a need for a private authenticated proxy server
that would forward the request through a remote private proxy. The idea was to
manage the amount of access a connecting client had to any given address and to
manage which remote proxies (taken from a pool of rented third-party private
proxies, each requiring authorization) were allocated to a given client,
rotating those proxies depending on usage.

The server is very simple to use:

## Usage
### Basic usage

At its simplest, the following will instantiate a non-authenticating transparent
proxy that forwards requests to the target url without relaying the request
through a third-party proxy:

    var RelayProxy = require('./path/to/relay-proxy');
    var server = new RelayProxy();
    server.listen(3333);

### Local authorization

To authorize access to your proxy, provide a handler function:

    var RelayProxy = require('./path/to/relay-proxy');
    var server = new RelayProxy();
    
    server.authorize(function(req, username, password, callback) {
        // replace with code to verify username and password
        var isLoginCorrect = true;
        
        // call the supplied callback function to continue the request
        callback(null, isLoginCorrect);
    });
    
    server.listen(3333);

### Using a remote proxy

To forward requests via a third-party proxy, provide a handler function:

    var RelayProxy = require('./path/to/relay-proxy');
    var server = new RelayProxy();
    
    server.selectForwardProxy(function(req, username, callback) {
        
        var proxy = {
            host: '1.2.3.4',
            port: 31337,
            username: 'jimbob', // only supply a username and password if
            password: 'mcgee'   // the remote proxy requires authorization
        };
        
        // the callback's second argument can be one of three values:
        // null:  no remote proxy - forward directly to the requested url
        // false: decline to forward the request (http 407 sent back to client)
        // proxy: proxy options as specified in the above sample

        callback(null, proxy);
    });
    
    server.listen(3333);

## Dependencies

RelayProxy has a dependency on [node-http-proxy][1], by the good folks at
[Nodejitsu][2]. Thankfully, it's available in the npm registry.

    npm install http-proxy

[1]: https://github.com/nodejitsu/node-http-proxy/
[2]: http://www.nodejitsu.com/