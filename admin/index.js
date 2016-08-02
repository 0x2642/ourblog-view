var express = require('express');
var router = express.Router();
var app = express();
var path = require("path");
var request = require("request");
var formidable = require('formidable');
var fs = require("fs");
var dao = require('../dao/indexDAO.js');
var user = dao.User;
var authLog = dao.AuthLog;
var admin = dao.Admin;
var util = require('../util');
var strings = require('./strings.js');
var EventProxy = require('eventproxy');

var global_create_cert_token = '';

router.use(function(req, res, next) {
	var url = req.originalUrl;
	var exclude = ["/login", "/applyAuthorized", "/applyTmpAuthorized", "/confirmAuthorized",
		"createCertificate", "/admin_dashboard", "/admin_grouplist", "/admin_addadmin", "/admin_error"
	];
	var allow_flag = true;
	for (var i = exclude.length - 1; i >= 0; i--) {
		if (url.indexOf(exclude[i]) < 0 && !util.Cookies.getCookie(req, 'user')) {
			allow_flag = false;
		} else {
			allow_flag = true;
			break;
		}
	}

	if (!allow_flag) {
		return res.redirect("/admin/login");
	}
	next();
});



router.get('/', function(req, res, next) {
	var current_nav = util.Lang.get('NAV_LIST').INDEX;
	util.Cookies.setCookie(res, 'current_nav', current_nav);
	res.render(path.join(__dirname + '/view/index.ejs'), {
		title: 'jade',
		current_nav: current_nav
	});
});

router.get('/articlelist', function(req, res, next) {
	var current_nav = util.Lang.get('NAV_LIST').ARTICLE;
	util.Cookies.setCookie(res, 'current_nav', current_nav);
	res.render(path.join(__dirname + '/view/articlelist.ejs'), {
		title: 'Umiumiu',
		current_nav: current_nav
	});
});

router.get('/login', function(req, res, next) {
	var msg = ''
	if (req.query.msg != undefined && req.query.msg != null) {
		msg = req.query.msg
	}

	res.render(path.join(__dirname + '/view/login.ejs'), {
		title: 'Umiumiu',
		msg: msg
	});
});

router.post('/login', function(req, res, next) {
	var form = new formidable.IncomingForm();
	form.parse(req, function(error, fields, files) {
		try {
			var data = fs.readFileSync(files.certificate.path, "utf-8");
			data = data.replace(/\r\n|\r/g, "\n").split('\n')
			if (data.length < util.Constant.get('LOGIN_CERTIFICATE_LENGTH')) {
				return res.redirect("/admin/login?msg=" + util.Lang.get('ERROR_LOGIN_CERTIFICATE_ILLEGAL'));
			}
			var username = data[0].substring(data[0].indexOf(':') + 1)
			var userkey = data[1].substring(data[1].indexOf(':') + 1)
			user.getSingleUserByName(username, function(err, user) {
				if (user == null) {
					return res.redirect("/admin/login?msg=" + util.Lang.get('ERROR_LOGIN_USER_NOT_EXIST'))
				}
				if (verift(user, userkey)) {
					afterLogin(res, user);
				} else {
					return res.redirect("/admin/login?msg=" + util.Lang.get('ERROR_LOGIN_USER_VERIFT_FAIL'))
				}
			})
		} catch (err) {
			res.send("The file upload fail!");
		}

	});

});

router.get('/applyAuthorized', function(req, res, next) {
	var msg = req.query.msg;
	var is_tmp = req.query.is_tmp;
	if (req.query.msg == undefined || req.query.msg == null) {
		logger(" applyAuthorized --> msg is invalid");
		msg = "";
	}
	if (req.query.is_tmp == undefined || req.query.is_tmp == null) {
		logger(" applyAuthorized --> msg is invalid");
		is_tmp = 0;
	}
	res.render(path.join(__dirname + '/view/applyauthorized.ejs'), {
		title: 'Umiumiu',
		msg: msg,
		is_tmp: is_tmp
	});
});


