# Opuntia. Grow your API like a cactus.
A framework for WEB API building.

## Main Workflow
The framework starts a WEB-server which exposed a set of endpoints. 
A web request URL has the next format: http://host[:port]/path. The path value uniquely identifies the endpoint to handle the request.
To make an API server based on the framework just make `Router` with your custom endpoint handlers.

## Router
The router object defines the set of the endpoints. The router is just a JavaScript object where each property represents an URL path node.
A property name prefix defines the property type:
| Name prefix | Property type | Function   |
| :---------: |---------------|:----------|
| `"$"`       | comment       | will be ignored. $title,$descr used id auto documentation tool |
| `"_"`       | parameter     | the value will be copied to r-object |
| `"h_"`      | handler       | defines the endpoint handler (or websocket connection point) |
| `no prefix` | branch        | defines the next child branch of the router tree |

## Request handling
1. The framework defines if the path is valid (the appropriate endpoint handler exists in the router). If not the error responce is returned.
2. For valid endpoint the handler's 'action' method is called with one argument 'r'. The 'r' argument contains all information for the request handling.
3. The handler must close the request with success or error. 

## Handler format
The handler's name must have the next format:
'h_<HTTP_REQUEST_METHOD>' defines the HTTP method
| Property name | Function   |
| ------------- |:-----------|
| `action`      | the main request handler function |
| `requestBodyType`  | request  body type: json|file ('json' - parse data as json) |
| `responseBodyType` | response body type: json|html|file (see description below)|
| `pathParams`  | the path tail segments count used as parameters (-1 any count) |
| `title`       | doc tool title  |
| `descr`       | doc tool description  |
| `testBody`    | doc tool sample data  |

## Request Body Format (excliding module "files")
The request body must be a string encoded in UTF-8 format which could be parsed to JSON (by JSON.parce() method).
In requests with a body the next headers must be defined:
| Header | Description   |
| ------------- |:-----------|
| `Content-Length` | The content length in bytes. The maximum value is defined by config.REQUEST_BODY_LIMIT |

## Response Format
### On Success
| parameter `responseBodyType`| header `Content-Type` |
| :--------- | :----------| 
| json | `application/json` default|
| html | `text/html` | 
| file | depends on the file type | 
### On Error
The response data has the next format: {message:'error message text'}
| code | meaning |
| :--------- | :----------| 
| 500 | Default server error. Caused by an exception in the handler |
| 401 | Unauthorized. Attempt to get access to an auth-protected resource  | 
| 404 | Resource not found. Wrong path.  | 


## Auto documentation tool
/doc contains files for the auto documentation page.
The router should be exposed in this way. The standard path is /router. You could just open /doc/index.html in this case. Otherwise use the next query doc/index.html?router=<path_to_router>

## Module "files"
Allows upload and download files. So could be used as a static WEB-server.
| Parameter | Function   |
| ------------- |:-----------|
| `_files`      | Required. Contains a path to your files. Must end with '/' |
| `_default`    | Default filename in the directory. Just for GET request. ex:'index.html' |
| `_404`        | The file to return in 'file not found' case. Just for GET request. ex:'404.html' |

## Auth interface
If parameter `_auth` is defined it is used for authorization. 
The object stored as this parameter must implement method: async checkAuthorized(r)

## Config
To the Server constructor takes two parameters: config & router.
Your config property names could be in any case (lower or upper) but will be tranlated to upper case in Server class constructor.
The config properties:
| Name | Default | Function   |
| ------------- | ------------- |:-----------|
| `PROTOCOL`    | 'http:'   | The web server protocol. Possible values: 'http:', 'https:' |
| `PORT`        | 8080 for http, 443 for https | The web server port. |
| `HTTPS_KEY`   | undefined | path to a private key file for https protocol. |
| `HTTPS_CRT`   | undefined | path to a certificate file for https protocol. |
| `HTTPS_CA`    | undefined | path to a CA certificate file for https protocol. |
| `REQUEST_BODY_LIMIT`   | undefined | the number of bytes that are allowed in a request body |

