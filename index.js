exports.files = require("./files.js");

exports.createServer = function(config,router){
	var server = require("./server.js");
	server.config = config;
	server.router = router;
	return server;
}
exports.getLocalPath = function(){return __dirname;}

//--------------------------------------------------------------------
// ROUTER
// method get
exports.getRouter={
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
