// jshint esversion:6
// jshint unused:true
// jshint -W097
// jshint -W098
// jshint -W117

'use strict';

var debugEnabled = false;

const Homey = require('homey');

// decimal to hex conversion
function dec2hex(i) {
    return (i + 0x10000).toString(16).substr(-4).toUpperCase();
} // dec2hex

function hex2dec(i) {
    return parseInt(i, 16);
} // hex2dec

// hex to bin conversion
function hex2bin(hex) {
    return (parseInt(hex, 16).toString(2)).padStart(8, '0');
} // hex2bin

// convert array of bytes to decimal numbers
function byteArrayToDec(ary) {
    let bytes = [];
    for (let c = 0; c < ary.length; c += 1) {
        bytes.push(String.fromCharCode("0x" + ary[c]));
    }
    return bytes;
} // byteArrayToDec

// provide string, fill up to 'len' with 'fill' characters and divide into byte pairs
function stringToHexBytes(str, len, fill) {
    str = str.toString(); // force to be string
    if (str.length < (len * 2)) {
        str = str + fill.repeat((len * 2) - str.length);
    }
    let bytes = [];
    for (let c = 0; c < str.length; c += 2) {
        let blk = str.substr(c, 2);
        bytes.push(blk);
    }
    return bytes;
} // stringToHexBytes

// compare two array to check if they have the same elements
function compareArrays(arrA, arrB) {
    //check if lengths are different
    if (arrA.length !== arrB.length) return false;

    //slice so we do not effect the orginal
    //sort makes sure they are in order
    let cA = arrA.slice().sort();
    let cB = arrB.slice().sort();

    for (let i = 0; i < cA.length; i++) {
        if (cA[i] !== cB[i]) return false;
    }
    return true;
} // compareArrays

// calculate CRC for given cmd according to satel specifications
// https://www.satel.pl/en/download/instrukcje/ethm1_op_pl_1.07.pdf
function calcCRC(array) {
    let crc = "0x147A";
    // loop over decimal version of hex
    for (let b of array) {
        // rotate 1 bit left
        crc = ((crc << 1) & 0xFFFF) | (crc & 0x8000) >> 15;
        // xOR with 0xFFFF
        crc = crc ^ 0xFFFF;
        // crc + crc.high + b
        crc = (crc + (crc >> 8) + parseInt(b, 16)) & 0xFFFF;
    }
    return dec2hex(crc).match(/.{2}/g); // return array
} // calcCRC

function ETHM1AnswerToArray(answer) {
    return Buffer.from(answer.toString('binary'), 'ascii').toString('hex').toUpperCase().match(/.{2}/g);
} // ETHM1AnswerToArray

function verifyAnswer(answer) {
    const frmHdr = 'FE,FE';
    const frmFtr = 'FE,0D';
    if (answer.slice(0, 2).toString() == frmHdr &&
        answer.slice(-2).toString() == frmFtr &&
        answer.slice(-4, -2).toString() == calcCRC(answer.slice(2, -4)).toString()
    ) {
        return true;
    } else {
        return false;
    }
} // verifyAnswer

