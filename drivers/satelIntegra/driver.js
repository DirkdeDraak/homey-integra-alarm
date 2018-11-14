// jshint esversion:6
// jshint unused:true
// jshint -W097
// jshint -W098
// jshint -W117

'use strict';

const Homey = require('homey');

class integraAlarmDriver extends Homey.Driver {


    onPairListDevices(data, callback) {
        callback(null, [{
            name: 'Integra Alarm',
            data: {
                id: 'integra'
            }
        }]);
    } // onPairListDevices
}

module.exports = integraAlarmDriver;
