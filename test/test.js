"use strict"
const opuntia = require("../");


//-------------------------------------------------------------------------------------------------
// DATA
var books = [
	{author:"Leo Tolstoy", name: "War and Peace"},
	{author:"William Shakespeare", name: "The Tragedy of Hamlet, Prince of Denmark" }
];

//-------------------------------------------------------------------------------------------------
// CREATE & CONFIG API SERVER
var router = {
	$title: "The router example",
	h_get:{
		title:"Info",
		descr:"Public information about the API-server",
		action: function(r){
			//throw new opuntia.ApiError(405,"api error"); 
			r.server.endWithSuccess(r, {message:"API server base info"});
		}
	},
	// The router
	router: {
		$title: "Rourer",
		$descr: "The endpoint to load the router for documentation tool",
		h_get : opuntia.Server.getRouterHandler()
	},
	// HTML server
	doc: 	{
		$title: "Documentation HTML-server",
		$descr: "To load static content",
		_files:	opuntia.getLocalPath()+'/doc/',
		_default:'index.html',
		h_get: 	opuntia.files.get
	},
	// WEB API server
	books: {	
		$title: "Books",
		$descr: "The sample WEB API server",
		//_database:	mongo.db("books"),
		//_auth:		opuntia.auth,
		h_get:{
			title:"Info",
			descr:"Public information about Books",
			action: function(r){r.server.endWithSuccess(r, {message:"Books API public description"});}
		},
		list:{
			h_get:{
				title:"list",
				descr:"Get the books list",
				action: function(r){r.server.endWithSuccess(r, books);}
			}			
		},
		book:{
			h_get:{
				title:"Get",
				descr:"Get the book by the index (0-based)",
				pathParams:1,//one path parameters
				action: function(r){
					// Check parameters
					var index = r.path.segments[r.path.segments.length-1];
					var book  = books[index];
					if(!book){r.server.endWithErrorCode(r, 404, 'index "'+index+'" not found');return;}
					r.server.endWithSuccess(r, book);
				}
			},
			h_post:{
				title:"Post",
				descr:"Add a book into the list",
				requestBodyType: "json",
				testBody:{author:"Gomer", name:"Odissea"},
				action: function(r){
					var book = r.data;
					// Verify data
					if(!book){r.server.endWithError(r,"book data is undefined"); return;}
					if(!book.author || !book.name){r.server.endWithError(r,"a book must contain 'author' and 'name' fields"); return;}
					var len = books.push(book);
					r.server.endWithSuccess(r, {index:len-1});
				}
			},
			h_put:{
				title:"Put",
				descr:"Update a book by the index",
				pathParams:1,//one path parameters
				requestBodyType: "json",
				testBody:{author:"Gomer", name:"Iliada"},
				action: function(r){
					var book = r.data;
					// Check index
					var index = r.path.segments[r.path.segments.length-1];
					if(!books[index]){r.server.endWithErrorCode(r, 404, 'index "'+index+'" not found');return;}
					// Verify data
					if(!book){r.server.endWithError(r,"book data is undefined"); return;}
					if(!book.author || !book.name){r.server.endWithError(r,"a book must contain 'author' and 'name' fields"); return;}
					// Update 
					books[index] = book;
					r.server.endWithSuccess(r, {index:index});
				}
			},
			h_delete:{
				title:"Delete",
				descr:"Delete a book by index.",
				pathParams:1,//one path parameters
				action: function(r){
					// Check index
					var index = r.path.segments[r.path.segments.length-1];
					if(!books[index]){r.server.endWithErrorCode(r, 404, 'index "'+index+'" not found');return;}
					// Delete
					books[index] = null;
					r.server.endWithSuccess(r, {index:index});
				}
			}
		}
	}
};

// CREATE & START API SERVER
var server = new opuntia.Server(router, {
		PROTOCOL   			: 'http:',
		port       			: 8080,
		REQUEST_BODY_LIMIT	: 1024 
	}
);
server.listen(function(){
	// START STATIC WEB SERVER
	var testUrl   = "http://localhost:"+server.config.PORT+"/doc/index.html";
	console.log("Open the next URL for test:\n"+testUrl);
});
