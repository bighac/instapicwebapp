// hidden file
require('dotenv').config();
var express                 = require("express"),
    app                     = express(),
	flash                   = require("connect-flash"),
	methodOverride          = require("method-override"),
    mongoose                = require("mongoose"),
	passport                = require("passport"),
	User                    = require("./models/user.js"),
	Notification            = require("./models/notificatio.js"),
	LocalStrategy           = require("passport-local"),
	passportLocalMongoose   = require("passport-local-mongoose"),
    bodyParser              = require("body-parser"),
	Comments                = require("./models/comments.js"),
	multer                  = require('multer'),
	async                   = require("async"),
	nodemailer              = require("nodemailer"),
	crypto                  = require("crypto"),
	twilio                  = require("twilio");

// Twilio Setup 
var client = twilio( 
	process.env.TWILIO_SID,
	process.env.TWILIO_TOKEN
   );


// storage file name from multer 
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});

// checks and only allow images 
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

var upload = multer({ storage: storage, fileFilter: imageFilter});

// cloudinary config
var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: "instapic-heroku-app", 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET_KEY
});
	    
app.use(express.static("style"));
app.use(methodOverride("_method"));
app.use(flash());
var Photos = require("./models/photos.js");
mongoose.connect(process.env.DATABASEURL, { useNewUrlParser: true  , useCreateIndex : true });
app.use(bodyParser.urlencoded({ extended : true}));

