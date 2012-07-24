'use strict';

var crypto = require('crypto');
var events = require('events');
var http = require('http');
var https = require('https');
var querystring = require('querystring');
var tty = require('tty');
var util = require('util');

var API_HOST = "avocado.io";
var API_PORT = 443;
var API_URL_BASE = "/api/";
var API_URL_LOGIN =  API_URL_BASE + "authentication/login";
var API_URL_COUPLE = API_URL_BASE + "couple";
var AVOCADO_COOKIE_NAME = "user_email";
var AVOCADO_USER_AGENT = "Avocado Test Api Client v.1.0";
var ERROR_MSG = "FAILED.  Signature was tested and failed. Try again and check the auth information.";


/**
 * @constructor
 */
function AvocadoAPI() {
  this.authClient = new AuthClient();
}

AvocadoAPI.errorAndExit = function(data) {
  if (data) process.stdout.write(data + "\n");
  console.log(ERROR_MSG);
  process.exit();
};

/** @param {Object} */
AvocadoAPI.prototype.couple = null;

AvocadoAPI.prototype.didUpdateFromCommandLine = function(coupleData) {
  this.couple = JSON.parse(coupleData);
  console.log("SUCCESS.\n\nBelow is your Avocado API signature:\n",
              this.authClient.signature);
  process.exit();
};

AvocadoAPI.prototype.updateFromCommandLine = function() {
  var coupleRequest = new ApiGetRequest(this.authClient, API_URL_COUPLE);
  coupleRequest.once(ApiRequestEvent.SUCCESS,
    this.didUpdateFromCommandLine.bind(this));
  coupleRequest.once(ApiRequestEvent.ERROR, function() {
    console.log(coupleRequest.getOptions());
    AvocadoAPI.errorAndExit();
  });

  var signatureRequest = new SignatureRequest(this.authClient);
  signatureRequest.once(ApiRequestEvent.SUCCESS, function() {
    coupleRequest.send();
  });
  signatureRequest.once(ApiRequestEvent.ERROR, function() {
    AvocadoAPI.errorAndExit();
  });

  this.authClient.once(AuthClient.Events.UPDATED, function() {
    signatureRequest.send();
  });
  this.authClient.updateFromCommandLine();
};


/**
 * @constructor
 * @extends {events.EventEmitter}
 */
function AuthClient() {
  events.EventEmitter.apply(this);

  this.cookieValue = null;
  this.signature = null;
  this.email = null;
  this.password = null;
  this.devId = null;
  this.devKey = null;

  this.prompts = {
    EMAIL: 'Email of an Avocado account: ',
    PASSWORD: 'Password: ',
    DEV_ID: 'Developer ID: ',
    DEV_KEY: 'Developer key: '
  };
  this.currentPromptIndex = 0;
}
util.inherits(AuthClient, events.EventEmitter);

AuthClient.Events = {
  UPDATED: 'io.avocado.authclient.updated'
};

AuthClient.prototype.updateFromCommandLine = function() {
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  this.promptForInput();
};

AuthClient.prototype.onPromptAnswer = function(chunk) {
  chunk = chunk.toString().trim();

  var currentQuestion = this.getCurrentPromptQuestion();

  if (currentQuestion == this.prompts.EMAIL) {
    this.email = chunk;
  }
  if (currentQuestion == this.prompts.PASSWORD) {
    this.password = chunk;
    tty.setRawMode(false);
  }
  if (currentQuestion == this.prompts.DEV_ID) {
    this.devId = chunk;
  }
  if (currentQuestion == this.prompts.DEV_KEY) {
    this.devKey = chunk;
  }

  this.currentPromptIndex++;
  if (this.currentPromptIndex >= this.getPromptsAsArray().length) {
    this.emit(AuthClient.Events.UPDATED);
    return;
  }
  this.promptForInput();
};

AuthClient.prototype.getPromptsAsArray = function() {
  return Object.keys(this.prompts);
};

AuthClient.prototype.getCurrentPrompt = function() {
  return this.getPromptsAsArray()[this.currentPromptIndex];
};

AuthClient.prototype.getCurrentPromptQuestion = function() {
  return this.prompts[this.getCurrentPrompt()];
};

AuthClient.prototype.promptForInput = function() {
  var question = this.getCurrentPromptQuestion();
  process.stdout.write(question);
  if (question == this.prompts.PASSWORD) {
    this.hidePromptValue();
  } else {
    this.showPromptValue();
  }
};

AuthClient.prototype.showPromptValue = function() {
  tty.setRawMode(false);
  process.stdin.removeAllListeners();
  process.stdin.on('data', this.onPromptAnswer.bind(this));
};

