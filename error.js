// ApiError
class ApiError{
	constructor(code, msg){
		this.code = code;
		this.message = msg;
	}
	toString(){
		return this.message;
	}
}

module.exports = {
	ApiError
};