// AUTH CONFIG ==================================
app.use(require("express-session")({
	secret: "I am Ajay Gupta",
	resave : false,
	saveUninitialized : false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// This will allow these variables to accessble to all pages
app.use(async function(req, res, next){
   res.locals.CurrentUser = req.user;
   if(req.user) {
    try {
      let user = await User.findById(req.user._id).populate("notifications", null, { isRead: false }).exec();
      res.locals.notifications = user.notifications.reverse();
    } catch(err) {
      console.log();
    }
   }
   res.locals.error = req.flash("error");
   res.locals.success = req.flash("success");
   next();
});
// ================================================

// =============
// ROUTES
// =============

// HOME PAGE
app.get("/" ,  function(req ,res){
	// FIND ALL THE PHOTO 
	Photos.find({status : "public"}).sort({_id: -1}).populate({path : "author.id"}).exec(function(err , allphoto){
		if(err){
			console.log(err);
		} else {
			res.render("index.ejs" , { photos : allphoto });
		}
	}); 
});

// HOME PAGE
app.get("/instapic" , function(req ,res){	 
		 // FIND ALL THE PHOTO    
		Photos.find({status : "public"}).sort({_id: -1}).populate({path : "author.id"}).exec(function(err , allphoto){
			if(err){
			console.log(err);
		     }else {
			   res.render("index.ejs" , { photos : allphoto});
				}
		});	
});
//===================

// GETTING USER'S DATA USING API.
app.get("/instapic/api/users" , function(req ,res){
	User.find({})
	.then(function(users){
		res.json(users);
	}).catch(function(err){
	   res.send("something went wrong...");
	});
});

// CREATING NEW POST
app.get("/instapic/new" , isloggedin , function(req,res){
    res.render("new.ejs");	
});

// creating a new photo..
app.post("/instapic", isloggedin , upload.single('image') , async function(req, res){
    // get data from form and add to campgrounds array
	try {
	var result = await upload_get_url(req.file.path);
	var angle = getAngle(result.exif.Orientation); 
	var img = result.secure_url;
    var imgId = result.public_id;
	var description = req.body.description;
	var author = {
		id : req.user._id,
		username : req.user.username,
		fullname : req.user.fullname
	};
	var photos = {
		img : img,
	    imgId : imgId,
		angle : angle,
		description : description,
		author : author,
		status : req.body.status
	};
	
      let createdphoto = await Photos.create(photos);
	   if(createdphoto.status === "public"){
		   let user = await User.findById(req.user._id).populate("followers").exec();
           let newNotification = {
		     fullname : req.user.fullname,
             username: req.user.username,
             photoId: createdphoto.id
            }
          for(const follower of user.followers){
             let notification = await Notification.create(newNotification);
             follower.notifications.push(notification);
             follower.save();
             //redirect back to campgrounds page
             res.redirect("/instapic/" +  createdphoto._id);
          }
	  }else{
		  //redirect back to campgrounds page
          res.redirect("/instapic/" + createdphoto._id);
	  }
    } catch(err) {
      req.flash("error" , );
	  res.redirect("/instapic");
    } 
});
//=================================

// AUTH RELATED ROUTES =================
// Register new user
app.get("/register" , function(req,res){
	 res.render("register.ejs");
});

// Creating a new user 
app.post("/register" , upload.single('image') , async function(req,res){
	if(req.body.isadmin === process.env.REGISTER_SECURITY_KEY)
	{
		try{
		   var isadmin = true;
		   var result = await upload_get_url(req.file.path);
		   var angle = getAngle(result.exif.Orientation);
		   var avatar = result.secure_url;
		   var avatarId = result.public_id;
		   var newUser = new User({ 
		      username : req.body.username,
		      fullname : req.body.fullname,
		      avatar :  avatar,
		      angle : angle,
		      avatarId : avatarId,
		      description : req.body.description,
		      isadmin : isadmin	
		   });   
		} catch(error)
			{
				console.log(error);
			}
	       
	} else {
	 isadmin = false;
	}
	if(isadmin === true) 
		{
	    User.register(newUser , req.body.password , function(err , user){
		 if(err){
			 req.flash("error" , "User with this E-mail address or fullname already exist.");
			 return res.redirect("back");
		 } else {
			passport.authenticate("local")(req , res , function(){
			req.flash("success" , "Welcome to Instapic App " + req.user.fullname );
			res.redirect("/user/" + newUser._id);
			});	 
			 }
	 });
		} else {
			req.flash("error" , "You must required security key for registeration as a new user.");
			res.redirect("/register");
		}
});

app.get("/login" , function(req,res){
	 res.render("login.ejs");
});

app.post("/login" , passport.authenticate("local" , {
    successRedirect : "/instapic",
	failureRedirect : "/login",
	failureFlash: true
}),  function(req,res){
});

app.get("/logout" , function(req,res){
	req.logout();
	req.flash("success" , "You Successfully Logged out");
	res.redirect("/instapic");
});

// FORGOT PASSWORD SESSION
app.get("/instapic/forgot",  function(req , res){
	res.render("forgotpass.ejs");
});

// GETTING DATA FROM FORGOT ROUTES
app.post("/instapic/forgot" , function(req ,res ,next){
	
	async.waterfall([
		function(done){
			crypto.randomBytes(20 , function(err , buf){
				if(err){
					req.flash("error" , "Something Went Wrong while Reseting Password");
					return res.redirect("/instapic/forgot");
				}
				  var token = buf.toString('hex');
				  done(err , token);	
			});
		} ,
		function(token ,done){
			User.findOne({username : req.body.email} , function(err , user){
				if(err){
					req.flash("error" , "Something Went Wrong while Reseting Password");
					res.redirect("/instapic/forgot");
				}else{
					if(!user){
					   req.flash("error" , "User with this Email Address does not exist");
					   return res.redirect("/instapic/forgot");
					}
					
					user.resetPasswordToken = token;
					user.resetPasswordExpires = Date.now() + 5400000;
					user.save(function(err){
						done(err , token , user);
					})
				}
			})
		} , 
		function(token , user , done){
			var smtpTransport = nodemailer.createTransport({
				service : "Gmail",
				auth : {
					user : process.env.PERSONAL_EMAIL,
					pass  : process.env.EMAIL_PASS
				}
			});
			var mailOptions = {
				to : req.body.email,
				from : process.env.PERSONAL_EMAIL,
				subject : "Password Reset from Instapic App.",
				text : "A password reset event has been triggered. The password reset window is limited to 1.5 hours.\n\n" + 
				'If you do not reset your password within 1.5 hours, you will need to submit a new request. \n\n' + 
			'To complete the password reset process, visit the following link: \n\n' + 
				'https://instapic-1999.herokuapp.com/instapic/forgot/' + token + '\n\n' +
				'If you did not request this , plz ignore your password will not be changed \n\n' +
				'Thank you'
			};
			smtpTransport.sendMail(mailOptions , function(err){
				done(err , "done");
			})
		} , 
		function(err){
			if(err){
				res.render("forgotpass.ejs");	
			}else{
				res.redirct("/instapic/forgot");
			}
			
		}
	])
});

// HANDLE TOKEN WHEN EMAIL IS SENDING
app.get("/instapic/forgot/:token" , function(req,res){
   User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() }           },     function(err, user) {
        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/instapic/forgot');
       }
       res.render('resetpass.ejs', {token: req.params.token});
      });
   });

