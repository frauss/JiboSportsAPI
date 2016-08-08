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
            var gameDateInfo = analyzeDate(request.body.date);
            if (gameDateInfo.time) {
                analyzeTeam(request.body.team, function(err, foundTeams) {
                    if (err) {
                        responseBody.error = sprintf("There was an error finding team info for %s: %s",
                            request.body.team, err);
                        response.status(500).send(JSON.stringify(responseBody));
                    }
                    else if (foundTeams.length === 0) {
                        responseBody.responseText = sprintf("I could not find a team for %s",
                            request.body.team);
                        response.status(200).send(JSON.stringify(responseBody));
                    }
                    else if (foundTeams.length > 1) {
                        responseBody.error = sprintf("I found multiple teams for %s, please be more specific", request.body.team);
                        responseBody.teams = foundTeams;
                        response.status(200).send(JSON.stringify(responseBody));
                    }
                    else {
                        findGames(gameDateInfo.time, foundTeams[0], function(err, gameInfo) {
                            if (gameInfo.length > 0) {

                                // Need this to respond properly for the team asked for
                                gameInfo.queriedTeamId = foundTeams[0].id;
                                gameInfo.gameDateInfo = gameDateInfo;
                                var responder = ResponseFormatterFactory.getFormatter("game", gameInfo);
                                responseBody.responseText = responder.formulateResponse(request.body);
                                response.status(200).send(JSON.stringify(responseBody));
                            }
                            else {
                                responseBody.responseText = sprintf("I could not find a game for %s on %s",
                                    request.body.team, gameDateInfo.time.format("dddd MMMM Do"));
                                response.status(200).send(JSON.stringify(responseBody));
                            }
                        });
                    }
                });
            }
            else {
                responseBody.responseText = sprintf("I could not understand the date specified: %s", request.body.date);
                response.status(200).send(JSON.stringify(responseBody));
            }
        });

    router.route('/findstanding')
        .post(function (request, response) {
            response.header("Content-Type", 'application/json');
            var responseBody = {};
            analyzeTeam(request.body.team, function(err, foundTeams) {
                if (err) {
                    responseBody.error = sprintf("There was an error finding team info for %s: %s",
                        request.body.team, err);
                    response.status(500).send(JSON.stringify(responseBody));
                }
                else if (foundTeams.length === 0) {
                    responseBody.responseText = sprintf("I could not find a team for %s",
                        request.body.team);
                    response.status(200).send(JSON.stringify(responseBody));
                }
                else if (foundTeams.length > 1) {
                    responseBody.error = sprintf("I found multiple teams for %s, please be more specific", request.body.team);
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
                            responseBody.error = sprintf("I could not find standings found for %s",
                                request.body.team);
                            response.status(404).send(JSON.stringify(responseBody));
                        }
                    });
                }
            });
        });

    router.route('/findgamebetween')
        .post(function (request, response) {
            response.header("Content-Type", 'application/json');
            var responseBody = {};
            var gameTeams = [];
            async.forEach(request.body.teams, function(teamToFind, nextTeam){
                analyzeTeam(teamToFind, function(err, foundTeams) {
                        if (err) {
                            responseBody.error = sprintf("There was an error finding team info for %s: %s",
                                teamToFind);
                            response.status(500);
                            nextTeam(err);
                        }
                        else if (foundTeams.length === 0) {
                            responseBody.responseText = sprintf("I could not find a team for %s",
                                teamToFind);
                            response.status(200);
                            nextTeam("NoTeamFound");
                        }
                        else if (foundTeams.length > 1) {
                            responseBody.error = sprintf("I found multiple teams for %s, please be more specific",
                                teamToFind);
                            responseBody.teams = foundTeams;
                            response.status(200);
                            nextTeam("MultipleTeamsFound");
                        }
                        else {
                            gameTeams.push(foundTeams[0]);
                            nextTeam(null);
                        }
                });
            },
            function (err) {
                if (err) {
                    response.send(JSON.stringify(responseBody));
                }
                else {
                    findNextGameBetween(gameTeams, function(err, gameInfo) {
                        if (gameInfo) {
                            var gameArray = [gameInfo];
                            var responder = ResponseFormatterFactory.getFormatter("game", gameArray);
                            responseBody.responseText = responder.formulateResponse(request.body);
                            response.status(200).send(JSON.stringify(responseBody));
                        }
                        else {
                            responseBody.responseText = sprintf("I could not find a game in the future between the %s and the %s",
                                gameTeams[0].name, gameTeams[1].name);
                            response.status(200).send(JSON.stringify(responseBody));
                        }
                    });
                }
            });
        });

    function analyzeDate(dateText) {
        var returnDateInfo = {};

        if (!dateText || 0 === dateText.length) {
            returnDateInfo.time = moment();
        }
        else if (/to(day|night)/i.test(dateText)) {
            returnDateInfo.time = moment();
        }
        else if (/(yesterday|last night)/i.test(dateText)) {
            returnDateInfo.time = moment().subtract(1, 'days');
        }
        else if (/tomorrow/i.test(dateText)) {
            returnDateInfo.time = moment().add(1, 'days');
        }
        else {
            returnDateInfo.time = parseSpecificDate(dateText);
        }
        if (returnDateInfo.time) {
            returnDateInfo.isToday = returnDateInfo.time.isSame(moment(), 'days');
        }
        return returnDateInfo;
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

    function findNextGameBetween(teams, callback) {
        router.mlbAPI.getSeasonSchedule(function(err, scheduleInfo) {
            var foundGames = [];
            if (err) {
                router.logger.error(sprintf("Error getting schedule info: %s", err));
                callback(err, null);
            }
            else {
                var today = moment().format("YYYY-MM-DDTHH:mm:ssZ");
                var gameQuery = sprintf("league.season.games[?((home_team == '%s' && away_team == '%s') || (home_team == '%s' && away_team == '%s')) && scheduled > '%s']",
                    teams[0].id, teams[1].id, teams[1].id, teams[0].id, today);
                foundGames = jmespath.search(scheduleInfo, gameQuery);
                if (foundGames.length > 0) {
                    var sortedGames = foundGames.sort(function (a, b) {
                        if (a.scheduled < b.scheduled) {
                            return -1;
                        }
                        else if (a.scheduled > b.scheduled) {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    });
                    router.mlbAPI.getBoxScore(sortedGames[0].id, function(err, gameInfo) {
                        if (err) {
                            router.logger.error(sprintf("Error getting box score info for game id = %s: %s",
                                sortedGames[0].id, err));
                        }
                        callback(err, gameInfo);
                    });
                }
                else {
                    callback(err, null);
                }
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
        var specificDateRegex = /\b((?:(?:Mon)|(?:Tues?)|(?:Wed(?:nes)?)|(?:Thur?s?)|(?:Fri)|(?:Sat(?:ur)?)|(?:Sun))(?:day)?)?[:\-,]?\s*(((?:(?:jan|feb)?r?(?:uary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|oct(?:ober)?|(?:sept|nov|dec)(?:ember)?))\s+(\d{1,2}))?\s*(,?\s*(\d{4}))?/i;
        var matches = specificDateRegex.exec(dateText);
        var returnDate;
        if (matches) {
            if (matches[1] && !matches[2]) {
                returnDate = moment().day(matches[1]);
            }
            else {
                if (!matches[3] || !matches[4]) {
                    router.logger.error("Must provide at least the dayname or month and day.");
                    return null;
                }
                var specificDateText = sprintf("%s %s %s", matches[3], matches[4], (matches[5] ? matches[5] : moment().format("YYYY")));
                returnDate = moment(specificDateText, "MMM DD, YYYY");
            }
        }
        return returnDate;
    }
    return router;
};

module.exports = routes;
