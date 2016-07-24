var sprintf = require('sprintf').sprintf;

var routes = function (express, logger) {
    var healthCheckResponse = {
        "IsSuccess": false,
        "Message": null,
        "ElapsedTime": null
    };
    var router = express.Router();
    router.logger = logger;
    router.route('/healthcheck')
        .get(function (request, response) {
            var timer = process.hrtime();
            var message = "This is our health check!";
            logger.info(message);
            healthCheckResponse.Message = message;
            healthCheckResponse.IsSuccess = true;
            healthCheckResponse.ElapsedTime = timer;

            router.logger.trace("Health Check called");

            return response.status(200).json(healthCheckResponse);
        });
    return router;
}
module.exports = routes;