function partitionListToByteArray(partitions, size = 4) {
    let ary = partitions.split(",");
    let byteArray = [];
    for (let i = 0; i < (8 * size); i++) {
        // if index+1 equals partition number, set as 1.
        if (ary.includes((i + 1).toString())) {
            byteArray[i] = 1;
        } else {
            byteArray[i] = 0;
        }
    }
    // split into sections of 8 characters
    let byteList = byteArray.reverse().join('').match(/.{8}/g);
    let partHexList = [];
    for (let b of byteList.reverse()) {
        // convert bin to hex, uppercase and pad left
        partHexList.push(parseInt(b, 2).toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log(partHexList);
    return partHexList;
} // partitionListToByteArray

class integraAlarmDevice extends Homey.Device {

    parsePayload(payload) {
        if (!Array.isArray(payload))
            return "";
        // this.log("Going to parse payload: ", payload);

        const cmd = payload[0];
        const answer = payload.slice(1);
        if (debugEnabled) {
            this.log("   - command: " + cmd);
            this.log("   - answer : " + answer);
        }
        switch (cmd) { // check payload field 1 to match command
            case "7E": // Integra version
                // 1 byte for the alarm type
                let atype = null;
                switch (hex2dec(answer[0])) {
                    case 0:
                        atype = "Integra 24";
                        break;
                    case 1:
                        atype = "Integra 32";
                        break;
                    case 2:
                        atype = "Integra 64";
                        break;
                    case 3:
                        atype = "Integra 128";
                        break;
                    case 4:
                        atype = "INTEGRA 128-WRL SIM300";
                        break;
                    case 66:
                        atype = "INTEGRA 64 PLUS";
                        break;
                    case 67:
                        atype = "INTEGRA 128 PLUS";
                        break;
                    case 72:
                        atype = "INTEGRA 256 PLUS";
                        break;
                    case 132:
                        atype = "INTEGRA 128-WRL LEON";
                        break;
                    default:
                        atype = "UNKNOWN Alarm type";
                        break;
                }
                // PLACEHOLDER to store this in settings and show in settings page
                if (debugEnabled) {
                    this.log("     - Alarm Type: " + atype);
                }
                this.setSettings({
                    alarmtype: atype
                });
                // 11 bytes for the version
                let version_array = byteArrayToDec(answer.slice(1, 12));
                let r = function(p, c) {
                    return p.replace(/%s/, c);
                };
                let avers = version_array.reduce(r, "%s.%s%s %s%s%s%s-%s%s-%s%s");
                if (debugEnabled) {
                    this.log("     - Alarm Version: " + avers);
                }
                this.setSettings({
                    alarmvers: avers
                });
                // 1 byte for the language
                let alang = '?';
                switch (hex2dec(answer[12])) {
                    case 1:
                        alang = 'English';
                        break;
                    case 9:
                        alang = 'Dutch';
                        break;
                    default:
                        alang = "Unknown (" + hex2dec(answer[12]) + ")";
                        break;
                }
                if (debugEnabled) {
                    this.log("     - Alarm language: " + alang);
                }
                this.setSettings({
                    alarmlang: alang
                });

                this.alarmidentified = true;
                break;

            case "0A":
                // put code here to parse 4 byte answer for active blocks/zones.
                // each byte is a HEX number, convert to binary and count positions
                // starting from the end to find active partitions.
                let activepartitions = [];
                let firstrun = false;
                if (this.previousactivepartitions == undefined) {
                    this.previousactivepartitions = [];
                    firstrun = true;
                }
                let p = 0;
                for (let plist of answer) {
                    let binarray = Array.from(hex2bin(plist));
                    for (let i = binarray.length - 1; i >= 0; --i) {
                        p++;
                        if (binarray[i] == 1) {
                            activepartitions.push(p);
                        }
                    }
                }
                if (firstrun) {
                    this.previousactivepartitions = activepartitions;
                }
                if (debugEnabled) {
                    this.log(" - active partitions (now)   : " + activepartitions);
                    this.log(" - active partitions (before): " + this.previousactivepartitions);
                }
                // check number of active partitions => determines current status
                if (activepartitions.length == 0) {
                    this.log("No armed partitions found => alarm is not armed.");
                    this.conditionIsArmed = false;
                    // set homealarm_state to current value
                    this.setCapabilityValue('onoff', false).catch((error) => {
                        this.log("Could not disarm alarm, due to:", error);
                    });

                    if (!compareArrays(activepartitions, this.previousactivepartitions)) {
                        // trigger ACTION triggerGotDisarmed
                        if (debugEnabled) {
                            this.log(" - Alarm was disarmed");
                        }
                        this.triggerGotDisarmed.trigger().then().catch();
                    }
                } else {
                    this.log("One or more armed partitions => alarm is armed.");
                    this.conditionIsArmed = true;
                    this.setCapabilityValue('onoff', true);
                    if (!compareArrays(activepartitions, this.previousactivepartitions)) {
                        // trigger ACTION triggerGotArmed
                        if (debugEnabled) {
                            this.log(" - Alarm was armed.");
                        }
                        this.triggerGotArmed.trigger().then().catch();
                        this.setCapabilityValue('onoff', true);
                    }
                }
                // store for next loop
                this.previousactivepartitions = activepartitions;
                break;
        }
    } // parsePayload

    // this method is called when the Device is inited
    onInit() {
        this.log('Initialize device');
        this.log(' * Name:', this.getName());
        this.log(' * Driver:', this.getDriver().id);
        this.log(' * Class:', this.getClass());
        this.log(' * Available: ', this.getAvailable());
        this.log(' * Capabilities:', this.getCapabilities());
        this.log(' * State:', this.getState());
        this.log(' * Settings: ', this.getSettings());

        this.monloopidx = 0;
        this.alarmidentified = false; // use 7E command to change to true.
        // debugEnabled = this.getSettings().alarmdbug;

        // the Listener is activated when state is changed via Device in GUI
        this.registerCapabilityListener('onoff', (value, opts) => {
            this.log("STATE CHANGE DETECTED to: " + value);
            if (value == true) {
                this.log("HomeAlarm state changed to: armed (", value, ")");
                this.executeCommand(this.getCommand_arm(), (data) => {
                    this.parsePayload(data);
                });
            } else {
                this.log("HomeAlarm state changed to: disarmed (", value, ")");
                this.executeCommand(this.getCommand_disarm(), (data) => {
                    this.parsePayload(data);
                });
            }
            return Promise.resolve();
        });

        // register listener for ACTION "disarm" FlowCard
        new Homey.FlowCardAction('actionDisarmAlarm')
            .register()
            .registerRunListener(() => {
                this.log("warning: dis-ARMING ALARM...");
                this.executeCommand(this.getCommand_disarm(), (data) => {
                    this.parsePayload(data);
                });
                return Promise.resolve(true);
            });

        // register listener for ACTION "arm" FlowCard
        new Homey.FlowCardAction('actionArmAlarm')
            .register()
            .registerRunListener(() => {
                this.log("WARNING: ARMING ALARM...");
                this.executeCommand(this.getCommand_arm(1), (data) => {
                    this.parsePayload(data);
                });
                return Promise.resolve(true);
            });

        // register listener for CONDITION "conditionIsArmed"
        new Homey.FlowCardCondition('conditionIsArmed')
            .register()
            .registerRunListener(() => {
                return Promise.resolve(this.conditionIsArmed);
            });

        // register listener for TRIGGER "triggerGotArmed"
        this.triggerGotArmed = new Homey.FlowCardTrigger('triggerGotArmed');
        this.triggerGotArmed
            .registerRunListener(() => {
                // If true, this flow should run
                return Promise.resolve(true);
            }).register();

        // register listener for TRIGGER "triggerGotDisarmed"
        this.triggerGotDisarmed = new Homey.FlowCardTrigger('triggerGotDisarmed');
        this.triggerGotDisarmed
            .registerRunListener(() => {
                // If true, this flow should run
                return Promise.resolve(true);
            }).register();

        // read  alarm information
        this.executeCommand(this.getCommand_ethminfo(), (data) => {
            this.parsePayload(data);
        });
        // start the continuous monitoring of the alarm system to detect state changes
        this.monitorAlarmStatus(0);
    }

    // this method is called when the Device is added
    onAdded() {
        this.log('device added');
        let settings = this.getSettings();
        this.log('settings:', settings);
    }

    onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
        this.log('Changed settings: ', newSettingsObj);
        // run when the user has changed the device's settings in Homey.
        // changedKeysArr contains an array of keys that have been changed

        // always fire the callback, or the settings won't change!
        // if the settings must not be saved for whatever reason:
        // callback( "Your error message", null );
        // else

        callback(null, true);

        //        this.onInit();
        this.alarmidentified = false;
        this.executeCommand(this.getCommand_ethminfo(), (data) => {
            this.parsePayload(data);
        });
        // debugEnabled = this.getSettings().alarmdbug;

    }

    // this method is called when the Device is deleted
    onDeleted() {
        this.log('Device "' + this.getName() + '" deleted.');
        this.setUnavailable();
    }

    // loop for continuously monitoring alarm state
    monitorAlarmStatus(idx) {
        setTimeout(() => {
            if (debugEnabled) {
                this.log('### Monitor alarm status:', idx, "###");
            }
            if (this.getAvailable() && this.alarmidentified) {
                this.monloopidx = idx;
                // only monitor if the device is available
                this.executeCommand(this.getCommand_armedzones(), (data) => {
                    this.parsePayload(data);
                });
            } else {
                this.log("Device not properly configured. Change in device settings.");
            }
            this.monitorAlarmStatus(++idx);
        }, this.getSettings().alarmpoll);
    }

    executeCommand(input, callback) {
        const net = require('net');
        const alarm = new net.Socket();
        alarm.setEncoding('binary');
        // set timeout to 750 ms (for sending & receiving data)
        alarm.setTimeout(750);

        // connect to alarm system
        alarm.connect(this.getSettings().alarmport, this.getSettings().alarmaddr, () => {
            if (debugEnabled) {
                this.log("Connected to " + alarm.remoteAddress + ":" + alarm.remotePort);
                this.log(" * Send command: " + input.join('').match(/.{2}/g));
            }
            // if connected, send command in binary format
            alarm.write(new Buffer(input.join(''), 'hex'));
        });
        // upon receiving data from the alarm
        // receiving data from a socket is asynchronous, so a return value is not properly set
        alarm.on('data', (data) => {
            if (debugEnabled) {
                this.log(" * Received data from alarm...");
            }
            let answer = ETHM1AnswerToArray(data);
            if (verifyAnswer(answer)) {
                if (debugEnabled) {
                    this.log("   - valid answer: " + answer);
                }
            } else {
                if (debugEnabled) {
                    this.log("   - incorrect answer:" + answer);
                }
            }
            let payload = answer.slice(2, -4);
            if (debugEnabled) {
                this.log("   - payload: " + payload);
            }
            alarm.destroy();
            // call the callback function with the payload as parameter
            callback(payload);
        });
        alarm.on('error', (err) => {
            if (debugEnabled) {
                this.log('Error: ' + err);
            }
            alarm.destroy();
            return [];
        });
        alarm.on('timeout', () => {
            if (debugEnabled) {
                this.log('Connection timed out.');
            }
            alarm.destroy();
            alarm.end();
            return [];
        });
        alarm.on('close', () => {
            if (debugEnabled) {
                this.log('Connection to ' + alarm.remoteAddress + ' closed.');
                this.log(''); // empty line
            }
        });
    } // end executeCommand

    createFrameArray(cmd) {
        // cmd must be array
        //	Frame structure
        //	[ 0xFE | 0xFE | cmd | d1 | d2 | ... | dn | crc.high | crc.low | 0xFE | 0x0D ]
        const frmHdr = ['FE', 'FE'];
        const frmFtr = ['FE', '0D'];
        let crc = calcCRC(cmd);
        return frmHdr.concat(cmd).concat(crc).concat(frmFtr);
    } // createFrameArray

    armAction(mode) {
        let ary = [];
        // first byte is command code ()
        ary.push(80 + mode);
        // next 8 bytes are usercode
        ary = ary.concat(stringToHexBytes(this.getSettings().alarmcode, 8, 'F'));
        // next 4 bytes are zones to arm
        ary = ary.concat(partitionListToByteArray(this.getSettings().alarmpart));
        return this.createFrameArray(ary);
    }

    getCommand_ethminfo() {
        return this.createFrameArray(["7E"]);
    }
    getCommand_armedzones() {
        return this.createFrameArray(["0A"]);
    }
    getCommand_arm(mode = 0) {
        return this.armAction(mode);
    }
    getCommand_disarm() {
        return this.armAction(4);
    }
    getCommand_selfinfo() {
        let ary = [];
        ary.push('E0');
        ary = ary.concat(stringToHexBytes(this.settings.alarmcode, 8, 'F'));
        return this.createFrameArray(ary);
    }
    getCommand_zonesinfo() {
        return this.createFrameArray(["EE", "00", "01"]);
    }
}

module.exports = integraAlarmDevice;
