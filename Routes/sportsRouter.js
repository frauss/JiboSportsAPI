"use strict";

var sprintf = require("sprintf").sprintf;
var _ = require('underscore');
var moment = require('moment');
var jmespath = require('jmespath');
var async = require('async');

var SportRadarAPI = require('../sportRadarAPI');
var ResponseFormatterFactory = require('../responseFormatters/responseFormatterFactory');

var routes = function (express, config, logger) {
    var router = express.Router();
    router.config = config;
    router.logger = logger;
    router.mlbAPI = new SportRadarAPI('MLB', config);

    router.route('/findgame')
        .post(function (request, response) {
            response.header("Content-Type",'application/json');
            var responseBody = {};
            var gameDate = analyzeDate(request.body.date);
            if (gameDate) {
                analyzeTeam(request.body.team, function(err, foundTeams) {
                    if (err) {
                        responseBody.error = sprintf("Error retrieving team info for %s: %s",
                            request.body.team, err);
                        response.status(500).send(JSON.stringify(responseBody));
                    }
                    else if (foundTeams.length === 0) {
                        responseBody.error = sprintf("No team found for %s",
                            request.body.team);
                        response.status(404).send(JSON.stringify(responseBody));
                    }
                    else if (foundTeams.length > 1) {
                        responseBody.error = sprintf("Multiple teams found for argument %s", request.body.team);
                        responseBody.teams = foundTeams;
                        response.status(200).send(JSON.stringify(responseBody));
                    }
                    else {
                        findGames(gameDate, foundTeams[0], function(err, gameInfo) {
                            if (gameInfo.length > 0) {

                                // Need this to respond properly for the team asked for
                                gameInfo.queriedTeamId = foundTeams[0].id;
                                var responder = ResponseFormatterFactory.getFormatter("game", gameInfo);
                                responseBody.responseText = responder.formulateResponse(request.body);
                                response.status(200).send(JSON.stringify(responseBody));
                            }
                            else {
                                responseBody.error = sprintf("No games found for %s on %s",
                                    request.body.team, gameDate.format("dddd MMMM Do"));
                                response.status(404).send(JSON.stringify(responseBody));
                            }
                        });
                    }
                });
            }
            else {
                responseBody.error = sprintf("Invalid date argument specified: %s", request.body.date);
                response.status(500).send(JSON.stringify(responseBody));
            }
        });

    router.route('/findstanding')
        .post(function (request, response) {
            response.header("Content-Type", 'application/json');
            var responseBody = {};
            analyzeTeam(request.body.team, function(err, foundTeams) {
                if (err) {
                    responseBody.error = sprintf("Error retrieving team info for %s: %s",
                        request.body.team, err);
                    response.status(500).send(JSON.stringify(responseBody));
                }
                else if (foundTeams.length === 0) {
                    responseBody.error = sprintf("No team found for %s",
                        request.body.team);
                    response.status(404).send(JSON.stringify(responseBody));
                }
                else if (foundTeams.length > 1) {
                    responseBody.error = sprintf("Multiple teams found for argument %s", request.body.team);
                    responseBody.teams = foundTeams;
                    response.status(200).send(JSON.stringify(responseBody));
                }
                else {
                    findStanding(foundTeams[0], function(err, standingInfo) {
                        if (standingInfo) {
                            var responder = ResponseFormatterFactory.getFormatter("standings", standingInfo);
                            responseBody.responseText = responder.formulateResponse(request.body);
                            response.status(200).send(JSON.stringify(responseBody));
                        }
                        else {
                            responseBody.error = sprintf("No standings found for %s",
                                request.body.team);
                            response.status(404).send(JSON.stringify(responseBody));
                        }
                    });
                }
            });
        });

    function analyzeDate(dateText) {
        var returnDate;

        if (!dateText || 0 === dateText.length) {
            returnDate = moment();
        }
        else if (/to(day|night)/i.test(dateText)) {
            returnDate = moment();
        }
        else if (/(yesterday|last night)/i.test(dateText)) {
            returnDate = moment().subtract(1, 'days');
        }
        else if (/tomorrow/i.test(dateText)) {
            returnDate = moment().add(1, 'days');
        }
        else {
            returnDate = parseSpecificDate(dateText);
        }
        return returnDate;
    }

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
    }

    function findGames(gameDate, team, callback) {
        router.mlbAPI.getSchedule(gameDate, function(err, scheduleInfo) {
            var foundGames = [];
            if (err) {
                router.logger.error(sprintf("Error getting schedule info: %s", err));
                callback(err, null);
            }
            else {
                var teamClause = sprintf("home_team=='%s'||away_team=='%s'",
                    team.id, team.id);
                var gameQuery = sprintf("league.games[?%s]", teamClause);
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

    function findStanding(team, callback) {
        router.mlbAPI.getStandings(function(err, standingInfo) {
            if (err) {
                router.logger.error(sprintf("Error getting standing info: %s", err));
                callback(err, null);
            }
            else {
                // This gets ugly as it would be nice to be able to traverse upward through a structure
                var leagues = standingInfo.league.season.leagues;
                var foundTeam = false;
                var foundTeamInfo = {};
                for (var leagueIndex = 0; !foundTeam && leagueIndex < leagues.length; leagueIndex++) {
                    var divisions = leagues[leagueIndex].divisions;
                    for (var divisionIndex = 0; !foundTeam && divisionIndex < divisions.length; divisionIndex++) {
                        var teams = divisions[divisionIndex].teams;
                        for (var teamIndex = 0; !foundTeam && teamIndex < teams.length; teamIndex++) {
                            if (teams[teamIndex].id === team.id) {
                                foundTeamInfo = {
                                    league: {
                                        name: leagues[leagueIndex].name,
                                        id: leagues[leagueIndex].id
                                    },
                                    division: {
                                        name: divisions[divisionIndex].name,
                                        id: divisions[divisionIndex].id
                                    },
                                    team: teams[teamIndex]
                                };
                                foundTeamInfo.team.position = teamIndex + 1;
                                foundTeam = true;
                            }
                        }
                    }
                }
                if (!foundTeam) {
                    err = new Error(sprintf("Error finding team %s in standings: %s",
                        team.name, err));
                    router.logger.error(err.message);
                    callback(err, null);
                }
                else {
                    callback(null, foundTeamInfo);
                }
            }
        });
    }

    function parseSpecificDate(dateText) {
        //var specificDateRegex = /\b((?:(?:Mon)|(?:Tues?)|(?:Wed(?:nes)?)|(?:Thur?s?)|(?:Fri)|(?:Sat(?:ur)?)|(?:Sun))(?:day)?)?[:\-,]?\s*((?:(?:jan|feb)?r?(?:uary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|oct(?:ober)?|(?:sept|nov|dec)(?:ember)?))\s+(\d{1,2})\s*(,?\s*(\d{4}))?/i;
        var specificDateRegex = /\b((?:(?:Mon)|(?:Tues?)|(?:Wed(?:nes)?)|(?:Thur?s?)|(?:Fri)|(?:Sat(?:ur)?)|(?:Sun))(?:day)?)?[:\-,]?\s*(((?:(?:jan|feb)?r?(?:uary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|oct(?:ober)?|(?:sept|nov|dec)(?:ember)?))\s+(\d{1,2}))?\s*(,?\s*(\d{4}))?/i;
        var matches = specificDateRegex.exec(dateText);
        var returnDate;
        if (matches) {
            if (matches[1] && !matches[2]) {
                returnDate = moment().day(matches[1]);
            }
            else {
                if (!matches[2] || !matches[3]) {
                    router.logger.error("Must provide at least the dayname or month and day.");
                    return null;
                }
                var specificDateText = sprintf("%s %s %s", matches[2], matches[3], (matches[4] ? matches[4] : moment().format("YYYY")));
                returnDate = moment(specificDateText, "MMM DD, YYYY");
            }
        }
        return returnDate;
    }
    return router;
};

module.exports = routes;