router.post('/applyAuthorized', function(req, res, next) {
	user.getSingleUserByEmail(req.body.email, function(err, user) {
		if (err) {
			return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_FAIL'))
		} else {
			if (user !== null) {

				authLog.saveAuth(user, req.body.is_tmp, function(err, token, salt) {

					if (err) {
						return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_FAIL'))
					} else {
						var url = "http://" + req.headers.host + "/admin/confirmAuthorized/token/" + token;
						util.Mail.sendApplyAuthorized(req.body.email, url, salt)
						return res.redirect("/admin/login");
					}
				});

			} else {
				return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_USER_NOT_EXIST'))
			}
		}
	});
});

router.get('/confirmAuthorized/token/:token', function(req, res, next) {
	var token = req.params.token;
	var msg = '';
	if (req.query.msg != undefined && req.query.msg != null) {
		msg = req.query.msg
	}

	res.render(path.join(__dirname + '/view/confirmauthorized.ejs'), {
		title: 'Umiumiu',
		msg: msg,
		token: token
	});
});

router.post('/confirmAuthorized', function(req, res, next) {

	authLog.getAuthLogByToken(req.body.token, function(err, auth_log) {
		if (err) {
			return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_FAIL'))
		} else {
			var time_now = new Date().getTime();
			if (auth_log !== null) {
				console.log(auth_log)
				if (auth_log.salt != req.body.code) {
					return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_CODE'))
				} else if (time_now - auth_log.apply_time >= util.Constant.get('APPLY_CERTIFICATE_TIMEOUT')) {
					return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_TIMEOUT'))
				} else {
					global_create_cert_token = util.Crypto.md5((Math.round(Math.random() * util.Constant.get('RANDOM_START')) + util.Constant.get('RANDOM_OFFSET') + req.body.token));
					var path = "http://" + req.headers.host + "/admin/createCertificate?token=" + global_create_cert_token + "&seed=" + req.body.seed + "&mail=" + auth_log.mail;
					res.writeHead(200, {
						'Content-Type': 'application/force-download',
						'Content-Disposition': 'attachment; filename=login.cert'
					});
					request(path).pipe(res);

				}
			} else {
				return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_TOKEN_ILLEGAL'))
			}
		}
	});
});

router.get('/createCertificate', function(req, res, next) {
	var token = req.query.token;
	var seed = req.query.seed;
	var mail = req.query.mail;
	if (token != global_create_cert_token) {
		res.send(util.Lang.get('ERROR_APPLY_AUTHORIZED_TOKEN_ILLEGAL'));
	} else {
		user.getSingleUserByEmail(mail, function(err, user) {
			if (err) {
				return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_FAIL'))
			} else {
				if (user !== null) {
					createCertificate(user, seed, token, res);
				} else {
					return res.redirect("/admin/applyAuthorized?msg=" + util.Lang.get('ERROR_APPLY_AUTHORIZED_USER_NOT_EXIST'))
				}
			}
		});
	}
});

router.get('/articleedit', function(req, res, next) {
	var id = req.query.id || 0;
	var status = util.Lang.get('ARTICLE_STATUS');
	var current_nav = util.Lang.get('NAV_LIST').ARTICLE;
	util.Cookies.setCookie(res, 'current_nav', current_nav);
	res.render(path.join(__dirname + '/view/articleedit.ejs'), {
		title: 'Umiumiu',
		id: id,
		status: status,
		current_nav: current_nav
	});
});

router.get('/logout', function(req, res, next) {
	util.Cookies.delCookie(res, 'current_nav');
	util.Cookies.delCookie(res, 'user');
	util.Cookies.delCookie(res, 'auth');
	return res.redirect("/admin/login")
});

router.get('/userlist', function(req, res, next) {
	var current_nav = util.Lang.get('NAV_LIST').USER;
	util.Cookies.setCookie(res, 'current_nav', current_nav);
	res.render(path.join(__dirname + '/view/userlist.ejs'), {
		title: 'Umiumiu',
		current_nav: current_nav
	});
});

router.get('/useredit', function(req, res, next) {
	var id = req.query.id || 0;
	var current_nav = util.Lang.get('NAV_LIST').USER;
	util.Cookies.setCookie(res, 'current_nav', current_nav);
	res.render(path.join(__dirname + '/view/useredit.ejs'), {
		title: 'Umiumiu',
		id: id,
		current_nav: current_nav
	});
});

