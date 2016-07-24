var sprintf = require("sprintf").sprintf;
var _ = require('underscore');
var moment = require('moment');
var jmespath = require('jmespath');
var async = require('async');

var SportRadarAPI = require('../sportRadarAPI');
var ResponseFormatter = require('../responseFormatter');

var routes = function (express, config, logger) {
    var router = express.Router();
    router.config = config;
    router.logger = logger;
    router.mlbAPI = new SportRadarAPI('MLB', config);

    router.route('/findgame')
        .post(function (request, response) {
            response.header("Content-Type",'application/text');
            var gameDate = analyzeDate(request.body.dateArg);
            if (gameDate) {
                analyzeTeam(request.body.teamArg, function(err, foundTeams) {
                    if (err) {
                        response.status(500).send(sprintf("Error retrieving team info for %s: %s",
                            request.body.teamArg, err));
                    }
                    else {
                        if (foundTeams.length === 0) {
                            response.status(404).send(sprintf("No team found for %s",
                                request.body.teamArg));
                        }
                        else {
                            findGames(gameDate, foundTeams, function(err, gameInfo) {
                                if (gameInfo.length > 0) {
                                    var responder = new ResponseFormatter(gameInfo);
                                    var responseText = responder.formulateResponse();
                                    response.status(200).send(responseText);
                                }
                                else {
                                    response.status(404).send(sprintf("No games found for %s on %s",
                                        request.body.teamArg, gameDate.format("dddd MMMM Do")));
                                }
                            });
                        }
                    }
                });
            }
            else {
                response.status(500).send(sprintf("Invalid date argument specified: %s", request.body.dateArg));
            }
        });

    function analyzeDate(dateText) {
        var returnDate;
        if (/today/i.test(dateText)) {
            returnDate = moment();
        }
        else if (/yesterday/i.test(dateText)) {
            returnDate = moment().subtract(1, 'days');
        }
        else if (/tomorrow/i.test(dateText)) {
            returnDate = moment().add(1, 'days');
        }
        else {
            returnDate = parseSpecificDate(dateText);
        }
        return returnDate;
    };

    function analyzeTeam(teamText, callback) {
        router.mlbAPI.getSportHierarchy(function (err, hierarchyData) {
            var foundTeams = [];
            if (err) {
                router.logger.error(sprintf("Error getting sport hierarchy: %s", err));
            }
            else {
                var teamInfo = jmespath.search(hierarchyData, "leagues[].divisions[].teams[]");
                _.each(teamInfo, function(team, index, list) {
                    var teamRegex = new RegExp(team.name, "i");
                    var marketRegex = new RegExp(team.market, "i");
                    if (teamRegex.test(teamText) || marketRegex.test(teamText)) {
                        foundTeams.push(team);
                    }
                });
            }
            callback(err, foundTeams);
        });
    };

    function findGames(gameDate, teams, callback) {
        router.mlbAPI.getSchedule(gameDate, function(err, scheduleInfo) {
            var foundGames = [];
            if (err) {
                router.logger.error(sprintf("Error getting schedule info: %s", err));
                callback(err, null);
            }
            else {
                var teamClauses = [];
                _.each(teams, function(team) {
                    var clause = sprintf("home_team=='%s'||away_team=='%s'",
                        team.id, team.id);
                    teamClauses.push(clause);
                });
                var gameQuery = sprintf("league.games[?%s]", teamClauses.join("||"));
                foundGames = jmespath.search(scheduleInfo, gameQuery);
                var boxScores = [];
                async.forEach(foundGames, function(game, nextGame) {
                    router.mlbAPI.getBoxScore(game.id, function(err, gameInfo) {
                        if (err) {
                            router.logger.error(sprintf("Error getting box score info for game id = %s: %s",
                                game.id, err));
                            nextGame(err);
                        }
                        else {
                            boxScores.push(gameInfo);
                            nextGame(null);
                        }
                    });
                },
                function (err) {
                    callback(err, boxScores);
                });
            }
        });
    }

    function parseSpecificDate(dateText) {
        var specificDateRegex = /\b((?:(?:Mon)|(?:Tues?)|(?:Wed(?:nes)?)|(?:Thur?s?)|(?:Fri)|(?:Sat(?:ur)?)|(?:Sun))(?:day)?)?[:\-,]?\s*((?:(?:jan|feb)?r?(?:uary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|oct(?:ober)?|(?:sept|nov|dec)(?:ember)?))\s+(\d{1,2})\s*(,?\s*(\d{4}))?/i;
        var matches = specificDateRegex.exec(dateText);
        var returnDate;
        if (matches) {
            if (!matches[2] || !matches[3]) {
                router.logger.error("Must provide at least month and day in specific date.");
                return null;
            }
            var specificDateText = sprintf("%s %s %s", matches[2], matches[3], (matches[4] ? matches[4] : moment().format("YYYY")));
            returnDate = moment(specificDateText, "MMM DD, YYYY");
        }
        return returnDate;
    }
    return router;
}

module.exports = routes;