// GETTING DATA FROM CONFORM PASSWORD
app.post("/instapic/forgot/:token" , function(req ,res){
	async.waterfall([
		function(done){
		   User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user){
			   if(!user){
				   req.flash('error', 'Password reset token is invalid or has expired.');
                   return res.redirect('back');
			      }
			   if(req.body.newpassword === req.body.conpassword){
				   user.setPassword(req.body.newpassword , function(err){
					   user.resetPasswordToken = undefined;
					   user.resetPasswordExpires = undefined;
					   
					  user.save(user , function(err){
						  req.login(user , function(err){
							  done(err ,user);
						  });
					  });
				   });
			   }else{
				   req.flash("error" , "passwords do not match.");
				   return res.redirect("back");
			   }
		   });	
		} , 
		function(user , done){
			var smtpTransport = nodemailer.createTransport({
				service : "Gmail",
				auth : {
					user : process.env.PERSONAL_EMAIL,
					pass  : process.env.EMAIL_PASS
				}
			});
			var mailOptions = {
				to : user.username,
				from : process.env.PERSONAL_EMAIL,
				subject : "Your Password has been changed from Instapic",
				text : "Hello.\n\n" + 
			    'This is the confirmation that your password of instapic account with Username : ' + user.fullname + ' has been changed.. \n\n'+
				'Thank you. '
			};
			smtpTransport.sendMail(mailOptions , function(err){
			    req.flash('success' , "Your Password has been changed.");
				done(err);
			});
		  } , function(err){	
			  res.redirect("/instapic");
		   }	
	])
});


// SHOW PAGE ROUTE
app.get("/instapic/:id", function(req,res){
	 // FIND PARTICULAR PHOTO FROM DATABASE
	 Photos.findById(req.params.id).populate("likes").exec(function(err , foundphoto){
	    if(err){
	      console.log(err);
	    } else {
			Photos.findById(req.params.id).populate({
				path : "comments",
				populate: {
                   path: "author.id",
                   model: 'User'
                    } 
			}).exec(function(err , foundedphoto){
				if(err){
					console.log(err);
				}else{
				  var user = foundphoto.author.username;
	              Photos.find({ "author.username" : user }).populate({
			         path : "author.id",
		          }).exec(function(err , photos){
			     if(err){
				    console.log(err);
		           	} else {
				      var publicfoundphotos = [];
						 photos.forEach(function(photo){
							 if(photo.status == "public"){
								 publicfoundphotos.push(photo);
							 }
						 });
				res.render("show.ejs" , {foundphoto : foundphoto , photos : publicfoundphotos , foundedphoto : foundedphoto});
			} 
		 });
					
				}
			})
			 
	 }
	 });
});

