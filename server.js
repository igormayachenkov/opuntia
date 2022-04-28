"use strict"
const url	 = require("url");
const ApiError = require("./error.js").ApiError;

module.exports = class {

	constructor(router, config){
		// Verify router
		if(!router) throw 'Error: parameter "router" is undefined';
		this.router = router;
		// Verify config
		if(!config) config = {};
		this.config = {};
		for(let key in config)
			this.config[key.toUpperCase()] = config[key]; // translate to upper case for internal use
		if(!this.config.PROTOCOL) this.config.PROTOCOL = 'http:';
		switch(this.config.PROTOCOL){
			case 'http:' : 
				if(!this.config.PORT) this.config.PORT = 8080; 
				break;
			case 'https:': 
				if(!this.config.PORT) this.config.PORT = 443;  
				break;
			default: 
				throw 'Error: the config.PROTOCOL value "'+this.config.PROTOCOL+'" is incorrect';
		}
	}

	//-------------------------------------------------------------------------------------------------
	// ROUTER NODE fields
	// node: {
	// 		[ _* ] : <any> - parameter
	//		[ http method name ] : <Object> - handler
	// 		[ * (not started from '_' and not http method name) ] : <Object> - child node
	// }
	// handler: {
	//		action : <function> - function to run on request
	//		[ * (not 'action') ]  : - parameter
	// }

	//-------------------------------------------------------------------------------------------------
	// FILL ROUTE INFO (r-object) BY NODEs TREE (server.router)
	// Tries to go to the next level in the node tree before stop
	// Stops when is not possible to go to the next level
	// The most appropriate node will be found
	// r.node - will not be null
	fillRouteInfo(request){
		// CREATE PATH object contained an array of segments
		var urlParsed = url.parse(request.url, true);
		var path = {
			src:		decodeURI(urlParsed.pathname),
			segments: 	[],
			level:		0
		}
		path.src.split('/').forEach(function(item){
			var s = item.trim();
			if(s.length)
				path.segments.push(s);
		});

		// Create r-object
		var r = {
			server	:	this,
			time	:	new Date().getTime(),
			path	:	path,
			urlQuery:	urlParsed.query,
			session	: 	null,
			authLevel:	0 //auth applied after this level
		}

		// Search node for the path
		var node = this.router;
		while(true){
			//var left = "";for(var i=0;i<r.path.level;i++) left+="    ";
			//console.log(left, r.path.level, r.path.segments, node?'[node]':'---');

			//---------------------------------------------
			// COPY & APPLY PARAMETERS
			// Copy parameters
			for(const k in node){
				if(k.startsWith("_"))
					r[k] = node[k];
			}
			// "auth" authentication object
			// - keep it till the action
			if(node._auth){
				r.authLevel = r.path.level; // remember auth level
			}

			//---------------------------------------------
			// TRY GO TO NEXT LEVEL in the nodes tree
			var key = r.path.segments[r.path.level];//the next segment (child key)
			if(key && !key.startsWith("$") && !key.startsWith("_") && !key.startsWith("h_")){
				//console.log(left, "key: ",key);
				// Try to get child by the key
				var child = node[key];
				if(child){
					r.path.level++;// Increase path level
					node = child;
					continue;
				}
			}

			// Stop here
			r.node = node;
			break;
		}

		return r;
	}

	//-------------------------------------------------------------------------------------------------
	// WS: WEB SOCKET SERVER
	createWSS(){
		if(!this.WebSocket)
			this.WebSocket = require('ws'); 

		const wss = new this.WebSocket.Server({ noServer: true });

		wss.on('connection', function connection(ws) {
			if(ws.r && ws.r.node.h_ws)
				ws.r.node.h_ws.onConnection(ws);
		});

		return wss;
	}

	//-------------------------------------------------------------------------------------------------
	// WS: MAIN UPGRADE HANDLER
	onUpgrade(request, socket, head){
		// ROUTE
		var r = this.fillRouteInfo(request);
		r.request  = request;
		//r.response = response;

		console.log('onUpgrade', r.path.segments);

		// Check websocket server existance
		if(!r.wss){
			console.log('The node route (r-object) does not contain wss parameter');
			socket.destroy();
			return;
		}

		// Check node websocket handler
		var handler = r.node.h_ws;
		if(!handler){
			console.log('The node does not contain ws handler');
			socket.destroy();
			return;
		}

		// Connect socket
		var connectSocket = function(){
			r.wss.handleUpgrade(request, socket, head, function done(ws) {
				ws.r = r; // attach the route to the socket
				r.wss.emit('connection', ws, request);
			});
		}

		// Check authorization if exists and do action
		// "skipAuth" - skip autherization for the action
		if(r._auth)
			r._auth.checkAuthorized(r, connectSocket);
		else
			connectSocket();
	}

	//-------------------------------------------------------------------------------------------------
	// MAIN REQUEST HANDLER
	onRequest(request, response) {
		//--------------------------------------------------
		// ROUTE
		// the goal - to find the appropriate action (leaf)
		var r = this.fillRouteInfo(request);
		r.request  = request;
		r.response = response;

		//console.log(new Date().toISOString() + " REQUEST: "+request.connection.remoteAddress.replace(/^.*:/, '')+" "+request.method+" "+request.url);
		//console.log("=== " + util.inspect(request.headers, false, null));
		//console.log("=== " + util.inspect(request.socket, false, null));
		//console.log("cookie: "+request.headers.cookie);
		//console.log("origin: "+request.headers.origin);
		//console.log("time: "+new Date().getTime());
		
		response.statusCode = 200;

		//---------------------------------------------------
		// CORS
		if(request.headers.origin){
			response.setHeader(	"Access-Control-Allow-Origin", request.headers.origin); // Mirrow the request origin => Allow any origin (not "*" to allow cookie)
			response.setHeader(	"Access-Control-Allow-Credentials", "true"); // allow request with cookie
		}
		// Expose some data to the script
		response.setHeader(	"Access-Control-Expose-Headers", "Content-Length");
		// OPTIONS ?
		if(r.request.method=="OPTIONS"){
			// Allowed methods list
			response.setHeader(	"Access-Control-Allow-Methods", "GET,POST,OPTIONS");
			// Allow all requested headers
			let requestedHeaders = request.headers["access-control-request-headers"];
			if(requestedHeaders)
				response.setHeader(	"Access-Control-Allow-Headers", requestedHeaders);
			// Prevent next options call for 1 hour
			response.setHeader(	"Access-Control-Max-Age", "3600");
			// Answer without body
			r.server.endWithSuccess(r, null);
			return;
		}

		//---------------------------------------------
		// CALL HTTP HANDLER for the method
		const handler = r.node["h_"+r.request.method.toLowerCase()];
		if(handler){
			// Check the correct path usage: action must be the last leaf (+ parameters)
			// If the tail of the path is used as parameters for the action
			// "pathParams" path parameters count
			var pCount = handler.pathParams?handler.pathParams:0;
			if(pCount>=0 && (r.path.level != r.path.segments.length - pCount)){
				r.server.endWithErrorCode(r,404,"resource "+r.path.src+" not found"); // incorrect path
				return;
			}

			// Call the handler in try-catch wrapper
			this.callHandler(r,handler);
			return;
		}
		
		// Not finished yet? -> wrong method
		r.server.endWithError(r,"method "+r.request.method+" not supported for path "+r.path.src);
	}

	//-------------------------------------------------------------------------------------------------
	// HANDLER WRAPPER
	// Common error hanling is here
	async callHandler(r, handler){
		try{
			// Check authorization if exists and do action
			// "skipAuth" - skip autherization for the action
			if(r._auth && !handler.skipAuth){
                if(handler.checkAuthorized)
                    await handler.checkAuthorized(r) // special auth checker
                else                        
                    await r._auth.checkAuthorized(r) // common auth function
            }

			// RECEIVE BODY (if exists) 
			// "skipBody" - do not receive body before action call
			if(r.request.headers['content-length'] && !handler.skipBody){
                // Receive as Buffer
				await r.server.receivePOSTdata(r);                                
                // Convert to json 
                if(handler.requestBodyType=='json'){
                    try{
                        r.data = JSON.parse(r.data.toString('utf8'));
                    }catch(e){
                        throw "Can not parse the request data as JSON"
                    }
                }
            }
            
            // Set the response body type
            switch(handler.responseBodyType){
                case 'html': r.response.setHeader("Content-Type", "text/html"); break;
                case 'file': break; // must be set in the action
                case 'json':
                default:     r.response.setHeader("Content-Type", "application/json"); break;
            }

			// DO ACTION
			await handler.action(r);

		}catch(error){
			//console.log("ERROR: ",error);
			if(error instanceof ApiError){
				r.server.endWithErrorCode(r, error.code, error.message);
			}else if(error instanceof Error){
				r.server.endWithError(r, error.stack);
			}else{
				r.server.endWithError(r, error.toString());
			}
		}
	}


	//-------------------------------------------------------------------------------------------------
	// VERIFY NODEs
	verifyNode(level, key, node){
		// Log info
		var tab="   ";for(var i=0;i<level;i++)tab+="    ";
		console.log(tab, key);

		// Recurrent call
		for (const k in node) {
			// Comments
			if(k.startsWith("$")) continue;
			// Parameters
			if(k.startsWith("_")) continue;
			// HTTP methods
			if(k.startsWith("h_")) continue;
			// Children
			this.verifyNode(level+1, k, node[k]);
		}
	}

	//-------------------------------------------------------------------------------------------------
	// START SERVER
	// options : createServer(options) https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options
	start(options, onStart){
		// CREATE WEB SERVER
		if(this.config.PROTOCOL=="http:"){
			// HTTP
			var webServer = require("http").createServer(options);
		}else 
		if(this.config.PROTOCOL=="https:"){
			// HTTPS
			if(!options){
				// Load certificates from files
				const fs = require("fs");
				if(!this.config.HTTPS_KEY || !this.config.HTTPS_CRT) 
					throw 'Error: config.HTTPS_KEY or config.HTTPS_CRT is undefined';
				var options = {
					key:  fs.readFileSync(this.config.HTTPS_KEY), //'private-key.pem'),
					cert: fs.readFileSync(this.config.HTTPS_CRT)  //'certificate.pem')
				};
				if(this.config.HTTPS_CA)
					options.ca = fs.readFileSync(this.config.HTTPS_CA)
			}
			// Start server
			var webServer = require("https").createServer(options);
		}else{
			console.log("incorrect PROTOCOL value");
			return;
		}

		// SETUP LINKS
		this.webServer = webServer;
		//webServer.opuntiaServer = this;

		// SET HANDLERS
		webServer.on("request",this.onRequest.bind(this)); // regular request
		webServer.on("upgrade",this.onUpgrade.bind(this)); // upgrade request for WebSocket
			
		// START WEB SERVER
		webServer.listen(this.config.PORT, function(){this.onStart(onStart);}.bind(this));
	}

	listen(onStart){this.start(undefined, onStart);} // old variant

	onStart(onStart){
		try{
			var pkg = require(process.cwd()+'/package.json');
		}catch(e){}
		console.log("\n-----------------------------------------------------------");
		console.log("                 WEB API SERVER STARTED ");
		if(pkg){
		console.log("    NAME:              " + pkg.name);
		console.log("    VERSION:           " + pkg.version);
		console.log("    DESCRIPTION:       " + pkg.description);
		}
		console.log("    PROTOCOL:          " + this.config.PROTOCOL);
		console.log("    PORT:              " + this.config.PORT);
		// Verify & print the router nodes
		console.log("    ROUTER:            ");
		this.verifyNode(0, "/", this.router);
		console.log("\n-----------------------------------------------------------");

		// Run client's start function
		if(onStart)
			onStart();
	}

	//-------------------------------------------------------------------------------------------------
	// COMMON

	// Finish the response with the error
	endWithErrorCode(r, code, errorText){
		// r.response.writeHead(500,{
		// 	"Content-Type":"text/plain",
		// 	"Access-Control-Allow-Origin":"http://localhost"//"*"
		// });
		r.response.statusCode = code;
        r.response.setHeader( "Content-Type", "application/json")
		r.response.write(JSON.stringify({message:errorText}));
		r.response.end();	
		// Log result
		this.logResult(r, errorText);
	}

	// UNAUTHORIZED USER - NORMAL CASE
	endUnauthorized(r, errorText){
		this.endWithErrorCode(r,401,errorText)
	}
	// COMMON ERROR 
	endWithError(r, errorText){
		this.endWithErrorCode(r,404,errorText)
	}

	// Finish the response with the success
	endWithSuccess(r, json){
		this.endWithSuccessBinary(r, json ? JSON.stringify(json) : null);
	}

	// Finish the response with the success
	endWithSuccessBinary(r, body){
		// Write body 
		if(body){
			r.response.write(body);
			r.body_length = body.length;
		}else
			r.body_length = 0;
		
		// End
		r.response.end();

		// Log result
		this.logResult(r,"");
	}

	// Redirect Permanently
	redirectPermanently(r, url){
		r.response.writeHead(
			301,// (Moved Permanently)
			{ "Location": url }
		);
		r.response.end();	

		// Log result
		if(r.response) this.logResult(r, "redirected to "+url);
	}

	// RECEIVE POST DATA AS JSON
	// fill the next field in r object: 
	//		- data			
	// 		- data_length
	async receivePOSTdata(r){
		return new Promise(function(resolve,reject){
			// VERIFY content-length
			var contentLength = r.request.headers['content-length'];
			if(!contentLength)
				throw "Content-Length is undefined";
				contentLength = parseInt(contentLength);
			if(r.server.config.REQUEST_BODY_LIMIT && r.server.config.REQUEST_BODY_LIMIT<contentLength)
				throw "The request body limit is exceeded";


            // LOAD request DATA as Buffer
            const chunks = []
            r.request.addListener("data", function(chunk) {
                // Chunk is a Buffer https://nodejs.org/api/buffer.html
                chunks.push(chunk)
            });
            
            r.request.addListener("end", function() {
                r.data = Buffer.concat(chunks)
                r.data_length = r.data.length // received data length 
                // Verify content length
                if(contentLength!=r.data.length) 
                    reject("content-length "+contentLength+
                    " does not equal received data length "+r.data.length); // throw here crashes the server!
                // SUCCESS
                resolve();
            });
		});
	}

	// Log the request result
	logResult(r, error){
		// Fill data object
		var d = {
			time:		r.time,
			ip:			r.request.connection.remoteAddress ? //The string representation of the remote IP address. For example, '74.125.127.100' or '2001:4860:a005::68'. Value may be undefined if the socket is destroyed (for example, if the client disconnected).
						r.request.connection.remoteAddress.replace(/^.*:/, '') : "?" ,
			method:		r.request.method,
			path:		r.path.src,
			length_in:	r.data_length?r.data_length:0,
			length_out: r.body_length?r.body_length:0,
			duration:	new Date().getTime() - r.time,
			status:		r.response.statusCode
		};
		if(error) d.error = error;
		// Log to console
		console.log(
			new Date(d.time).toISOString()+" "
			+ d.ip +" " 
			+ d.method+" "
			+ d.path+" "
			+ d.length_in+"b "
			+ "=> "+d.duration+"ms "
			+ d.status+" "
			+ d.length_out+"b "
			+ error
		);
		return d;
	}

	//--------------------------------------------------------------------
	// ROUTER
	// method get
	static getRouterHandler(){
		return {
			title:"Router",
			descr:"Get router excluding action functions and auth objects",
			action: function(r){
				// Copy node fields
				var writeNode = function(node, target){
					for (const k in node) {
						// Comments
						if(k.startsWith('$')){
							target[k] = node[k].toString();
							continue;
						}
						// Parameters
						if(k.startsWith('_')){
							target[k] = node[k].toString();
							continue;
						}

						// HTTP methods
						if(k.startsWith("h_")){
							target[k] = {};
							writeHandler(node[k], target[k]);
							continue;
						}

						// Children - Recurrent call
						target[k] = {}; // create child
						writeNode(node[k], target[k]);
					}
				}
				var writeHandler = function(handler, target){
					for (const k in handler) {
						if(k=="action") continue;
						target[k] = handler[k];
					}
				}

				var tree = {};
				writeNode(r.server.router, tree);
				r.server.endWithSuccess(r, tree);
			}
		}
	}
}
	


