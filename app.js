/* jshint esversion:6 */
/* jshint unused:true */
/* jshint -W097 */
/* jshint -W117 */

'use strict';

const Homey = require('homey');

// decimal to hex conversion
function dec2hex(i) {
  return (i+0x10000).toString(16).substr(-4).toUpperCase();
}

function hex2dec(i) {
  return parseInt(i, 16);
}

// hex to bin conversion
// function hex2bin(hex) {
//   return new Buffer(hex,'hex');
// }

// function hexlify(str){
//   var result = '';
//   var padding = '00';
//   for (var i=0; i<str.length; i++ ){
//   var digit = str.charCodeAt(i).toString(16);
//   var padded = (padding+digit).slice(-2);
//   result+=padded;
//   }
//   return result;
// }

function byteArrayToDec(ary){
  for (var bytes = [], c = 0;c < ary.length; c += 1){
  bytes.push(String.fromCharCode("0x" + ary[c]));
  }
  return bytes;
}

// // Convert a hex string to a byte array
// function hexToByteArray(hex) {
//   // strip 0x prefix from hex value
//   hex = hex.toString().replace('0x','');
//   for (var bytes = [], c = 0; c < hex.length; c += 2){
//   bytes.push(parseInt(hex.substr(c, 2), 16));
//   }
//   return bytes;
// }

// // Convert a byte array to a hex string
// function byteArrayToHex(bytes) {
//   for (var hex = [], i = 0; i < bytes.length; i++) {
//   hex.push((bytes[i] >>> 4).toString(16));
//   hex.push((bytes[i] & 0xF).toString(16));
//   }
//   return hex.join("").toUpperCase();
// }

// provide string, fill up to 'len' with 'fill' characters and divide into byte pairs
function stringToHexBytes(str,len,fill){
  if ( str.length < len*2 )
    str = str + fill.repeat(len*2-str.length);
  for (var bytes=[], c=0; c<str.length; c+=2){
    let blk = str.substr(c,2);
    bytes.push(blk);
  }
  return bytes;
}

// function printHex(hex){
//   return hex.toString().replace(/(.{2})/g,"$1 ");
// }

function parsePayload(payload){
  let cmd = payload[0];
  Homey.app.log(" - command: " + cmd);

  switch(cmd){ // check result field 3 for response code
    case "7E": // Integra version
    let answer = payload.slice(1);
    // 1 byte for the alarm type
    switch(hex2dec(answer[0])){
      case   0: integraAlarm.alarmType = "Integra 24"; break;
      case   1: integraAlarm.alarmType = "Integra 32"; break;
      case   2: integraAlarm.alarmType = "Integra 64"; break;
      case   3: integraAlarm.alarmType = "Integra 128"; break;
      case   4: integraAlarm.alarmType = "INTEGRA 128-WRL SIM300"; break;
      case  66: integraAlarm.alarmType = "INTEGRA 64 PLUS"; break;
      case  67: integraAlarm.alarmType = "INTEGRA 128 PLUS"; break;
      case  72: integraAlarm.alarmType = "INTEGRA 256 PLUS"; break;
      case 132: integraAlarm.alarmType = "INTEGRA 128-WRL LEON"; break;
      default: integraAlarm.alarmType = "UNKNOWN Alarm type"; break;
      }
      // PLACEHOLDER to store this in settings and show in settings page
      Homey.app.log("Alarm Type: " + integraAlarm.alarmType);
      Homey.ManagerSettings.set('alarmType', integraAlarm.alarmType);
      // 11 bytes for the version
      let version_array = byteArrayToDec(answer.slice(1,12));
      var _r= function(p,c){return p.replace(/%s/,c);};
      integraAlarm.alarmVers = version_array.reduce(_r, "%s.%s%s %s%s%s%s-%s%s-%s%s");
      // PLACEHOLDER to store this in settings and show in settings page
      Homey.app.log("Version: " + integraAlarm.alarmVers);
      Homey.ManagerSettings.set('alarmVers', integraAlarm.alarmVers);
      // 1 byte for the language
      integraAlarm.alarmLang = '?';
      switch(hex2dec(answer[12])){
        case 1: integraAlarm.alarmLang = 'English'; break;
        case 9: integraAlarm.alarmLang = 'Dutch'; break;
      }
      // PLACEHOLDER to store this in settings and show in settings page
      Homey.app.log("Language: " + integraAlarm.alarmLang);
      Homey.ManagerSettings.set('alarmLang', integraAlarm.alarmLang);
    }
}

