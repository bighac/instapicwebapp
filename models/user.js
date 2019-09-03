var mongoose               = require("mongoose");
var passportLocalMongoose  = require("passport-local-mongoose");

var UserSchema = new mongoose.Schema({
	username : "string",
	password : "string",
	avatar  : "string",
	fullname : "string",
	created: { type: Date, default: Date.now },
	description : "string",
	isadmin : {type : Boolean , default : false},
	
});

UserSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("User" , UserSchema);