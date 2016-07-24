(function () {
    "use strict";

    var _ = require('underscore');
    var sprintf = require('sprintf').sprintf;
    var jmespath = require('jmespath');
    var moment = require('moment');

    module.exports = ResponseFormatter;

    function ResponseFormatter(gameInfo) {
        this.gameData = gameInfo;

        function formatRescheduleInfo(gameInfo) {
            var responseText;
            if (gameInfo.rescheduleInfo && gameInfo.rescheduleInfo.length > 0) {
                responseText = ", the game"
                var rescheduleEvents = [];
                _.each(gameInfo.rescheduleInfo, function (rescheduleEvent) {
                    var rescheduleTime = moment(rescheduleEvent.from);
                    var rescheduleText = sprintf(" was %s on %s",
                        rescheduleEvent.reason,
                        rescheduleTime.format("MMMM D"));
                    rescheduleEvents.push(rescheduleText);
                });
                responseText += rescheduleEvents.join(" and ");
                if (gameInfo.status === "closed") {
                    responseText += sprintf("%s and completed on %s",
                        rescheduleEvents.join(" and "),
                        moment(gameInfo.gameTime).format("MMMM DD"));
                }
            }
            return responseText;
        }

        this.formulateResponse = function() {
            var gameResponses = [];
            _.each(this.gameData, function(game) {
                // First see if game is "closed" aka "final"
                var gameInfo = jmespath.search(game, "game.{status: status, gameTime: scheduled, venue: venue.name, homeScore: home.runs, awayScore: away.runs, lastInning: final.inning, homeName: home.name, awayName: away.name, rescheduleInfo: rescheduled}");
                var responseText;
                if (gameInfo.status === "closed") {
                    if (gameInfo.awayScore > gameInfo.homeScore) {
                        responseText = sprintf("The %s beat the %s %d to %d",
                            gameInfo.awayName, gameInfo.homeName, gameInfo.awayScore, gameInfo.homeScore);
                    }
                    else {
                        responseText = sprintf("The %s beat the %s %d to %d",
                            gameInfo.homeName, gameInfo.awayName, gameInfo.homeScore, gameInfo.awayScore);
                    }
                    if (gameInfo.lastInning !== 9) {
                        responseText += sprintf(" in %d innings", gameInfo.lastInning);
                    }
                }
                else if (gameInfo.status === "scheduled") {
                    var gameTime = moment(gameInfo.gameTime);
                    responseText = sprintf("The %s will play the %s at %s starting at %s",
                        gameInfo.awayName, gameInfo.homeName, gameInfo.venue, gameTime.format("h:mm a"));
                }
                responseText += formatRescheduleInfo(gameInfo);
                gameResponses.push(responseText);
            });
            return gameResponses.join(' and ');
        };
    }
}(module.exports));
