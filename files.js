"use strict"
var fs 			= require('fs');

var getFilePath = function(r, filename){
	return r._files+filename;
}

// maps file extention to MIME typere
const map = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword'
};

// SEND THE FILE CONTENT
var get = function(r){
	// Calculate filename by r.path segments
	r.file = getFilePath(r, getFilename(r));

	// Check existance
	if(!fs.existsSync(r.file)){
		if(r._404)
			r.file = getFilePath(r, r._404);
		else	
			return	r.server.endWithError(r,"File not found");
	}

	// Read the file parameters
	var stat = fs.lstatSync(r.file);

	// Special case for directory
	if(stat.isDirectory()){
		if(r.path.src.charAt(r.path.src.length-1)==='/'){
			// User means this directory exactly!
			if(r._default){
				// Add default filename
				r.path.segments.push(r._default);
				get(r);//reccurent call
				return;
			}else{
				// => error
				r.server.endWithError(r,"It is a directory");
				return;
			}
		}else{
			// User means the dir as a file (without /)
			if(r._default){
				// => redirect the stupid guy to the right way!
				// to open default page in this directory
				r.server.redirectPermanently(r, r.path.src+'/');
				return;
			}else{
				// No default page
				// => error
				r.server.endWithError(r,"It is a directory");
				return;
			}
		}
	}

	// Set content type by the file extension
	var i = r.file.lastIndexOf('.');
	if(i>=0)
		var ext = r.file.slice(i);
	r.content_type = ext && map[ext] ?  map[ext] : "application/octet-stream";
	
	// Send single file
	sendFile(r);
}
// SEND FILE & CLOSE REQUEST
// r.file
// r.content_type
var sendFile = function(r){
	try{
		fs.readFile(r.file, function(err, data){
			if(err){
				r.server.endWithError(r, "File read error: "+err);
				return;
			}
			// Send file data
			r.response.setHeader(	"Content-Type", r.content_type);
			r.server.endWithSuccessBinary(r, data);
		});
	}catch(e){
		r.server.endWithError(r,"read file "+e);
	}
}

// RECEIVE THE FILE CONTENT
var post = function(r){
	// VERIFY content-type & content-length
	var contentType   = r.request.headers['content-type'];
	var contentLength = r.request.headers['content-length'];
	if(!contentType){
		r.server.endWithError(r,"Content-Type is undefined");
		return;
	}
	if(!contentLength){
		r.server.endWithError(r,"Content-Length is undefined");
		return;
	}
	contentLength = parseInt(contentLength);
	if(contentType.search('application/octet-stream')<0){
		r.server.endWithError(r,"Content-Type is unsupported");
		return;
	}
	
	// Verify filename
	var filename = getFilename(r);
	if(!filename){		
		r.server.endWithError(r,"filename is undefined");
		return;
	}
	
	// Open file
	try{
		var file = fs.openSync(getFilePath(r, filename), 'w')
	}catch(e){
		r.server.endWithError(r,"File open error. filename: "+filename);
		return;
	}

	// LOAD request DATA
	r.data_length = 0;
	var nWritten = 0;
	r.request.addListener("data", function(chunk) {
		//console.log("    typeof chunk:"+(typeof chunk)+"   chunk.length:"+chunk.length);
		//for(var i=0; i<postData.length; i++) console.log(i+" : "+postData[i].toString(16));
		r.data_length += chunk.length;//received data length
		nWritten 	  += fs.writeSync(file, chunk, 0, chunk.length, nWritten);
	});
	
	r.request.addListener("end", function() {
		// Close file
		try{
			fs.closeSync(file)
		}catch(e){
			r.server.endWithError(r,"File open error. filename: "+filename);
			return;
		}
		// Send OK
		r.server.endWithSuccess(r, {result:true, length: nWritten});
	});
}
var getFilename = function(r){
	var filename = "";
	var d="";
	for(var i=r.path.level; i<r.path.segments.length; i++){
		filename += d + r.path.segments[i];
		d="/"
	}
	return filename;
}

//-----------------------------------------------------------------------------------------------
// EXTERNAL INTERFACE
exports.get = {
	title:"Download",
	descr:"Download file from the server<br/>Parameters:<br/>filename",
	pathParams:-1,//any path parameters
	responseBodyType:"file",
	action: function(r){
		// Check parameters
		if(!r._files){throw r.server.endWithErrorCode(r,500,"parameter _files is undefined");return;}
		// DO ACTION
		get(r);
	}
}
exports.post = {
	title:"Upload",
	descr:"Upload file to the server<br/>Parameters:<br/>filename",
	pathParams:-1,//any path parameters
	skipBody:true,
	requestBodyType: "file",
	responseBodyType:"json",
	action: function(r){
		// Check parameters
		if(!r._files){throw r.server.endWithErrorCode(r,500,"parameter _files is undefined");return;}
		// DO ACTION
		post(r);
	}
}
//---external-interface------------------------------------------------


//-----------------------------------------------------------------------------------------------
// INTENAL INTERFACE (to use in another modules)
exports.sendFile = sendFile;

//---internal-interface------------------------------------------------








// DELETE FILE
/*exports.del = function(filename, response){
	// Verify filename
	if(!filename){		
		r.server.endWithError(response,"filename is undefined");
		return;
	}
	
	try{
		var file = config.FILES_DIR+"/"+filename;
		fs.unlinkSync(file);
		
		// Send OK
		r.server.endWithSuccess(response,
			JSON.stringify({result:true}));
	}catch(e){
		r.server.endWithError(response,"Error in function fs.unlinkSync "+e);
	}
}
*/

/*
// GET FILES LIST
exports.getList = function(urlParts, response){
	// Get & verify dir
	try{
		var dir = r.server.configFILES_DIR;
		for(var i=2; i<urlParts.length; i++) dir += '/'+urlParts[i];
		if(!fs.existsSync(dir)){
			r.server.endWithSuccess(response,"[]"); // empty collection
			return;
		}
	}catch(e){
		r.server.endWithError(response,"file. create dir "+e);
		return;
	}

	// Read dir
	fs.readdir(dir, function(err, files){
		if(err){
			r.server.endWithError(response,"fs.readdir error: "+err);
		}else{
			r.server.endWithSuccess(response,JSON.stringify(files));
		}
	});
}

// MAKE PATH AND CREATE DIRs IF NEED
var getDir = function(urlParts){
	// User dir
	var dir = config.FILES_DIR + "/" +user_id;
	if(!fs.existsSync(dir))
		fs.mkdirSync(dir);
	// Folder dir
	dir = dir + "/" +folder_id;
	if(!fs.existsSync(dir))
		fs.mkdirSync(dir);
	return dir;
}
*/