AuthClient.prototype.hidePromptValue = function() {
  tty.setRawMode(true);
  var hiddenValue = '';
  var self = this;
  process.stdin.removeAllListeners();
  process.stdin.on('data', function (char) {
    char = char + "";

    switch (char) {
      case "\n": case "\r": case "\u0004":
        // When typing is finished...
        tty.setRawMode(false);
        console.log("\r");
        self.onPromptAnswer(hiddenValue);
        break;
      case "\u0003":
        // Ctrl-C
        console.log('Cancelled');
        process.exit();
        break;
      default:
        // NOTE: If desired, output char replacements here via process.stdout.write.
        hiddenValue += char;
        break;
    }
  });
}


/**
 * @constructor
 * @extends {events.EventEmitter}
 */
function SignatureRequest(authClient) {
  events.EventEmitter.apply(this);
  this.authClient = authClient;
}
util.inherits(SignatureRequest, events.EventEmitter);

SignatureRequest.options = {
  host: API_HOST,
  port: API_PORT,
  path: API_URL_LOGIN,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': AVOCADO_USER_AGENT
  },
  method: 'POST'
};

SignatureRequest.prototype.send = function() {
  this.request = https.request(SignatureRequest.options,
    this.onRequestSuccess.bind(this));
  this.request.write(querystring.stringify({
    'email' : this.authClient.email,
    'password': this.authClient.password
  }));
  this.request.end();
  this.request.on('error', this.onRequestError.bind(this));
};

SignatureRequest.prototype.onRequestSuccess = function(response) {
  this.response = response;
  this.response.on('data', this.parseResponse.bind(this));
};

SignatureRequest.prototype.onRequestError = function(e) {
  console.error(e);
  this.emit(ApiRequestEvent.ERROR);
};

SignatureRequest.prototype.getUserCookieValue = function() {
  var respCookieString = this.response.headers['set-cookie'][0];
  var cookies = {};
  respCookieString.split(';').forEach(function(cookie) {
    var name = cookie.substring(0, cookie.indexOf('='));
    var value = cookie.substring(name.length + 1, cookie.length);
    cookies[name.trim()] = (value || '').trim();
  });
  return cookies[AVOCADO_COOKIE_NAME];
};

SignatureRequest.prototype.getHashedUserToken = function() {
  var hasher = crypto.createHash('sha256');
  hasher.update(this.authClient.cookieValue + this.authClient.devKey);
  return hasher.digest('hex');
}

SignatureRequest.prototype.parseResponse = function(data) {
  if (data) data = data.toString();

  if (this.response.statusCode != 200) {
    console.log(data);
    this.emit(ApiRequestEvent.ERROR);
    return;
  }

  this.authClient.cookieValue = this.getUserCookieValue();
  this.authClient.signature = this.authClient.devId + ":" + this.getHashedUserToken();
  this.emit(ApiRequestEvent.SUCCESS, data);
};


var ApiRequestEvent = {
  SUCCESS: 'io.avocado.request.success',
  ERROR: 'io.avocado.request.error'
};


/**
 * @constructor
 * @extends {events.EventEmitter}
 */
function ApiGetRequest(authClient, path) {
  events.EventEmitter.apply(this);
  this.authClient = authClient;
  this.path = path;
}
util.inherits(ApiGetRequest, events.EventEmitter);

ApiGetRequest.prototype.getOptions = function() {
  return {
    host: API_HOST,
    port: API_PORT,
    path: this.path,
    headers: {
      'Cookie': AVOCADO_COOKIE_NAME + '=' + this.authClient.cookieValue,
      'X-AvoSig': this.authClient.signature
    },
    method: 'GET',
    'User-Agent': AVOCADO_USER_AGENT
  };
};

ApiGetRequest.prototype.send = function() {
  this.request = https.request(this.getOptions(),
    this.onRequestSuccess.bind(this));
  this.request.end();
  this.request.on('error', this.onRequestError.bind(this));
};

ApiGetRequest.prototype.onRequestSuccess = function(response) {
  this.response = response;
  this.response.on('data', this.parseResponse.bind(this));
};

ApiGetRequest.prototype.onRequestError = function(e) {
  console.error(e);
  this.emit(ApiRequestEvent.ERROR);
};

ApiGetRequest.prototype.parseResponse = function(data) {
  if (data) data = data.toString();

  if (this.response.statusCode != 200) {
    this.emit(ApiRequestEvent.ERROR);
    return;
  }
  this.emit(ApiRequestEvent.SUCCESS, data);
};


// Comment these out if you don't want to use this as a command-line script.
var api = new AvocadoAPI();
api.updateFromCommandLine();