// sending image on whatsapp
app.get("/instapic/:id/sendimage", isloggedin ,function(req,res){
	Photos.findById(req.params.id , function(err , foundphoto){
	if(foundphoto.author.id.equals(req.user._id)){
		if(err){
			console.log(err);
		}else{
			var userid = foundphoto.author.id;
			User.findById(userid , function(err , user){
				res.render("whatsapp.ejs" , {foundphoto : foundphoto , user : user});
			});
		}
	  }else{
		  req.flash("error" , "You don't have permission to share this image");
		  res.redirect("/instapic/" + foundphoto._id);
	  }
		
	});
});

app.post("/instapic/:id/sendimage" , isloggedin, function(req,res){
 	 Photos.findById(req.params.id , function(err , foundphoto){
	  if(foundphoto.author.id.equals(req.user._id)){
		 var imgurl = req.body.imgurl;
		 var fullname = foundphoto.author.fullname;
		 var sendnum = req.body.sendnum;
		 client.messages
		  .create({
			 from : 'whatsapp:+14155238886',
			 to : 'whatsapp:+91' + sendnum,
			 body : "Image from " + fullname,
			 mediaUrl :  imgurl
		 }).then(message => {
			 req.flash("success" , "Image send successfully");
			 res.redirect("/instapic");
		 }).catch(err => {
			 req.flash("error" , "Something Went wrong");
			 res.redirect("/instapic");
		 });
	  }else{
		  req.flash("error" , "You don't have permission to share this image");
		  res.redirect("/instapic/" + foundphoto._id);
	  }	 
	 });
}); 

// SHOWING PRIVATE IMAGE IN PRIVATE SESSION...
app.get("/user/:id/private/:id" ,isloggedin ,  function(req,res){
	// FIND PARTICULAR PHOTO FROM DATABASE
	 Photos.findById(req.params.id).populate("comments likes").exec(function(err , foundphoto){
	    if(err){
	      console.log(err);
	    } else {
			// FIND ALL THE PHOTOS RELATED TO LOGGEDIN USER
			// POPULATE ALL THE DATA OF USER
		 var user = foundphoto.author.username;
	     Photos.find({ "author.username" : user }).populate({
			 path : "author.id",
		 }).exec(function(err , photos){
			  if(err){
				console.log(err);
			} else {
				var privatefoundphotos = [];
						 photos.forEach(function(photo){
							 if(photo.status == "private"){
								 privatefoundphotos.push(photo);
							 }
						 });
				res.render("private-show.ejs" , {foundphoto : foundphoto , photos : privatefoundphotos , user : user});
			} 
		 });
	 }
	 });
});

// Covert private IMAGE to public IMAGE
app.put("/user/:id/private/:id/cpublic" , isloggedin , function(req,res){
	 Photos.findById(req.params.id).populate("comments likes").exec(function(err , foundphoto){
	    if(err){
	      console.log(err);
	    } else {
			var newphoto = {
				status : "public"
			}
			Photos.findByIdAndUpdate(req.params.id , newphoto , function(err,updatedphoto){
				if(err){
					console.log(err);
				}else{
					req.flash("success" , "Added to public section..");
					res.redirect("/instapic");
				}
			});	
	 }
	 });
	
});

// Covert public IMAGE to private IMAGE
app.put("/user/:id/private/:id/cprivate" , isloggedin , function(req,res){
	 Photos.findById(req.params.id).populate("comments likes").exec(function(err , foundphoto){
	    if(err){
	      console.log(err);
	    } else {
			var newphoto = {
				status : "private"
			}
			Photos.findByIdAndUpdate(req.params.id , newphoto , function(err,updatedphoto){
				if(err){
					console.log(err);
				}else{
					req.flash("success" , "Added to private section..");
					res.redirect("/user/" +req.user._id);
				}
			});	
	 }
	 });
	
});

