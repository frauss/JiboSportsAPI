(function () {
    "use strict";

    var _ = require('underscore');
    var sprintf = require('sprintf').sprintf;
    var jmespath = require('jmespath');
    var moment = require('moment');

    module.exports = GameResponseFormatter;

    function GameResponseFormatter(gameInfo) {
        this.gameData = gameInfo;

        function formatRescheduleInfo(gameInfo) {
            var responseText = "";
            if (gameInfo.rescheduleInfo && gameInfo.rescheduleInfo.length > 0) {
                responseText = ", the game";
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
                    responseText += sprintf(" and completed on %s",
                        moment(gameInfo.gameTime).format("MMMM DD"));
                }
            }
            return responseText;
        }

        this.formulateResponse = function(queryParams) {
            var self = this;
            var gameResponses = [];

            _.each(this.gameData, function(game) {
                var gameInfo = jmespath.search(game, "game.{ status: status, currentInning: outcome.current_inning, currentInningHalf: outcome.current_inning_half, gameTime: scheduled, venue: venue.name, homeScore: home.runs, awayScore: away.runs, lastInning: final.inning, homeId: home.id, homeName: home.name, awayId: away.id, awayName: away.name, rescheduleInfo: rescheduled}");
                var myTeam = (gameInfo.homeId === self.gameData.queriedTeamId) ? "home" : "away";
                var responseText;
                switch (gameInfo.status) {
                    case "inprogress":
                        if (myTeam === "home") {
                            if (gameInfo.homeScore === gameInfo.awayScore) {
                                responseText = sprintf("The %s are tied with the %s at %d to %d",
                                    gameInfo.homeName, gameInfo.awayName, gameInfo.homeScore, gameInfo.awayScore);
                            }
                            else if (gameInfo.homeScore > gameInfo.awayScore) {
                                responseText = sprintf("The %s are leading the %s %d to %d",
                                    gameInfo.homeName, gameInfo.awayName, gameInfo.homeScore, gameInfo.awayScore);
                            }
                            else {
                                responseText = sprintf("The %s are losing to the %s %d to %d",
                                    gameInfo.homeName, gameInfo.awayName, gameInfo.awayScore, gameInfo.homeScore);
                            }
                        }
                        else {
                            if (gameInfo.homeScore === gameInfo.awayScore) {
                                responseText = sprintf("The %s are tied with the %s at %d to %d",
                                    gameInfo.awayName, gameInfo.homeName, gameInfo.awayScore, gameInfo.homeScore);
                            }
                            else if (gameInfo.homeScore > gameInfo.awayScore) {
                                responseText = sprintf("The %s are losing to the %s %d to %d",
                                    gameInfo.awayName, gameInfo.homeName, gameInfo.homeScore, gameInfo.awayScore);
                            }
                            else {
                                responseText = sprintf("The %s are beating the %s at %d to %d",
                                    gameInfo.awayName, gameInfo.homeName, gameInfo.awayScore, gameInfo.homeScore);
                            }
                        }
                        responseText += sprintf(" in the %s of the %s",
                            ((gameInfo.currentInningHalf === "T") ? "top": "bottom"),
                            ordinalSuffixOf(gameInfo.currentInning));
                        break;

                    case "closed":
                        var decisionParams = {};
                        if (myTeam === "home") {
                            if (gameInfo.homeScore > gameInfo.awayScore) {
                                decisionParams.decision = "beat";
                                decisionParams.winningScore = gameInfo.homeScore;
                                decisionParams.losingScore = gameInfo.awayScore;
                            }
                            else {
                                decisionParams.decision = "lost to";
                                decisionParams.winningScore = gameInfo.awayScore;
                                decisionParams.losingScore = gameInfo.homeScore;
                            }
                            responseText = sprintf("The %s %s the %s %d to %d",
                                gameInfo.homeName, decisionParams.decision, gameInfo.awayName,
                                decisionParams.winningScore, decisionParams.losingScore);
                        }
                        else {
                            if (gameInfo.homeScore > gameInfo.awayScore) {
                                decisionParams.decision = "lost to";
                                decisionParams.winningScore = gameInfo.homeScore;
                                decisionParams.losingScore = gameInfo.awayScore;
                            }
                            else {
                                decisionParams.decision = "beat";
                                decisionParams.winningScore = gameInfo.awayScore;
                                decisionParams.losingScore = gameInfo.homeScore;
                            }
                            responseText = sprintf("The %s %s the %s %d to %d",
                                gameInfo.awayName, decisionParams.decision, gameInfo.homeName,
                                decisionParams.winningScore, decisionParams.losingScore);
                        }
                        if (gameInfo.lastInning !== 9) {
                            responseText += sprintf(" in %d innings", gameInfo.lastInning);
                        }
                        break;

                    case "scheduled":
                        var gameTime = moment(gameInfo.gameTime);
                        if (myTeam === "home") {
                            responseText = sprintf("The %s will play the %s at %s starting at %s",
                                gameInfo.homeName, gameInfo.awayName, gameInfo.venue, gameTime.format("h:mm a"));
                        }
                        else {
                            responseText = sprintf("The %s will play the %s at %s starting at %s",
                                gameInfo.awayName, gameInfo.homeName, gameInfo.venue, gameTime.format("h:mm a"));
                        }
                        break;

                    default:
                        responseText = sprintf("Don't have a formula for formatting a game with status = %s", gameInfo.status);
                        break;
                }
                responseText += formatRescheduleInfo(gameInfo);
                gameResponses.push(responseText);
            });
            return gameResponses.join(' and ');
        };

        /* jshint -W116 */
        function ordinalSuffixOf(i) {
            var j = i % 10,
                k = i % 100;
            if (j == 1 && k != 11) {
                return i + "st";
            }
            if (j == 2 && k != 12) {
                return i + "nd";
            }
            if (j == 3 && k != 13) {
                return i + "rd";
            }
            return i + "th";
        }
    }
}(module.exports));
