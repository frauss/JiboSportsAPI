"use strict";

var config = require('config');
var express = require('express');
var bodyParser = require('body-parser');
var log4js = require('log4js');
var sprintf = require("sprintf").sprintf;

var logConfig = config.get('Logging');
log4js.configure(logConfig);
var logger = log4js.getLogger();

var siteConfig = config.get('site');

var port = siteConfig.port || process.env.PORT || 6543;

var app = express();
app.use(bodyParser.json({ type: "application/json" }));

var healthCheckRouter = require('./Routes/healthCheckRouter.js')(express, logger);
var sportsRouter = require('./Routes/sportsRouter.js')(express, config, logger);

app.use('/jibosports', sportsRouter, healthCheckRouter);

app.listen(port, function() {
    logger.info(sprintf('Started listening on %d', port));
});