// DELETE REQUEST FROM USER
app.delete("/instapic/:id" , function(req, res){
	// Is user logged in or not?
	if(req.isAuthenticated()){
		Photos.findById(req.params.id ,  async function(err ,foundphoto){
			if(foundphoto.author.id.equals(req.user._id)){
				try{
					await cloudinary.v2.uploader.destroy(foundphoto.imgId);
					Photos.findOneAndDelete({_id : req.params.id} , function(err){
					if(err){
						console.log(err);
					 } else {
					 req.flash("success" , "Successfully deleted the post");
					 res.redirect("/instapic");
					}
				    });
				}catch(err) {
					 req.flash("success" , "Successfully deleted the post");
					 res.redirect("/instapic");
				}	
			} else {
				req.flash("error" , "you don't have permission to do that");
				res.redirect("/instapic/" + foundphoto._id);
			}
		});
	} else {
	    req.flash("error" , "please login");
	    res.redirect("/login");
	}   
});	


// DELETE PRIVATE PHOTO ROUTE
app.delete("/user/:id/private/:id" , function(req, res){
	// Is user logged in or not?
	if(req.isAuthenticated()){
		Photos.findById(req.params.id ,  async function(err ,foundphoto){
			if(foundphoto.author.id.equals(req.user._id)){
				try{
					await cloudinary.v2.uploader.destroy(foundphoto.imgId);
					Photos.findOneAndDelete({_id : req.params.id} , function(err){
					if(err){
						console.log(err);
					 } else {
					 req.flash("success" , "Successfully deleted the post");
					 res.redirect("/user/" + req.user._id );
					}
				    });
				}catch(err) {
					 req.flash("success" , "Successfully deleted the post");
					 res.redirect("/user/" + req.user._id );
				}	
			} else {
				req.flash("error" , "you don't have permission to do that");
				res.redirect("/instapic");
			}
		});
	} else {
	    req.flash("error" , "please login");
	    res.redirect("/login");
	}   
});
	

// GETTING COMMENTS DATA FROM COMMENT FORM
app.post("/instapic/:id/comments" , isloggedin, function(req ,res){
	//FIND THE PHOTO ON THAT WE ARE COMMENTING..
	Photos.findById(req.params.id , function(err , foundphoto){
		if(err)
			{
				console.log(err);
			} else {
				Comments.create(req.body.comment  , function(err , comment){
					if(err){
						console.log(err);
					} else {
						// ADD USERNAME AND USERID TO COMMENTS
						comment.author.id = req.user._id;
						comment.author.username = req.user.fullname;
						comment.save();
						// then save
						foundphoto.comments.push(comment);
						foundphoto.save();
						req.flash("success" , "Successfully added a new comment");
						res.redirect("/instapic/" + foundphoto._id);
					}
				});
			}
	});
});

// DELETE COMMENTS
app.delete("/instapic/:id/comments/:comment_id" , function(req,res){
	// FIRST CHECK USER IS LOGGED IN OR NOT
	if(req.isAuthenticated()){
		Comments.findById(req.params.comment_id , function(err , comment){
			if(err){
				console.log(err);
			} else {
				if(comment.author.id.equals(req.user._id)){
		          Comments.findByIdAndRemove(req.params.comment_id , function(err){
		           if(err){
			             console.log(err);
			             req.flash("error" , "Something Went Wrong");
			             res.redirect("back");
		              } else {
			              //REDIRECT TO PREVIOUS PAGE
				          req.flash("success" , "Successfully Deleted Comment");
		   	              res.redirect("back");
		                }
			         });
				}
			   else {
			    req.flash("error" , "You don't have permission to do that");
				res.redirect("back");
		         }	
		}
		});	
	} else {
		req.flash("err" , "Plz login first to Delete comment");
		res.redirect("/login");
	}
});


// LIKES ====================================
app.post("/instapic/:id/like" ,isloggedin, function(req ,res){
	// find Photo
	Photos.findById(req.params.id , function(err, foundphoto){
		if(err){
			console.log(err);	
		} else {
		
			// check if req.user._id exists in foundphoto.likes	
			var foundUserLike = foundphoto.likes.some(function (like) {
            return like.equals(req.user._id);
           });
        
			 // if user liked that photo
			if(foundUserLike){
				// useralready liked remove like
				foundphoto.likes.pull(req.user._id);
			} else {
				// user not liked that photo add like
				foundphoto.likes.push(req.user);
			}
			foundphoto.save(function(err){
				if(err){
					console.log(err);
				} else {
					res.redirect("/instapic/" + foundphoto._id);
				}
			});	
		}
	});
});

