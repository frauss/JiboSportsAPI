(function () {
    "use strict";

    var sprintf = require('sprintf').sprintf;
    var request = require('request');
    var querystring = require('querystring');
    var url = require('url');
    var path = require('path');

    module.exports = SportRadarAPI;

    function SportRadarAPI(sport, config, logger) {
        var sportAPIConfig = config.get(sprintf("sportRadarAPI.%s", sport));
        if (sportAPIConfig) {
            this.baseUrl = url.parse(sportAPIConfig.baseUrl);
            this.APIKey = sportAPIConfig.apiKey;
        }
        else {
            throw new Error(sprintf("No API configuration found for sport %s", sport));
        }
        this.logger = logger;
        this.hierarchy = null;

        this.getSportHierarchy = function(callback) {
            var self = this;
            if (this.hierarchy) {
                callback(null, this.hierarchy);
            }
            else {
                var hierarchyUrl = url.parse(this.baseUrl.format());
                hierarchyUrl.pathname = path.join(hierarchyUrl.path, "league", "hierarchy.json");
                hierarchyUrl.query = { "api_key": this.APIKey };
                request.get(hierarchyUrl.format(), function (error, response, body) {
                    if (error) {
                        callback(error, null);
                    }
                    else if (response.statusCode !== 200) {
                        error = new Error(sprintf("Invalid response code returned retrieving hierarchy from url = %s: %s %s",
                            hierarchyUrl.format(), response.statusCode, response.statusMessage));
                        callback(error, null);
                    }
                    else {
                        var hierarchyInfo = JSON.parse(body);
                        self.hierarchy = hierarchyInfo;
                        callback(null, hierarchyInfo);
                    }
                });
            }
        };

        this.getSchedule = function(gameDate, callback) {
            var scheduleUrl = url.parse(this.baseUrl.format());
            scheduleUrl.pathname = path.join(scheduleUrl.path, "games",
                gameDate.format("YYYY/MM/DD"), "schedule.json");
            scheduleUrl.query = { "api_key": this.APIKey };
            request.get(scheduleUrl.format(), function (error, response, body) {
                if (error) {
                    callback(error, null);
                }
                else if (response.statusCode !== 200) {
                    error = new Error(sprintf("Invalid response code returned retrieving schedule from url = %s: %s %s",
                        scheduleUrl.format(), response.statusCode, response.statusMessage));
                    callback(error, null);
                }
                else {
                    var scheduleInfo = JSON.parse(body);
                    callback(null, scheduleInfo);
                }
            });
        };

        this.getBoxScore = function(gameId, callback) {
            var boxscoreUrl = url.parse(this.baseUrl.format());
            boxscoreUrl.pathname = path.join(boxscoreUrl.path, "games",
                gameId, "boxscore.json");
            boxscoreUrl.query = { "api_key": this.APIKey };
            request.get(boxscoreUrl.format(), function (error, response, body) {
                if (error) {
                    callback(error, null);
                }
                else if (response.statusCode !== 200) {
                    error = new Error(sprintf("Invalid response code returned retrieving boxscore from url = %s: %s %s",
                        boxscoreUrl.format(), response.statusCode, response.statusMessage));
                    callback(error, null);
                }
                else {
                    var boxscoreInfo = JSON.parse(body);
                    callback(null, boxscoreInfo);
                }
            });
        };

        this.getStandings = function(callback) {
            var standingsUrl = url.parse(this.baseUrl.format());
            standingsUrl.pathname = path.join(standingsUrl.path, "seasontd",
                "2016", "reg", "standings.json");
            standingsUrl.query = { "api_key": this.APIKey };
            request.get(standingsUrl.format(), function (error, response, body) {
                if (error) {
                    callback(error, null);
                }
                else if (response.statusCode !== 200) {
                    error = new Error(sprintf("Invalid response code returned retrieving standings from url = %s: %s %s",
                        standingsUrl.format(), response.statusCode, response.statusMessage));
                    callback(error, null);
                }
                else {
                    var standingsInfo = JSON.parse(body);
                    callback(null, standingsInfo);
                }
            });
        };
    }
}(module.exports));