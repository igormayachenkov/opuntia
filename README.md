# Opuntia. Grow your API like a cactus.
A framework for WEB API building. The API could be RESTful or not. As you wish.

## Main Workflow
A WEB API is a request-response message system. 
The framework starts a WEB-server which exposed a set of endpoints. 
A web request URL has the next format: http://host[:port]/path. The path value uniquely identifies the endpoint to handle the request.
To make an API server based on the framework just make a router object with your custom endpoint handlers.

## Request handling
1. The framework defines if the path is valid (the appropriate endpoint handler exists). If not the error responce is returned.
2. For valid endpoint the handler's 'action' method is called with one argument 'r'. The 'r' argument contains all information for the request handling.
3. The handler must close the request with success or error. 

## Router
The router object defines the set of the endpoints. The router is just a JavaScript object where each property represents an URL path node.
A property name prefix defines the property type:
| Name prefix | Property type | Function   |
| :---------: |---------------|:----------|
| `"$"`       | comment       | will be ignored. $title,$descr used id auto documentation tool |
| `"_"`       | parameter     | the value will be copied to r-object (without the prefix) |
| `"h_"`      | handler       | defines the endpoint handler (or websocket connection point) |
| `no prefix` | branch        | defines the next child branch of the router tree |

## Handler format
The handler's name must have the nex format:
'h_<HTTP_REQUEST_METHOD>' defines the HTTP method or 
'h_wss' defines WebSocket connection point
| Property name | Function   |
| ------------- |:-----------|
| `action`      | the main request handler function |
| `requestBodyType` | request body type (default 'json') |
| `pathParams`  | the path tail segments count used as parameters (-1 any count) |
| `title`       | doc tool title  |
| `descr`       | doc tool description  |
| `testBody`    | doc tool sample data  |

## Auto documentation tool
/doc contains files for the auto documentation page.
The router should be exposed in this way. The standard path is /router. You could just open /doc/index.html in this case. Otherwise use the next query doc/index.html?router=<path_to_router>

## Module "files"
Allows files upload and download. 
Parameter "_files" must contain a valid path on the drive.
