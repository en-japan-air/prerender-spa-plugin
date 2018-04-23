var Hapi = require('hapi')
var Inert = require('inert')
var Path = require('path')
var prerender = require('prerender-chrome-headless')
var PortFinder = require('portfinder')

module.exports = function (staticDir, route, options, callback) {
	function serveAndPrerenderRoute() {
		PortFinder.getPort(function (error, port) {
			if (error) throw error

			var Server = new Hapi.Server({
				connections: {
					routes: {
						files: {
							relativeTo: staticDir
						}
					}
				}
			})

			Server.connection({ port: port })

			Server.register(Inert, function (error) {
				if (error) throw error
				var indexPath = options.indexPath ? options.indexPath : Path.join(staticDir, 'index.html')

				Server.route({
					method: 'GET',
					path: route,
					handler: function (request, reply) {
						reply.file(
							indexPath
						)
					}
				})

				Server.route({
					method: 'GET',
					path: '/{param*}',
					handler: {
						directory: {
							path: '.',
							redirectToSlash: true,
							index: true,
							showHidden: true
						}
					}
				})

				Server.start(function (error) {
					// If port is already bound, try again with another port
					if (error) return serveAndPrerenderRoute()

					var maxAttempts = options.maxAttempts || 5
					var attemptsSoFar = 0
					const captureAfterTime = options.captureAfterTime || 100; // ms to wait after the page load event
					const ignoreJSErrors = options.ignoreJSErrors || false;

					function capturePage() {
						attemptsSoFar += 1

						prerender('http://localhost:' + port + route, {
							delayPageLoad: captureAfterTime,
							chromeFlags: ['--no-sandbox', '--disable-setuid-sandbox'].concat(options.chromeFlags || []),
							onPageError: function (msg) {
								// Retry if we haven't reached the max number of capture attempts
								if (attemptsSoFar <= maxAttempts) {
									return capturePage()
								} else {
									if (msg && !ignoreJSErrors) throw error
								}
							}
						})
							.then(function (html) {
								callback(null, html)
								Server.stop()
							})
							.catch(function (error) {
								callback(error)
								Server.stop()
							})
					}

					capturePage()
				})
			})
		})
	}

	serveAndPrerenderRoute()
}
