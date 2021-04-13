"use strict"
//======================================================
// 		API API DRIVER FOR WEB JavaScript
//
// PARAMETERS:
// 	server - the backend server parameters
//			protocol: 	"http:"
//			host:	   	"188.120.241.121"
//			port:		8080
//
//	onLogin(data)		- login state callback
//	onLogout(msg)  		- logout callback
// 
// COMMON METHOD CALL FORMAT:
//	API.method(req_data, callback);
// 			callback(error, data)
//					error : {code, description}
//					data  ; responce data as JSON 
//
// USED CONTROLS IDs:
// 		#backend_server_url 		
// 		#backend_session_value

function API(PARAM) {
	var URL_ROOT    = PARAM.server.protocol + '//' + PARAM.server.host	+ ':' + PARAM.server.port;
	var URL_SERVER  = URL_ROOT;
	if(PARAM.workspace)
		URL_SERVER += '/'+PARAM.workspace;
	//console.log("backend URL_SERVER: "+URL_SERVER);
	$("#backend_server_url").html(URL_SERVER);

	//var session = new Session(PARAM.server.cookie);
	
	//*************************************************************************************
	// 					I N T E R F A C E
	
	//------------------------------------------------------------------------------------
	// STANDARD METHODS
	this.getServerURL = function(){ return URL_SERVER;}
	this.getServerHost = function(){ return PARAM.server.host;}
	this.getServerPort = function(){ return PARAM.server.port;}

	//----------------------------------------------------------------
	// SEND JSON
	this.sendJSON = function(method, path, data, onDone, onFail){
		var p = {
			type: 	method.toUpperCase(),
			url: 	URL_SERVER + path
		};
		if(data) {
			p.data = JSON.stringify(data);
			p.contentType='application/json';
		}

		sendAJAX(p, onDone, onFail);
	}

	//----------------------------------------------------------------
	// SEND FILE 
	// 		file - interface File 
	// 			could be get from <input type="file"/>  
	//			ex: var file = input.prop('files')[0];
	//this.postFile = function(file, onDone, onFail){
	this.sendFILE = function(method, path, file, onDone, onFail){
		var reader = new FileReader();
		reader.onloadend = function() {
			//length.html(reader.result.byteLength);
			sendAJAX(
				{
					data:reader.result,
					contentType: 'application/octet-stream',//'application/x-www-form-urlencoded; charset=UTF-8',
					cache: false,
					processData:false,
					//url:  URL_SERVER+'/files/'+file.name,//,
					url:  URL_SERVER + path,
					type: method.toUpperCase()
				},
				onDone, 
				onFail
			);
		};
		reader.onerror = function(){
			if(onFail)
				onFail(0,"file reading error");
		}

		// Read in the image file as a data URL.
		reader.readAsArrayBuffer(file);
	}
	
	//-----------------------------------------------------------
	// AUTH - USER (AUTHENTICATION SYSTEM)
	// Auth data:
	var auth = null;
	this.getAuth = function(){return auth;}
	
	// Init - define the current state (login/logout)
	this.init = function(onFail){
		GET( "/auth/info", 
		setLoginState,
		onFail); 
	}
	// Login
	this.login = function(data, onFail){ 
		POST( "/auth/login", data, 
		setLoginState,
		onFail ); 
	}
	// Logout
	this.logout = function(onFail){ 
		GET( "/auth/logout", 
		null, // logout always returns 401
		onFail); 
	}
	
	var setLoginState = function(data){
		// Set login state 
		auth = {
			user 	: data.user,
			expires	: data.expires_after + new Date().getTime()
		}
		// Do callback
		if(PARAM.onLogin)
			PARAM.onLogin(data);
	}
	var setLogoutState = function(msg){
			// clear auth data
			auth = null;
			// Do callback
			if(PARAM.onLogout)
				PARAM.onLogout(msg);
	}
	//*******interface************************************************************************
	
	//------------------------------------------------------------------------------------
	// COMMON AJAX procedure
	var sendAJAX = function(settings,onDone,onFail){
		
		// Modify settings
		settings.xhrFields   = {withCredentials: true}; //withCredentials allows to use user-credentials: cookies, auth data, clients SSL-cert.  ( www.w3.org/TR/cors/#omit-credentials-flag )
		settings.crossDomain = true;
		
		// Send request 
		$.ajax(settings).done(function(data) {
			if(onDone)
				onDone(data);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			// Logged out or another error
			if (jqXHR.status == 401){
				// Set logout state on 401
				setLogoutState(jqXHR.responseText);
			}else{
				// Error callback
				if(onFail)
					onFail(jqXHR.status, jqXHR.responseText ? jqXHR.responseText : errorThrown);
			}
		});
	}
	
}