// USERS PROFILE
app.get("/user/:id", function(req,res){
	User.findById(req.params.id).populate("followers").exec(function(err , founduser){
		if(err){
			console.log(err);
		} else {
			Photos.find().populate({path : "author.id"}).exec(function(err , Allphotos){
		  
			Photos.find().where("author.id").equals(founduser._id).exec(async function(err , photo){
				if(err){
					console.log(err);	
				}else {
				   try{	
					var publicfoundphotos = [];
					var privatefoundphotos = [];
					if(req.user){
						var userid = req.user._id;
						var likedimages = [];
					    var likeimages = [];
						await Photos.find({} , function(err , foundphotos){
					      foundphotos.forEach(function(photo){
					          for(var i = 0 ; i < photo.likes.length ; i++){
							  if(photo.likes[i].equals(userid)){
								   if(photo.author.id.equals(userid)){
									  
								    }else{
								      likedimages.push(photo);
								    }
								  break;
							  } 
						   }	
					   });
					});
						
					await Allphotos.forEach(function(photo){
						  likedimages.forEach(function(likephoto){
							 if(likephoto._id.equals(photo._id)){
								likeimages.push(photo);
							 }
						  }); 
					   });
					} 
					   
					 await photo.forEach(function(photo){
							if(photo.status == "public"){
								 publicfoundphotos.push(photo);
							 }else{
								  privatefoundphotos.push(photo);
							 }
						 });
				   } catch(err){
					   req.flash("err" , "Something Went Wrong!!");
					   res.redirect("/instapic");
				   }
			  res.render("profile.ejs" , {user : founduser , publicfoundphotos : publicfoundphotos , priavteimages : privatefoundphotos , Alllikedimages : likeimages });
				  }
				});
			});	
	    }
		
		});
	});


// private images on profile page
app.get("/user/:id/private" , isloggedin , function(req,res){
   User.findById(req.params.id , function(err , founduser){
	   if(err){
		   console.log(err); 
	   }else{
		   if(founduser._id.equals(req.user._id))
		     {
				Photos.find().where("author.id").equals(founduser._id).exec(function(err , photo){
				if(err){
					console.log(err);	
				}else {
					var privatefoundphotos = [];
						 photo.forEach(function(photo){
							 if(photo.status == "private"){
								 privatefoundphotos.push(photo);
							 }
						 });
					res.render("profileprivateimage.ejs" , {user : founduser , privatefoundphotos : privatefoundphotos});
				}
			});	
				}else{
				  	req.flash("error" , "You Don't have permission to check others private Images");
					res.redirect("/user/" + req.params.id);
				} 
	   }
   })
});



// udate user profile data
app.get("/user/:id/edit" ,isloggedin ,  function(req , res){
		User.findById(req.params.id , function(err , founduser){
		if(err){
			console.log(err);
		}else{
			  if(founduser._id.equals(req.user._id))
				{
					res.render("profile-edit.ejs" , {user : founduser});
				}else{
				  	req.flash("error" , "You Don't have permission to change others profile data");
					res.redirect("/user/" + req.params.id);
				}
		}
	  });	
});

