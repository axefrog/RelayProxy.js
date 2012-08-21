/*
  relay-proxy.js: http proxy for node.js

  Copyright (c) 2010 Nathan Ridley

  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
  WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

var httpProxy = require('http-proxy'),
	net = require('net'),
	http = require('http'),
	util = require('util');

function RelayProxy() {

	var authHandler = function defaultAuthHandler(req, username, password, callback) {
		// @arg 1: error object
		// @arg 2: true if authorized, otherwise false
		callback(null, true);
	}

	var proxySelector = function defaultProxySelector(req, username, callback) {
		// @arg 1: error object
		// @arg 2: a proxy options object, or false to decline the request,
		//         or null to forward directly to the remote host
		// options: {
		//     host: 'x.x.x.x',
		//     port: 9999,
		//     username: 'username', // optional
		//     password: 'password'  // optional
		// }
		callback(null, null);
	}

	function getAuth(req) {
		
		var authHeader = req.headers['proxy-authorization'];
		if(authHeader) {
			var authMatch = (new Buffer(authHeader.substr(6), 'base64')).toString().match(/^([^:]*):(.*)$/);
			if(authMatch && authMatch[1] && authMatch[2]) {
				return {
					username: authMatch[1],
					password: authMatch[2]
				};
			}
		}
	 	return null;
	}

	function createAuthHeader(username, password) {
		return 'Basic ' + new Buffer(username + ':' + password).toString('base64');
	}

	function getRemoteProxy(req, callback) {

		var auth = getAuth(req) || {};
		authHandler(req, auth.username, auth.password, function onAuthHandlerCallback(err, authorized) {

			if(!authorized) {
			 	req.connection.end('HTTP/1.0 407 Proxy authentication required\r\nProxy-authenticate: Basic realm="remotehost"\r\n\r\n');
			 	callback(new Error('Proxy authorization not supplied (407 response sent)'))
			 	return;
			};

			proxySelector(req, auth.username, function onProxySelectorCallback(err, options) {

				if(options === false) {
				 	req.connection.end('HTTP/1.0 429 Too Many Requests\r\n\r\nNo proxy available to service request');
				 	callback(new Error('No remote proxies available (429 response sent)'));
					return;
				}

				callback(null, options);
			});

		});
	}

	function onHttpRequest(req, res, proxy) {

		var buffer = httpProxy.buffer(req);

		console.log('HTTP --> ' + req.url);

		getRemoteProxy(req, function(err, remoteProxy) {

			if(err) {
				console.log(err.message);
				return;
			}

			if(!remoteProxy) {
				var parts = req.headers.host.split(':');
				proxy.proxyRequest(req, res, {
					host: parts[0],
					port: parts[1] || 80
				});
				return;
			}

			req.path = req.url;
			if(remoteProxy.username && remoteProxy.password)
				req.headers['proxy-authorization'] = createAuthHeader(remoteProxy.username, remoteProxy.password);
			var options = {
				host: remoteProxy.host,
				port: remoteProxy.port,
				buffer: buffer
			}
			proxy.proxyRequest(req, res, options);
		});
	}

	function onHttpsRequest(req, socket, head) {

		console.log('HTTPS --> ' + req.url);

		getRemoteProxy(req, function(err, remoteProxy) {

			if(err) {
				console.log(err.message);
				return;
			}

			if(!remoteProxy) {
				var parts = req.url.split(':');
				var conn = net.connect(parts[1], parts[0], function() {
					socket.write('HTTP/1.1 200 OK\r\n\r\n');
					conn.pipe(socket);
					socket.pipe(conn);
				});
				return;
			}

			var conn = net.connect(remoteProxy.port, remoteProxy.host, function() {
				
				var headers
					= 'CONNECT ' + req.url + ' HTTP/1.1\r\n'
					+ 'Proxy-Authorization: ' + createAuthHeader(remoteProxy.username, remoteProxy.password) + '\r\n\r\n';
				conn.write(headers);

			}).once('data', function(buffer) {

				var ok = /^HTTP\/1.[01] 200 /i.test(buffer.toString('utf8'));
				if(!ok)
					socket.end('HTTP/1.1 401 Unauthorized\r\n\r\nUpstream proxy rejected the request');
				else {
					socket.write('HTTP/1.1 200 OK\r\n\r\n');
					socket.pipe(conn);
					conn.pipe(socket);
				}
			});
		})
	}

	this.authorize = function authorize(handler) {
		authHandler = handler;
	}

	this.selectForwardProxy = function selectForwardProxy(handler) {
		proxySelector = handler;
	}

	this.listen = function listen(port) {
		port || (port = 3333);
		this.server = httpProxy
			.createServer(onHttpRequest)
			.on('connect', onHttpsRequest)
			.listen(port);

		console.log('Proxy server now listening on port ' + port + '.');
	}
}

module.exports = RelayProxy;