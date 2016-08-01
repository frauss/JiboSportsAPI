(function () {
    "use strict";

    var _ = require('underscore');
    var sprintf = require('sprintf').sprintf;
    var jmespath = require('jmespath');
    var moment = require('moment');

    module.exports = StandingsResponseFormatter;
    
    function StandingsResponseFormatter(standingsInfo) {
        this.teamStandingsData = standingsInfo;

        this.formulateResponse = function(queryParams) {
            var responseText = sprintf("The %s are currently in %s place in the %s %s with a record of %d wins and %d losses",
                this.teamStandingsData.team.name,
                ordinalSuffixOf(this.teamStandingsData.team.position),
                this.teamStandingsData.league.name,
                this.teamStandingsData.division.name,
                this.teamStandingsData.team.win,
                this.teamStandingsData.team.loss);
            return responseText;
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