app.put("/user/:id" , upload.single('image')  , function(req ,res){
	   // getting data for upadation of profile
	   
	   User.findById(req.params.id , async function(err , founduser){
		  if(err){
			  req.flash("error" , "something went wrong");
			  return res.redirct("/user/" +  req.params.id);
		  } 
		   try{
			  if(req.file){
				  await cloudinary.v2.uploader.destroy(founduser.avatarId);
				  var result = await upload_get_url(req.file.path); 
				  var angle = getAngle(result.exif.Orientation);
				  var newuser = {
					  username : req.body.email,
		              fullname : req.body.fullname,
		              avatar : result.secure_url,
					  angle : angle,
					  avatarId : result.public_id,
		              description : req.body.description 
	                 }
				    if(founduser.username === req.body.email){
				      var newuser = {
		                 fullname : req.body.fullname,
		                 avatar : result.secure_url,
					     angle : angle,
					     avatarId : result.public_id,
		                 description : req.body.description 
	                   }
			         }
			     } else{
					var newuser = {
					     username : req.body.email,	  
		                 fullname : req.body.fullname,
		                 description : req.body.description
	                   }
					if(founduser.username === req.body.email){
				      var newuser = {  
		                 fullname : req.body.fullname,
		                 description : req.body.description
	                   }
			         }
				 }
		   } catch(err){
			   req.flash("error" , "Something went wrong . image is not able to update");
			   res.redirect("/user/" + req.params.id);
		   } 
	    // find that user and then update data
	    User.findByIdAndUpdate(req.params.id , newuser , function(err , updateduser){
		      if(err){
				req.flash("error" , "User with this E-mail address or fullname already exist.");
				res.redirect("/user/" + req.params.id);
			  }else{
					Comments.find({"author.id" : req.params.id} , function(err , foundusercomment){
					if(err){
						console.log(err);
					}else{
						foundusercomment.forEach(function(usercomment){
							usercomment.author.username = req.body.fullname;
							usercomment.save();
						});
					}
				   });
				   // AND redirect to user page
			       res.redirect("/user/" + req.params.id);
				  }
	    }); 						
	});
});


// follow user
app.get("/follow/:id", isloggedin , async function(req, res) {
  try {
     let founduser = await User.findById(req.params.id);
	 var checkfollower = founduser.followers.some(function (follow) {
            return follow.equals(req.user._id);
           });
	  if(checkfollower)
		  {
			  // aleady have a same follower
			 founduser.followers.pull(req.user._id);
		  }else {
			  // Don't have a follower
			 founduser.followers.push(req.user._id);
		  }
    founduser.save();
    res.redirect("/user/" + req.params.id);
  } catch(err) {
    req.flash('error', );
    res.redirect('back');
  }
});


// view all notifications
app.get("/notifications", isloggedin , async function(req, res) {
  try {
    let currentuser = await User.findById(req.user._id).populate({
      path: 'notifications',
      options: { sort: { "_id": -1 } }
    }).exec();
    let allNotifications = currentuser.notifications;
    res.render("notifications.ejs", { allNotifications : allNotifications });
  } catch(err) {
    req.flash('error', );
    res.redirect('back');
  }
});

// handle notification
app.get("/notifications/:id", isloggedin , async function(req, res) {
  try {
    let notification = await Notification.findById(req.params.id);
    notification.isRead = true;
    notification.save();
    res.redirect("/instapic/" + notification.photoId);
  } catch(err) {
    req.flash("error", );
    res.redirect("back");
  }
});


// CREATOR ROUTE
app.get("/creator" , function(req ,res){
	res.render("creator.ejs");
});

// UPLOAD IMAGE TO CLOUDINARY.COM SENDING OBJECT..
function upload_get_url(image){
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.upload(image , {exif : true} , (err, url) => {
      if (err) return reject(err);
      return resolve(url);
    });
  });
}


// GETTING ANGLE OF IMAGE(ORIENTATION OF IMAGE)
function getAngle(number){
	switch(number){
		case "1" :
			return(0);
			
		case "8" :
			return(270);
			
		case "3" :
			return(180);
			
		case "6" :
			return(90);
	}	
}

//  CHECK WHETHER THE PERSON IS LOGGED-IN OR NOT.
function isloggedin(req ,res , next){
	if(req.isAuthenticated()){
	return	next();
	} 
	req.flash("error" , "You Need To Be Logged In To Do That");	
	res.redirect("/login");	
}


app.listen(process.env.PORT || 9000 , function(){
	console.log("server started of instapic app......");
});