// calculate CRC for given cmd according to satel specifications
// https://www.satel.pl/en/download/instrukcje/ethm1_op_pl_1.07.pdf
function calcCRC(array){
  if ( ! Array.isArray(array)){
    Homey.app.log("Input must be array.");
  }
  let crc = "0x147A";
  // loop over decimal version of hex
//  Homey.app.log("Calculate CRC for: " + array);
  for (var b of array){
//    Homey.app.log(" - crc-ing: " + b);
    // rotate 1 bit left
    crc = (( crc << 1 ) & 0xFFFF ) | ( crc & 0x8000 ) >> 15;
    // xOR with 0xFFFF
    crc = crc ^ 0xFFFF;
    // crc + crc.high + b
    crc = (crc + (crc >> 8) + parseInt(b,16)) & 0xFFFF;
  }
//  Homey.app.log(" - crc is: " + crc);
  return dec2hex(crc).match(/.{2}/g); // return array
} // calcCRC

function ETHM1AnswerToArray(answer){
  return Buffer.from(answer.toString('binary'), 'ascii').toString('hex').toUpperCase().match(/.{2}/g);
}

function verifyAnswer(answer){
  let frmHdr = 'FE,FE';
  let frmFtr = 'FE,0D';
  if ( answer.slice(0,2).toString() == frmHdr &&
  answer.slice(-2).toString() == frmFtr &&
  answer.slice(-4,-2).toString() == calcCRC(answer.slice(2,-4)).toString()
){return true;} else { return false; }
}

class integraAlarm extends Homey.App {
  //	Frame structure
  //	[ 0xFE | 0xFE | cmd | d1 | d2 | ... | dn | crc.high | crc.low | 0xFE | 0x0D ]

  onInit() {
    this.log(`${this.id} running...`);
    // retrieve user defined values from settings
    integraAlarm.ipaddress = Homey.ManagerSettings.get('ipaddress');
    integraAlarm.ipport    = Homey.ManagerSettings.get('ipport');
    if ( integraAlarm.ipport == null || integraAlarm.ipport == "")
      integraAlarm.ipport = 7094;
    integraAlarm.usercode  = Homey.ManagerSettings.get('code');

    integraAlarm.alarmType = '';    // comes from 0x7E command
    integraAlarm.version = ''; // comes from 0x7E command

    Homey.app.log("Alarm accessible at: " + integraAlarm.ipaddress + " @ " + integraAlarm.ipport);
    setTimeout(this.executeCommand,  3000, this.getCommand_ethminfo()); // read alarm info
//    setTimeout(this.executeCommand,  3000, this.getCommand_arm()); // arm alarm
//    setTimeout(this.executeCommand,  5000, this.getCommand_armedzones()); // read armed zones
//    setTimeout(this.executeCommand,  9000, this.getCommand_disarm()); // disarm alarm

    // monitor alarm status
    this.logEveryNSeconds(0);

    // register listener for ACTION "disarm" FlowCard
    let disarmAlarm = new Homey.FlowCardAction('disarm')
    .register()
    .registerRunListener(( args, state ) => {
      Homey.app.log("Disarm alarm. Args =" + args);
      Homey.app.log(" - Arguments =" + args);
      Homey.app.log(" - State =" + state);
      this.executeCommand(this.getCommand_disarm());
      //			Homey.setCapabilityValue("homealarm_state", "disarmed", true)
      let isDisarmed = true; // true or false
      return Promise.resolve( isDisarmed );
  });

    // register listener for ACTION "arm" FlowCard
    let armAlarm = new Homey.FlowCardAction('arm')
    .register()
    .registerRunListener(( args, state ) => {
    Homey.app.log("Arm alarm");
    Homey.app.log(" - Arguments =" + args);
    Homey.app.log(" - State =" + state);
    this.executeCommand(this.getCommand_arm());
    let isArmed = true; // true or false
    return Promise.resolve( isArmed );
  });

    // register listener for CONDITION "is_armed"
    let stateAlarm = new Homey.FlowCardCondition('is_armed')
    .register()
    .registerRunListener(( args, state ) => {
      let isArmed = false; // true or false
      return Promise.resolve( isArmed );
    });
  } // end onInit