router.get('/admin_dashboard', function(req, res, next) {
	var msg = req.query.msg;
	if (req.query.msg == undefined || req.query.msg == null) {
		msg = '';
	}
	res.render(path.join(__dirname + '/view/admin_dashboard.ejs'),
		adminViewTextElement(msg));
});

router.get('/admin_grouplist', function(req, res, next) {
	var msg = req.query.msg;
	if (req.query.msg == undefined || req.query.msg == null) {
		msg = '';
	}

	admin.getAdminAll(null, null, null, null, function(err, admins) {
		if (err) {
			admins = [];
		}
		logger('grouplist length: ' + admins.length);
		res.render(path.join(__dirname + '/view/admin_grouplist.ejs'), {
			title: strings.getPageTitle('STR_ADMIN_01_01_01'),
			sidebar_dashboard: strings.getPageTitle('STR_ADMIN_01_02_01'),
			sidebar_grouplist: strings.getPageTitle('STR_ADMIN_01_03_01'),
			sidebar_group_ctl: strings.getPageTitle('STR_ADMIN_01_04_01'),
			sidebar_group_add: strings.getPageTitle('STR_ADMIN_01_04_02'),
			sidebar_group_delete: strings.getPageTitle('STR_ADMIN_01_04_03'),
			sidebar_group_edit: strings.getPageTitle('STR_ADMIN_01_04_04'),
			msg: msg,
			admins: admins
		});
	});
});

router.get('/admin_addadmin', function(req, res, next) {
	var msg = req.query.msg;
	if (req.query.msg == undefined || req.query.msg == null) {
		msg = '';
	}
	res.render(path.join(__dirname + '/view/admin_addadmin.ejs'),
		adminViewTextElement(msg));
});

router.post('/admin_addadmin', function(req, res, next) {
	var username = req.body.username;
	var password = req.body.password;
	var email = req.body.email;
	var add_time = new Date().getTime();
	var level = 0;
	var ep = new EventProxy();

	var radios = req.body.optionsRadios;
	if (equals(radios.toString(), 'option1')) {
		level = 1; // 1级管理员
	} else if (equals(radios.toString(), 'option2')) {
		level = 2; // 2级管理员
	} else if (equals(radios.toString(), 'option3')) {
		level = 0; // 普通会员
	}

	ep.on('save_fail', function(errmsg) {
		res.status(200);
		res.render(path.join(__dirname + '/view/admin_error.ejs'), {
			title: strings.getPageTitle('STR_ADMIN_01_01_01'),
			sidebar_dashboard: strings.getPageTitle('STR_ADMIN_01_02_01'),
			sidebar_grouplist: strings.getPageTitle('STR_ADMIN_01_03_01'),
			sidebar_group_ctl: strings.getPageTitle('STR_ADMIN_01_04_01'),
			sidebar_group_add: strings.getPageTitle('STR_ADMIN_01_04_02'),
			sidebar_group_delete: strings.getPageTitle('STR_ADMIN_01_04_03'),
			sidebar_group_edit: strings.getPageTitle('STR_ADMIN_01_04_04'),
			msg: errmsg
		});
	});

	//检查用户名是否已经存在 
	admin.getAdminByEmail(email, function(err, user) {
		if (err) {
			// 通过Email获取用户信息失败
			logger(strings.getPageTitle('STR_ADMIN_ERR_01'));
			ep.emit('save_fail', strings.getPageTitle('STR_ADMIN_ERR_01'));
			return;
		}
		if (user) {
			// 用户已存在
			logger(strings.getPageTitle('STR_ADMIN_ERR_02'));
			ep.emit('save_fail', strings.getPageTitle('STR_ADMIN_ERR_02'));
			return;
		}

		var newUser = {
			username: username,
			password: password,
			email: email,
			add_time: add_time,
			level: level
		}

		//如果不存在则新增用户
		admin.setNewAdmin(newUser, function(err) {
			if (err) {
				// 保存新用户失败
				logger(strings.getPageTitle('STR_ADMIN_ERR_03'));
				ep.emit('save_fail', strings.getPageTitle('STR_ADMIN_ERR_03'));
			}
			logger('Regestor a new user success');
			res.redirect('/admin/admin_dashboard'); //注册成功后返回主页
		});
	});
});

