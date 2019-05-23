"use strict"
const fs 		= require("fs");
const url		= require("url");
const WebSocket = require('ws'); 

var server = this;

// Config
exports.config = null;//must be set
exports.router = null;//must be set

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
var fillRouteInfo = function(request){
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
		server	:	server,
		time	:	new Date().getTime(),
		path	:	path,
		urlQuery:	urlParsed.query,
		session	: 	null,
		authLevel:	0 //auth applied after this level
	}

	// Search node for the path
	var node = server.router;
	while(true){
		//var left = "";for(var i=0;i<r.path.level;i++) left+="    ";
		//console.log(left, r.path.level, r.path.segments, node?'[node]':'---');

		//---------------------------------------------
		// COPY & APPLY PARAMETERS
		// Copy parameters without prefix 
		for(const k in node){
			if(k.startsWith("_"))
				r[k.substr(1)] = node[k];
		}
		// "auth" authentication object
		// - keep it till the action
		if(node._auth){
			//r.auth = node._auth;
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
exports.createWSS = function(){
	const wss = new WebSocket.Server({ noServer: true });

	wss.on('connection', function connection(ws) {
		if(ws.r && ws.r.node.h_ws)
			ws.r.node.h_ws.onConnection(ws);
	});

	return wss;
}

//-------------------------------------------------------------------------------------------------
// WS: MAIN UPGRADE HANDLER
var onUpgrade = function(request, socket, head){
	// ROUTE
	var r = fillRouteInfo(request);
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
	if(r.auth)
		r.auth.checkAuthorized(r, connectSocket);
	else
		connectSocket();
}

//-------------------------------------------------------------------------------------------------
// MAIN REQUEST HANDLER
var onRequest = function(request, response) {
	//--------------------------------------------------
	// ROUTE
	// the goal - to find the appropriate action (leaf)
	var r = fillRouteInfo(request);
	r.request  = request;
	r.response = response;

	//console.log(new Date().toISOString() + " REQUEST: "+request.connection.remoteAddress.replace(/^.*:/, '')+" "+request.method+" "+request.url);
	//console.log("=== " + util.inspect(request.headers, false, null));
	//console.log("=== " + util.inspect(request.socket, false, null));
	//console.log("cookie: "+request.headers.cookie);
	//console.log("origin: "+request.headers.origin);
	//console.log("time: "+new Date().getTime());
	
	response.statusCode = 200;
	response.setHeader(	"Content-Type"						, "application/json");
	if(request.headers.origin)
	response.setHeader(	"Access-Control-Allow-Origin"		, request.headers.origin); //"*",
	response.setHeader(	"Access-Control-Allow-Credentials"	, true);
	response.setHeader(	"Access-Control-Allow-Methods"		, "GET,POST,OPTIONS");
	response.setHeader(	"Access-Control-Allow-Headers"		, "Session, Origin, X-Requested-With, Content-Type, Accept, Version");

	// OPTIONS ?
	if(r.request.method=="OPTIONS"){
		r.server.endWithSuccess(r, null);
		return;
	}

	//---------------------------------------------
	// CALL HTTP HANDLER
	const handler = r.node["h_"+r.request.method.toLowerCase()];

	// "action" - the request handler function
	// Is the node Action? -> try to do it
	if(handler){
		// Check the correct path usage: action must be the last leaf (+ parameters)
		// If the tail of the path is used as parameters for the action
		// "pathParams" path parameters count
		var pCount = handler.pathParams?handler.pathParams:0;
		if(pCount>=0 && (r.path.level != r.path.segments.length - pCount)){
			r.server.endNotFound(r); // incorrect path
			return;
		}

		// Define the next step as a function
		var doAction = function(){
			// RECEIVE BODY (if exists) & DO ACTION
			// "skipBody" - do not receive body before action call
			if(r.request.headers['content-length'] && !handler.skipBody)
				r.server.receivePOSTdata(r, handler.action);
			else
				handler.action(r);
		}

		// Check authorization if exists and do action
		// "skipAuth" - skip autherization for the action
		if(r.auth && !handler.skipAuth)
			r.auth.checkAuthorized(r,doAction);
		else
			doAction();

		return;
	}
	
	// Not finished yet? -> wrong method
	r.server.endWithError(r,"method "+r.request.method+" not supported for path "+r.path.src);
}

//-------------------------------------------------------------------------------------------------
// VERIFY NODEs
var verifyNode = function(level, key, node){
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
		verifyNode(level+1, k, node[k]);
	}
}

//-------------------------------------------------------------------------------------------------
// START SERVER
this.listen = function(onStart){
	// CREATE SERVER
	if(server.config.PROTOCOL=="http:"){
		// HTTP
		var theServer = require("http").createServer();
	}else 
	if(server.config.PROTOCOL=="https:"){
		// HTTPS
		var theServer = require("https").createServer(
			{
				key:  fs.readFileSync(server.config.KEY), //'private-key.pem'),
				cert: fs.readFileSync(server.config.CERT) //'certificate.pem')
			}
		);
	}else{
		console.log("incorrect PROTOCOL value");
		return;
	}

	// SET HANDLERS
	theServer.on("request",onRequest); // regular request
	theServer.on("upgrade",onUpgrade); // upgrade request for WebSocket
		
	// START SERVER
	theServer.listen(server.config.PORT, function(){
		console.log("\n-----------------------------------------------------------");
		console.log("                 REST API server started ");
		console.log("    VERSION:           " + server.config.VERSION);
		console.log("    PROTOCOL:          " + server.config.PROTOCOL);
		console.log("    PORT:              " + server.config.PORT);
		//server.setTimeout(120000);
		//console.log("    timeout:           " + theServer.timeout);
		//console.log("    keepAliveTimeout:  " + theServer.keepAliveTimeout);

		// Verify nodes
		verifyNode(0, "/", server.router);
		console.log("\n-----------------------------------------------------------");

		// Run client's start function
		if(onStart)
			onStart();
		}
	);
}

//-------------------------------------------------------------------------------------------------
// COMMON
var crypto = require('crypto');

// Finish the response with the error
exports.endWithErrorCode = function(r, code, error){
	var response = r.response;
	if(!response)response = r;// old format

	response.statusCode = code;
	response.write(error);
	response.end();	

	// Log result
	if(r.response) logResult(r,error);
}

// UNAUTHORIZED USER - NORMAL CASE
exports.endUnauthorized = function(r, msg){
	r.response.statusCode = 401;
	r.response.write(msg);
	r.response.end();	
	// Log result
	logResult(r, msg);
}

// COMMON ERROR 
exports.endWithError = function(r, error){
	var response = r.response;
	if(!response)response = r;// old format
	
	response.statusCode = 404;
	/*response.writeHead(500,{
		"Content-Type":"text/plain",
		"Access-Control-Allow-Origin":"http://localhost"//"*"
	});*/
	response.write(error);
	response.end();	

	// Log result
	if(r.response) logResult(r,error);
}

exports.endNotFound = function(r){
	this.endWithError(r, "resource "+r.path.src+" not found");
}

// Finish the response with the success
exports.endWithSuccess = function(r, json){
	r.server.endWithSuccessBinary(r, json ? JSON.stringify(json) : null);
}

// Finish the response with the success
exports.endWithSuccessBinary = function(r, body){
	// Write body 
	if(body){
		r.response.write(body);
		r.body_length = body.length;
	}else
		r.body_length = 0;
	
	// End
	r.response.end();

	// Log result
	if(r.response) logResult(r,"");
}

// RECEIVE POST DATA AS JSON
// fill the next field in r object: 
//		- data
// 		- data_length
exports.receivePOSTdata = function(r, callback){

	// VERIFY content-type & content-length
	var contentType   = r.request.headers['content-type'];
	var contentLength = r.request.headers['content-length'];
	//console.log("    POST content-type: "+contentType + '   content-length:'+contentLength);
	if(!contentType){
		this.endWithError(r,"Content-Type is undefined");  // TODO: this. WILL RAISE AN EXCEPTON!!!
		return;
	}
	if(!contentLength){
		this.endWithError(r,"Content-Length is undefined");
		return;
	}
	contentLength = parseInt(contentLength);
	if(contentType.search('application/x-www-form-urlencoded')<0){
		this.endWithError(r,"Content-Type is unsupported");
		return;
	}
	
	// LOAD request DATA
	var data = "";
	var length = 0;
	r.request.addListener("data", function(chunk) {
		//console.log("    "+new Date().toISOString() +typeof chunk:"+(typeof chunk)+"   chunk.length:"+chunk.length);
		//console.log("        "+new Date().toISOString() + "   chunk.length: "+chunk.length);
		data 	+= chunk;
		length	+= chunk.length;
	});
	
	r.request.addListener("end", function() {
		// Parse data
		try{
			r.data_length = length;
			r.data = JSON.parse(data);
		}catch(e){
			this.endWithError(r,"JSON parser error");
			return;
		}

		// DO ACTION
		callback(r);

	});
}

// Log the request result
var logResult = function(r, error){
	// Fill data object
	var d = {
		time:		r.time,
		user:		r.session?r.session.user_id:0,
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
		+ d.user +" "
		+ d.ip +" " 
		+ d.method+" "
		+ d.path+" "
		+ d.length_in+"b "
		+ "=> "+d.duration+"ms "
		+ d.status+" "
		+ d.length_out+"b "
		+ error
	);
	// Log to the database if exists 
	if(r.database){
		r.database.collection("logs").insertOne(d);
	}
}

//------------------------------------------------------------
// UPDATE/INSERT WHOLE DOCUMENT
// The document is cheated offline on the client
// So ID must be fefined and be GUID
this.document_update = function(collection, r, then){
	var doc = r.data;
	if(!doc){r.server.endWithError(r,"data is undefined"); return;}
	// Verify doc id
	if(!doc.id){r.server.endWithError(r,"id is undefined");return;}
	// Set modified stamps
	doc._mt = new Date().getTime();		
	doc._mu = r.session.user_id;		
	// Update/insert
	r.database.collection(collection).updateOne( { id : doc.id }, doc, { upsert : true }, function(err,commandResult) {
		if(err)	{r.server.endWithError(r,"Database error in collection.updateOne() "+err); return;}
		// Go next or send OK
		if(then){
			then();
		}else{
			var result = commandResult.result; // !!! see CommandResult
			result._mt = doc._mt;
			r.server.endWithSuccess(r, result);
		}
	});
}

// MODIFY - UPDATE DOCUMENT FIELDS (not insert)
// data format: {id:xxx, $set:{}, $unset:{})
this.document_modify = function(collection, r){
	if(!r.data){r.server.endWithError(r,"data is undefined"); return;}
	if(!r.data.$set && !r.data.$unset){r.server.endWithError(r,"empty request: $set or $unset must be defined"); return;}
	// Verify $unset
	if(r.data.$unset){
		if("id" in r.data.$unset){r.server.endWithError(r,"'id' field can't be unset"); return;}
		for(var key in r.data.$unset){
			if(key.charAt(0)=='_' && key.length==3){r.server.endWithError(r,"the internal server fields '_xx' can't be unset"); return;}
		}
	}
	// Verify and remove doc id
	var id = r.data.id;
	if(!id){r.server.endWithError(r,"id is undefined");return;}
	delete r.data.id;
	// Set modified stamps
	if(!r.data.$set) r.data.$set = {}
	r.data.$set._mt = new Date().getTime();		
	r.data.$set._mu = r.session.user_id;		
	// Update selected fields
	r.database.collection(collection).updateOne({id:id}, r.data, { upsert : false }, function(err,commandResult) {
		if(err)	{r.server.endWithError(r,"Database error in collection.updateOne() "+err); return;}
		// Check if id not found
		var result = commandResult.result; // !!! see CommandResult
		if(result.nModified==0){r.server.endWithError(r,"The document with id='"+id+"' is not found"); return;}
		// Send OK
		result._mt = r.data.$set._mt;
		r.server.endWithSuccess(r, result);
	});
}

// REMOVE DOCUMENT (just set _removed flag)
// doc.id must exist 
this.document_remove = function(collection, r){
	if(!r.data){r.server.endWithError(r,"data is undefined"); return;}
	// Fill modification fields
	r.data = {
		id		: r.data.id, // To prevent other fields modification		
		$set:{_removed: true}
	};
	// Update fields
	r.server.document_modify(collection,r);
}

// RESTORE DOCUMENT (just clear _removed flag)
// doc.id must exist 
this.document_restore = function(collection, r){
	if(!r.data){r.server.endWithError(r,"data is undefined"); return;}
	// Fill modification request
	r.data = {
		id		: r.data.id, // To prevent other fields modification		
		$unset:{_removed: null}
	};
	// Update fields
	r.server.document_modify(collection,r);
}

////////////////////////////////////////////////////////////////////////////////////////////////
// GUID GENERATOR
const TIME_BASE  = 1451595600000;// const for ID calculation
exports.generateGUID = function(r){
//	return String.format("%02X-%08X",
//			User.instance().getUserID(),
//			(System.currentTimeMillis()-TIME_BASE)/100 );
	var guid = r.session.user_id.toString(16) +
		"-" +
		(new Date().getTime()-TIME_BASE/100).toString(16);
	console.log("generateGUID "+guid);
	return guid;
		
}

// RANDOM GENERATORS
// https://blog.tompawlak.org/generate-random-values-nodejs-javascript
exports.randomValueHex = function(len) {
	return crypto.randomBytes(Math.ceil(len/2))
		.toString('hex') // convert to hexadecimal format
		.slice(0,len);   // return required number of characters
}
exports.randomValueBase64 = function(len) {
	return crypto.randomBytes(Math.ceil(len * 3 / 4))
		.toString('base64')   // convert to base64 format
		.slice(0, len)        // return required number of characters
		.replace(/\+/g, '0')  // replace '+' with '0'
		.replace(/\//g, '0'); // replace '/' with '0'
}



