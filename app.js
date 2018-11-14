// jshint esversion:6
// jshint unused:true
// jshint -W097
// jshint -W098
// jshint -W117

'use strict';

const Homey = require('homey');

class integraAlarm extends Homey.App {

    onInit() {
        this.log(`${this.id} running...`);
    } // end onInit

}

module.exports = integraAlarm;