function adminViewTextElement(msg) {
	return {
		title: strings.getPageTitle('STR_ADMIN_01_01_01'),
		sidebar_dashboard: strings.getPageTitle('STR_ADMIN_01_02_01'),
		sidebar_grouplist: strings.getPageTitle('STR_ADMIN_01_03_01'),
		sidebar_group_ctl: strings.getPageTitle('STR_ADMIN_01_04_01'),
		sidebar_group_add: strings.getPageTitle('STR_ADMIN_01_04_02'),
		sidebar_group_delete: strings.getPageTitle('STR_ADMIN_01_04_03'),
		sidebar_group_edit: strings.getPageTitle('STR_ADMIN_01_04_04'),
		msg: msg
	}
}

function logger(loggerContent) {
	console.log("Admin --> index.js -->" + loggerContent);
}

function equals(str1, str2) {
	if (str1 == str2) {
		return true;
	}
	return false;
}

function createCertificate(userObj, seed, code, res) {
	var token_new = util.Crypto.md5(userObj.name + seed + new Date().getTime() + code + "");
	user.updateToken(userObj, token_new, function(err) {
		var key = calcKey(userObj.name, token_new);

		text = "User-Name:" + userObj.name + "\nkey:" + key;

		res.send(text);
	});

}

function verift(user, userkey) {
	var key = calcKey(user.name, user.token);
	return userkey == key;

}

function calcKey(username, code) {

	var CERTIFICATE_KEY_START = util.Constant.get('CERTIFICATE_KEY_START');
	var CERTIFICATE_KEY_MID = util.Constant.get('CERTIFICATE_KEY_MID');
	var CERTIFICATE_KEY_GROUP_NUMS = util.Constant.get('CERTIFICATE_KEY_GROUP_NUMS');
	var CERTIFICATE_KEY_GROUP_START = util.Constant.get('CERTIFICATE_KEY_GROUP_START');
	var CERTIFICATE_KEY_GROUP_MID = util.Constant.get('CERTIFICATE_KEY_GROUP_MID');
	var STANDARD_START = util.Constant.get('STANDARD_START');


	var token = code.substring(CERTIFICATE_KEY_START, CERTIFICATE_KEY_MID) + username + code.substring(CERTIFICATE_KEY_MID);
	token = util.Crypto.md5(token);
	var step = token.length / CERTIFICATE_KEY_GROUP_NUMS;
	var token_list = [];
	for (var i = STANDARD_START; i < CERTIFICATE_KEY_GROUP_NUMS; i++) {
		var sha_key = util.Crypto.sha512(util.Crypto.md5(token.substr(i * step, step).substring(CERTIFICATE_KEY_GROUP_START, CERTIFICATE_KEY_GROUP_MID) + code + token.substr(i * step, step).substring(CERTIFICATE_KEY_GROUP_MID) + util.Crypto.md5(username)), util.Config.get('login_secret').LOGIN_CERTIFICATE_SECRET, 'hex');
		token_list.push(sha_key);
	}

	return util.Crypto.base64(token_list.join(""));

}


// 等待更新auth操作

function afterLogin(res, userObj) {

	user.updateAuth(userObj, function(err, auth) {

		if (!err) {
			util.Cookies.setCookie(res, 'current_nav', util.Lang.get('NAV_LIST').INDEX);
			util.Cookies.setCookie(res, 'user', userObj.name, {
				expires: new Date(Date.now() + util.Constant.get('LOGIN_TIMEOUT'))
			});
			util.Cookies.setCookie(res, 'auth', auth, {
				expires: new Date(Date.now() + util.Constant.get('LOGIN_TIMEOUT'))
			});
			return res.redirect("/admin");
		} else {
			return res.redirect("/admin/login?msg=" + util.Lang.get('ERROR_LOGIN_FAIL'));
		}

	})

}

module.exports = router;