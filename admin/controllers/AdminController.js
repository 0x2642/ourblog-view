var EventProxy = require('eventproxy');
var strings = require('../strings.js');
var path = require("path");
var Dao = require('../../dao/indexDAO.js');
var admin = Dao.Admin;
var utils = require('../../util/crypto');

exports.dashboardIndex = function(req, res, next) {
	admin.getAdminAll(null, null, null, null, function(err, admins) {
		if (err) {
			admins = [];
		}
		logger('grouplist length: ' + admins.length);
		res.render(path.join(getViewPath() + 'view/admin_dashboard.ejs'),
			adminViewTextElement('', admins));
	});
}

exports.addAdminIndex = function(req, res, next) {
	res.render(path.join(getViewPath() + 'view/admin_addadmin.ejs'),
		adminViewTextElement());
}

exports.groupListIndex = function(req, res, next) {
	admin.getAdminAll(null, null, null, null, function(err, admins) {
		if (err) {
			admins = [];
		}
		logger('grouplist length: ' + admins.length);
		res.render(path.join(getViewPath() + 'view/admin_grouplist.ejs'),
			adminViewTextElement('', admins));
	});
}

exports.removeAdminIndex = function(req, res, next) {
	admin.getAdminAll(null, null, null, null, function(err, admins) {
		if (err) {
			admins = [];
		}
		logger('grouplist length: ' + admins.length);
		res.render(path.join(getViewPath() + 'view/admin_deladmin.ejs'),
			adminViewTextElement('', admins));
	});
}

exports.addAdmin = function(req, res, next) {
	var username = req.body.username;
	var password = req.body.password;
	var email = req.body.email;
	var add_time = new Date().getTime();
	var level = 0;
	var ep = new EventProxy();
	ep.fail(next);

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
		res.render(path.join(getViewPath() + 'view/admin_error.ejs'),
			adminViewTextElement(errmsg));
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
			password: utils.md5(password),
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
			res.redirect('/admin/admin_dashboard');
		});
	});
}

exports.removeAdminAll = function(req, res, next) {
	var ep = new EventProxy();
	ep.fail(next);

	ep.on('delete_fail', function(errMsg) {
		res.status(200);
		res.render(path.join(getViewPath() + 'view/admin_error.ejs'),
			adminViewTextElement(errmsg));
	});

	admin.deleteAllAdmins(function(err) {
		if (err) {
			logger(strings.getPageTitle('STR_ADMIN_ERR_04'));
			ep.emit('delete_fail', strings.getPageTitle('STR_ADMIN_ERR_04'));
		}
		logger('Delete all users success');
		res.redirect('/admin/admin_dashboard');
	});
}

exports.removeAdminAtX = function(req, res, next) {
	var ep = new EventProxy();
	var email = req.params.email;
	ep.fail(next);

	ep.on('delete_fail', function(errMsg) {
		res.status(200);
		res.render(path.join(getViewPath() + 'view/admin_error.ejs'),
			adminViewTextElement(errmsg));
	});

	admin.deleteCertainAdmins(email, function(err) {
		if (err) {
			logger(strings.getPageTitle('STR_ADMIN_ERR_04'));
			ep.emit('delete_fail', strings.getPageTitle('STR_ADMIN_ERR_04'));
		}
		logger('Delete email: '+ email + ' users success');
		res.redirect('/admin/admin_dashboard');
	});
}

function adminViewTextElement(msg, admins) {
	var msg = msg || '';
	var admins = admins || [];
	return {
		title: strings.getPageTitle('STR_ADMIN_01_01_01'),
		sidebar_dashboard: strings.getPageTitle('STR_ADMIN_01_02_01'),
		sidebar_grouplist: strings.getPageTitle('STR_ADMIN_01_03_01'),
		sidebar_group_ctl: strings.getPageTitle('STR_ADMIN_01_04_01'),
		sidebar_group_add: strings.getPageTitle('STR_ADMIN_01_04_02'),
		sidebar_group_delete: strings.getPageTitle('STR_ADMIN_01_04_03'),
		sidebar_group_edit: strings.getPageTitle('STR_ADMIN_01_04_04'),
		msg: msg,
		admins: admins
	}
}

function logger(loggerContent) {
	console.log("AdminController --> " + loggerContent);
}

function getViewPath() {
	var base_str = path.basename(__dirname);
	return __dirname.split(base_str)[0];
}

function equals(str1, str2) {
	if (str1 == str2) {
		return true;
	}
	return false;
}