var getQueryParameters = function() {
	return (window.location.search).replace(/(^\?)/,'').split("&").map(function(n){return n = n.split("="),this[n[0]] = n[1],this}.bind({}))[0];
}



$(document).ready(function(){
	//alert("window.location.search: "+window.location.search);
	//console.log("Welcome");
	
	//-------------------------------------------------
	// LOAD PARAMETERS & INIT BACKEND DRIVER
	var query = getQueryParameters();
	window.API = new API({
		server:{
			protocol: 	query.protocol || window.location.protocol,
			host:		query.host     || window.location.hostname,
			port:		query.port 	   || window.location.port
		},
		
		onLogin: function(data){
			console.log("onLogin");
			onJsonReceived(data);
			ctlUser.addClass("login");
			ctlUser.text(window.API.getAuth().user.name);
		},
		onLogout: function(msg){
			console.log("onLogout");
			onFail(401, msg);
			ctlUser.removeClass("login");
			ctlUser.text("logged out");
		}
	});

	//-------------------------------------------------------------------------------------------------
	// ROUTER NODE fields
	// 	[  _* ] - parameter
	//	[ h_* ] - http method handler
	// 	[ other (not started from '_' or 'h_') ] - child tree
	
	//-------------------------------------------------
	// AUTH INFO
	var ctlUser   = $("#auth-user"); // current user name
	ctlUser.click(function(){
		var auth = window.API.getAuth(); // auth data
		if(auth)
			alert(JSON.stringify(auth));
	
	});
	
	
	//-------------------------------------------------
	// COMMON CALLBACK HANDLERS
	var result = null; // current result control
	var respBody = null; // current responce body control
	var clearResult = function(box){
		result 	 = box.find(".result");
		respBody = box.find(".responce-body");
		// Clear body
		respBody.empty();
		// Set waiting state
		result.removeClass("error");
		result.html("loading...");
	}
	var readData = function(box){
		try{
			var ctl		= box.find(".data");
			var s 		= ctl.val();
			//var sEnc 	= encodeURIComponent(s);
			var data	= JSON.parse(s);
		}catch(e){
			result.html("JSON parse error: "+e);
			return null;
		}
		return data;
	}
	var onJsonReceived = function(data){
		result.html("SUCCESS");
		respBody.html(JSON.stringify(data));
	}
	var onFail = function(code, text){
		result.addClass("error");
		result.html("FAILED: "+ code + " " + text );
	}
	
	var readPathParams = function(box, method, node){
		var path = node.path;
		var handler = node["h_"+method];
		if(handler.pathParams){
			var inputs = box.find(".path input");
			for(var i=0; i<inputs.length; i++){
				var val = $(inputs[i]).val();
				if(!val || !val.length){
					result.html("path parameter #"+(i+1)+" is empty");
					return null;
				}
				path += "/"+val;
			}
		}
		return path;
	}

	//-----------------------------------------------------------------------------------------
	// STANDARD BUTTON CLICK HANDLERS
	var sendRequest = function(box,method,node){
		clearResult(box);
		var handler = node["h_"+method];
		
		// Read path parameters
		var path = readPathParams(box, method, node);
		if(path==null) return;

		// Read data & send request
		if(handler.requestBodyType=='file'){
			// Read Data
			var file      = box.find(".file").prop('files')[0];   //File
			//var length = $(this).prev().find("span");
			if(!file){
				result.html("No file chosen");
				return;
			}
			// Send request
			API.sendFILE(
				method,
				path,
				file,
				onJsonReceived,
				onFail
			);
		}else{
			// Read request body
			if(handler.requestBodyType=='json'){
				// Read data
				var data = readData(box);
				if(!data) return;
			}

			// Send request
			API.sendJSON(
				method,
				path,
				data,
				onJsonReceived,
				onFail
			);
		}
	}
	
	var getAsImage = function(box,method,node){
		clearResult(box);
		// Read path parameters
		var path = readPathParams(box, method, node);
		if(!path) return;

		// Set img.src -> send request
		var img = $("<img />").attr('src', API.getServerURL()+path )
		.on('load',function(){
			if (!this.complete || typeof this.naturalWidth == "undefined" || this.naturalWidth == 0) {
				result.html('broken image!');
			} else {
				result.html("SUCCESS");
				respBody.html("");
				respBody.append(img);
			}
		})
		.on('error', function() {
			result.addClass("error");
			result.html("Can't load the file as an image");
		});
	}

	var getAsFile = function(box,method,node){
		clearResult(box);
		// Read path parameters
		var path = readPathParams(box, method, node);
		if(!path) return;

		// Send request
		var url = API.getServerURL()+path;
		respBody.html(url);
		//window.open(url);
		window.location = url;
	}
	
	// $(".open").click(function(){
	// 	$(this).hide();
	// 	$(this).next().slideDown();
	// });

	// $(".close").click(function(){
	// 	$(this).parent().slideUp(function(){
	// 		$(this).prev().show();
	// 	});
		
	// });

	//------------------------------------------------------------------------------------------
	// CONTENT LOADER
	var ctlContent = $("body > div.content");
	
	//-------------------------------------------------------------
	// WEBSOCKET - TRY BLOCK
	var appendWsTryBlock = function(container,k,node){
		var handler = node[k];
		if(!handler)return;
		var box = $("<div class='try'></div>");

		// skipAuth
		if(handler.skipAuth)
			box.append("<div class='skipAuth'>skipAuth</div>");

		// Title, description
		if(handler.title)box.append("<h1>"+handler.title+"</h1>");
		if(handler.descr)box.append("<div class='descr'>"+handler.descr+"</div>");

		// Path
		var path = $("<h2 class='path'>ws: "+node.path+"</h2>");
		//var path = $("<h2 class='path'>ws://"+API.getServerHost()+":"+API.getServerPort()+node.path+"</h2>");
		box.append(path);

		// CREATE WEBSOCKET (& connect)
		var websocket = null;
		var createWebsocket = function(){
			websocket = new WebSocket("ws://"+API.getServerHost()+":"+API.getServerPort()+node.path);
			websocket.onopen = function(evt) {  
				writeToScreen("CONNECTED");
				btnConnect.prop( 	"disabled", true );
				btnDisconnect.prop( "disabled", false );
				btnSend.prop( 		"disabled", false );
			};
			websocket.onclose = function(evt) { 
				writeToScreen("DISCONNECTED");
				btnConnect.prop( 	"disabled", false );
				btnDisconnect.prop( "disabled", true );
				btnSend.prop( 		"disabled", true );
			};
			websocket.onmessage = function(evt) {  
				writeToScreen('<span style="color: blue;">RESPONSE: ' + evt.data+'</span>');
			};
			websocket.onerror = function(evt) {  
				writeToScreen('<span style="color: red;">ERROR:</span> ' + evt.data);
			};
		}

		// BUTTON Connect
		var btnConnect = $('<button>Connect</button>').click(function(){
			createWebsocket();
		});			
		// BUTTON Disconnect
		var btnDisconnect = $('<button disabled="true">Disconnect</button>').click(function(){
			websocket.close();
		});			
		// BUTTON Send
		//var inpMessage = $("<input type='text'/>");
		var inpMessage = $('<textarea rows="3" class="data"></textarea>');
		var btnSend = $('<button disabled="true">Send</button>').click(function(){
			doSend(inpMessage.val());
		});			

		var div = $("<div></div>");
		div.append(btnConnect);
		div.append(btnDisconnect);
		box.append(div);
		var div = $("<div></div>");
		div.append(inpMessage);
		box.append(div);
		box.append(btnSend);
	
		
		var doSend = function(message){
		  writeToScreen("SENT: " + message);
		  websocket.send(message);
		}

		// OUTPUT
		box.append('<h3>Messages</h3>');
		var output = $('<div class="responce-body"></div>');
		box.append(output);
		var writeToScreen = function(message){
			output.append("<div>"+message+"</div>");
		}

		container.append(box);
	}
	//-------------------------------------------------------------
	// LOAD HANDLER - TRY BLOCK
	var appendTryBlock = function(container,k,node){
		var handler = node[k];
		var method = k.substr(2);
		if(!handler)return;

		// Special case for websocket
		if(method=="ws"){
			appendWsTryBlock(container,k,node);
			return;
		}

		var box = $("<div class='try'></div>");

		// skipAuth
		if(handler.skipAuth)
			box.append("<div class='skipAuth'>skipAuth</div>");

		// Title, description
		if(handler.title)box.append("<h1>"+handler.title+"</h1>");
		if(handler.descr)box.append("<div class='descr'>"+handler.descr+"</div>");

		// Path
		var path = $("<h2 class='path'>"+method.toUpperCase()+" "+node.path+"</h2>");
		box.append(path);
		if(handler.pathParams<0)
			handler.pathParams=1;
		if(handler.pathParams)
			for(var i=0;i<handler.pathParams;i++){
				path.append(' / <input type="text"/>');
			}

		// Request BODY input
		if(handler.requestBodyType){
			box.append('<h3>Request body ('+handler.requestBodyType+')</h3>');
			switch(handler.requestBodyType){
				case "file":
					// FILE to send
					box.append('<div><input class="file" type="file"></input></div>');
					break;
				case "json":
					// JSON to send (default)
					box.append('<div><textarea rows="3" class="data">'+(handler.testBody?JSON.stringify(handler.testBody):'')+'</textarea></div>');
					break;
				default:
				box.append('<div>Unknown request boody type: '+handler.requestBodyType+'</div>');
				break;
			}
		}

		// SEND BUTTON 
		const responseBodyType = handler.responseBodyType ? handler.responseBodyType : 'json';
		if(responseBodyType=="file"){
			// FILE to be received
			// Button as-image
			var btnAsImage = $('<button class="as-file">Download as an image</button>');
			box.append(btnAsImage);
			btnAsImage.click(function(){
				getAsImage(box, method, node);
			});			

			// Button as-file
			var btnAsFile = $('<button class="as-file">Download as a file</button>');
			box.append(btnAsFile);
			btnAsFile.click(function(){
				getAsFile(box, method, node);
			});			
		}else if(responseBodyType=="json"){
			// JSON to be received (default)
			// Button
			var btn = $('<button class="as-text">Send Request</button>');
			box.append(btn);
			btn.click(function(){
				sendRequest(box, method, node);
			});
		}else{
			box.append('<div>Unknown responce boody type: '+responseBodyType+'</div>');
		}


		// Result
		box.append('<h3>Result</h3>');
		box.append('<div class="result"></div>');

		// RESPONSE body
		box.append('<h3>Response body ('+responseBodyType+')</h3>');
		box.append('<div class="responce-body"></div>');

		container.append(box);
	}
	//--try-block---

	//-------------------------------------------------------------
	// LOAD NODE BLOCK
	var loadContent = function(id, key, node){
		var box = $("<div id='"+id+"' class='box'></div>");

		// Title, description
		if(node.$title)	box.append("<h1>"+node.$title+"</h1>");
		else			box.append("<h1>"+key+"</h1>");
		if(node.$descr)box.append("<div class='descr'>"+node.$descr+"</div>");

		// Load node parameters
		var table = $("<table></table>");
		var pCount=0;
		for (const k in node) {
			// Parameters
			if(k.charAt(0)=="_"){
				table.append("<tr><td>"+k+"</td><td>"+node[k]+"</td></tr>");
				pCount++;
				continue;
			}
		}
		if(pCount){
			box.append("<h3>Parameters</h3>");
			box.append(table);
		}

		// Load node handlers
		for (const k in node) {
			// For parameter "_wss"
//			if(k=="_wss")
//				appendWsTryBlock(box,k,node);
			// HTTP methods
			if(k.startsWith("h_")){
				appendTryBlock(box,k,node);
			}
			// Children
			// ..
		}

		ctlContent.append(box);
		return box;
	}

	//-------------------------------------------------------------
	// MENU CLICK HANDLER
	var menuSelected=null;
	var contentSelected=null;
	var onMenuClick = function(menu, key, node){
		if(menu.hasClass("active")) return;
		// Change menu immediately
		if(menuSelected)
			menuSelected.removeClass("active");
		menuSelected = menu;
		menuSelected.addClass("active");
		// Change active node content
		var id = menuSelected.attr("id")+"content";
		if(contentSelected)
			contentSelected.removeClass("active");
		contentSelected = $("#"+id);
		if(contentSelected.length==0)
			contentSelected = loadContent(id,key,node);
		contentSelected.addClass("active");
	}

	//-------------------------------------------------------------
	// LOAD MENU
	var ctlMenu = $("aside");
	var menuID = 1;// current menu item id
	var loadNodeMenu = function(level, key, path, node){
		// Insert menu item
		var sp = "<span class='tab'></span>";
		var tab="";for(var i=0;i<level;i++)tab+=sp;
		var item = $("<div id='node"+menuID+"'>"+tab+key+"</div>");
		menuID++;
		// Set handler
		item.click(function(){
			onMenuClick($(this), key, node);
		});
		ctlMenu.append(item);
	
		// Loop node props
		for (const k in node) {
			// Comments
			if(k.startsWith("$")){
				continue;
			}
			// Parameters
			if(k.startsWith("_")){
				item.append("<span class='icon param' title='parameter'>"+k.substr(1)+"</span>");// append parameter icon
				continue;
			}
			// Handlers
			if(k.startsWith("h_")){
				item.append("<span class='icon handler' title='handler'>"+k.substr(2)+"</span>");// append handler icon
				continue;
			}
			// Children
			loadNodeMenu(level+1, k, path+"/"+k, node[k]);// Recurrent call
		}

		// Append new node parameter - path
		node.path = path;
	}
		
	// GET ROUTER
	var routerPath = query.router?query.router:'/router'
	API.sendJSON(
		'GET',
		routerPath,
		null,
		function(data){
			//console.log(JSON.stringify(data));
			ctlContent.empty();
			ctlMenu.empty();
			menuID = 1;
			loadNodeMenu(0, "/","", data);
		},
		function(code, text){
			console.log("FAILED: "+ code + " " + text );
		}
	);

	// DATE TOOLS
	var dateTools = $(".date_tools");
	$(".date_tools .convert_string").click(function(){
		var str = $(".date_tools .string").val();
		displayDate( new Date(str) );
	});
	$(".date_tools .convert_number").click(function(){
		var str = $(".date_tools .string").val();
		var n = Number(str);
		displayDate( new Date(n) );
	});
	var displayDate = function(d){
		try{
			$(".date_tools .getTime"	).text( d.getTime() );
			$(".date_tools .toISOString").text( d.toISOString() );
			$(".date_tools .toString"	).text( d.toString() );
		}catch(err){
			alert(err);
		}
	}
	$(".date_tools .close").click(function(){
		dateTools.hide();
	});
	$(".open_date_tools").click(function(){
		dateTools.show();
	});
});