  // // calculate CRC for given cmd according to satel specifications
  // // https://www.satel.pl/en/download/instrukcje/ethm1_op_pl_1.07.pdf
  // calculateFrameCrc(hex){
  //
  //   let crc = "0x147A";
  //   // loop over bytearray elements
  //   for (var b of hexToByteArray(hex)){
  //     // rotate 1 bit left
  //     crc = (( crc << 1) & 0xFFFF) | ( crc & 0x8000) >> 15;
  //     // xOR with 0xFFFF
  //     crc = crc ^ 0xFFFF;
  //     // crc + crc.high + b
  //     crc = (crc + (crc >> 8) + b) & 0xFFFF;
  //   }
  //   return dec2hex(crc);
  // } // calculateFrameCrc

  // loop for continuously monitoring alarm state
  logEveryNSeconds(i) {
      setTimeout(() => {
          Homey.app.log('*** Monitor alarm status:', i);
          Homey.app.log('Armed zones: ', this.executeCommand(this.getCommand_armedzones()));
          this.logEveryNSeconds(++i);
      }, 5000);
  }

  executeCommand(input){
    // Homey.app.log("--------------------------------");
    // Homey.app.log("INPUT: " + input)
    // Homey.app.log("Real command: " + input.slice(2,-2));

    // create socket
    let net = require('net');
    let alarm = new net.Socket();
    alarm.setEncoding('binary');
    // set timeout to 750 ms (for sending & receiving data)
    alarm.setTimeout(750);
    // connect to alarm system
    alarm.connect(integraAlarm.ipport, integraAlarm.ipaddress, function() {
      Homey.app.log("Connected to " + integraAlarm.ipaddress + ":" + integraAlarm.ipport);
      // if connected, send command in binary format
     alarm.write(new Buffer(input.join(''),'hex'));
    });
    // upon receiving data from the alarm
    // receiving data from a socket is asynchronous, so a return value is not properly set
    alarm.on('data', function(data) {
      Homey.app.log("Received data from alarm...");
      let answer = ETHM1AnswerToArray(data);
      if (verifyAnswer(answer)){
        Homey.app.log(" - valid answer");
      } else {
        Homey.app.log(" - incorrect answer");
      }
      let payload = answer.slice(2,-4);
      Homey.app.log(" - payload: " + payload);
      parsePayload(payload);
      alarm.destroy();
      return answer;
    });
    alarm.on('error', function(err) {
      Homey.app.log('Error: ' + err);
      alarm.destroy();
    });
    alarm.on('timeout', function() {
      Homey.app.log('Connection timed out.');
      alarm.destroy();
      alarm.end();
    });
    alarm.on('close', function() {
      Homey.app.log('Connection to ' + integraAlarm.ipaddress + ' closed.');
      Homey.app.log(''); // empty line
    });
  }// end executeCommand

 createFrameArray(cmd){
   // cmd must be array
   let frmHdr = ['FE','FE'];
   let frmFtr = ['FE','0D'];
   let crc = calcCRC(cmd);
   return frmHdr.concat(cmd).concat(crc).concat(frmFtr);
 }

  armAction(mode) {
    let ary = [];
    // first byte is command code ()
    ary.push(80+mode);
    // next 8 bytes are usercode
    ary = ary.concat(stringToHexBytes(integraAlarm.usercode,8,'F'));
    // next 4 bytes are zones to arm
    ary.push('01','00','00','00');
    return this.createFrameArray(ary);
  }

  getCommand_ethminfo(){
    return this.createFrameArray(["7E"]);
  }
  getCommand_armedzones(){
    return this.createFrameArray(["0A"]);
  }
  getCommand_arm(mode=0) {
    Homey.app.log("Execute command Arm2 with delay (0x8" + mode + ")");
    return this.armAction(mode);
  }
  getCommand_disarm() {
    Homey.app.log("Execute command Disarm2 (0x84)");
    return this.armAction(4);
  }
  getCommand_selfinfo(){
    let ary = [];
    ary.push('E0');
    ary = ary.concat(stringToHexBytes(integraAlarm.usercode,8,'F'));
    return this.createFrameArray(ary);
  }
}

module.exports = integraAlarm;
