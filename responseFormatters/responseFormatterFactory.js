(function () {
    "use strict";

    var GameResponseFormatter = require('./gameResponseFormatter');
    var StandingsResponseFormatter = require('./standingsResponseFormatter');

    var ResponseFormatterFactory = {
        getFormatter: function (type, data) {
            switch (type) {
                case "game":
                    return new GameResponseFormatter(data);

                case "standings":
                    return new StandingsResponseFormatter(data);
            }
        }
    };

    module.exports = ResponseFormatterFactory;
})(module.exports);
