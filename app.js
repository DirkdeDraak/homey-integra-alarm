/* jshint esversion:6 */
/* jshint unused:true */
/* jshint -W097 */
/* jshint -W117 */

'use strict';

const debugEnabled = false;

const Homey = require('homey');

// decimal to hex conversion
function dec2hex(i) {
  return (i+0x10000).toString(16).substr(-4).toUpperCase();
} // dec2hex

function hex2dec(i) {
  return parseInt(i, 16);
} // hex2dec

// hex to bin conversion
function hex2bin(hex){
    return (parseInt(hex, 16).toString(2)).padStart(8, '0');
} // hex2bin

// convert array of bytes to decimal numbers
function byteArrayToDec(ary){
  let bytes = [];
  for (let c = 0;c < ary.length; c += 1){
    bytes.push(String.fromCharCode("0x" + ary[c]));
  }
  return bytes;
} // byteArrayToDec

// provide string, fill up to 'len' with 'fill' characters and divide into byte pairs
function stringToHexBytes(str,len,fill){
  if ( str.length < len*2 )
    str = str + fill.repeat(len*2-str.length);
  let bytes = [];
  for (let c=0; c<str.length; c+=2){
    let blk = str.substr(c,2);
    bytes.push(blk);
  }
  return bytes;
} // stringToHexBytes

// compare two array to check if they have the same elements
function compareArrays( arrA, arrB ){
    //check if lengths are different
    if(arrA.length !== arrB.length) return false;

    //slice so we do not effect the orginal
    //sort makes sure they are in order
    let cA = arrA.slice().sort();
    let cB = arrB.slice().sort();

    for(let i=0;i<cA.length;i++){
         if(cA[i]!==cB[i]) return false;
    }
    return true;
} // compareArrays

function parsePayload(payload){
  const cmd = payload[0];
  const answer = payload.slice(1);
  if ( debugEnabled ) {
    Homey.app.log("   - command: " + cmd);
    Homey.app.log("   - answer : " + answer);
  }
  switch(cmd){ // check payload field 1 to match command
    case "7E": // Integra version
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
        if ( debugEnabled ) {
          Homey.app.log("Alarm Type: " + integraAlarm.alarmType);
        }
        Homey.ManagerSettings.set('alarmType', integraAlarm.alarmType);
        // 11 bytes for the version
        let version_array = byteArrayToDec(answer.slice(1,12));
        let r = function(p,c){return p.replace(/%s/,c);};
        integraAlarm.alarmVers = version_array.reduce(r, "%s.%s%s %s%s%s%s-%s%s-%s%s");
        // PLACEHOLDER to store this in settings and show in settings page
        if ( debugEnabled ) {
          Homey.app.log("Version: " + integraAlarm.alarmVers);
        }
        Homey.ManagerSettings.set('alarmVers', integraAlarm.alarmVers);
        // 1 byte for the language
        integraAlarm.alarmLang = '?';
        switch(hex2dec(answer[12])){
          case 1: integraAlarm.alarmLang = 'English'; break;
          case 9: integraAlarm.alarmLang = 'Other / Dutch'; break;
        }
        // PLACEHOLDER to store this in settings and show in settings page
        if ( debugEnabled ) {
          Homey.app.log("Language: " + integraAlarm.alarmLang);
        }
        Homey.ManagerSettings.set('alarmLang', integraAlarm.alarmLang);
        break;
      case "0A":
        // put code here to parse 4 byte answer for active blocks/zones.
        // each byte is a HEX number, convert to binary and count positions
        // starting from the end to find active partitions.
        let activepartitions = [];
        let firstrun = false;
        if (integraAlarm.previousactivepartitions == undefined){
          integraAlarm.previousactivepartitions = [];
          firstrun = true;
        }

        let p = 0;
        for (let plist of answer){
          let binarray = Array.from(hex2bin(plist));
          for (let i = binarray.length-1; i>=0; --i) {
            p++;
            if ( binarray[i] == 1){
              activepartitions.push(p);
            }
          }
        }
        if ( firstrun ){
          integraAlarm.previousactivepartitions = activepartitions;
        }
        if ( debugEnabled ) {
          Homey.app.log(" - active partitions (now)   : " + activepartitions);
          Homey.app.log(" - active partitions (before): " + integraAlarm.previousactivepartitions);
        }
        // check number of active partitions => determines current status
        if (activepartitions.length == 0){
          integraAlarm.conditionIsArmed = false;
          if ( ! compareArrays(activepartitions, integraAlarm.previousactivepartitions) ){
            // trigger ACTION triggerGotDisarmed
            if ( debugEnabled ) {
              Homey.app.log(" - Alarm was disarmed");
            }
            integraAlarm.triggerGotDisarmed.trigger(  ).then(  ).catch(  );
             }
        } else {
          integraAlarm.conditionIsArmed = true;
          if ( ! compareArrays(activepartitions, integraAlarm.previousactivepartitions) ){
            // trigger ACTION triggerGotArmed
            if ( debugEnabled ) {
              Homey.app.log(" - Alarm was armed.");
            }
            integraAlarm.triggerGotArmed.trigger(  ).then(  ).catch(  );
          }
        }

        // store for next loop
        integraAlarm.previousactivepartitions = activepartitions;
        break;
    }
} // parsePayload

// calculate CRC for given cmd according to satel specifications
// https://www.satel.pl/en/download/instrukcje/ethm1_op_pl_1.07.pdf
function calcCRC(array){
  let crc = "0x147A";
  // loop over decimal version of hex
  for (let b of array){
    // rotate 1 bit left
    crc = (( crc << 1 ) & 0xFFFF ) | ( crc & 0x8000 ) >> 15;
    // xOR with 0xFFFF
    crc = crc ^ 0xFFFF;
    // crc + crc.high + b
    crc = (crc + (crc >> 8) + parseInt(b,16)) & 0xFFFF;
  }
  return dec2hex(crc).match(/.{2}/g); // return array
} // calcCRC

function ETHM1AnswerToArray(answer){
  return Buffer.from(answer.toString('binary'), 'ascii').toString('hex').toUpperCase().match(/.{2}/g);
} // ETHM1AnswerToArray

function verifyAnswer(answer){
  const frmHdr = 'FE,FE';
  const frmFtr = 'FE,0D';
  if ( answer.slice(0,2).toString() == frmHdr &&
        answer.slice(-2).toString() == frmFtr &&
        answer.slice(-4,-2).toString() == calcCRC(answer.slice(2,-4)).toString()
      ){return true;} else { return false; }
} // verifyAnswer

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

    if ( debugEnabled ) {
      Homey.app.log("Alarm accessible at: " + integraAlarm.ipaddress + " @ " + integraAlarm.ipport);
    }
    setTimeout(this.executeCommand,  3000, this.getCommand_ethminfo()); // read alarm info

    // monitor alarm status
    this.monitorAlarmStatus();

    // register listener for ACTION "disarm" FlowCard
    new Homey.FlowCardAction('actionDisarmAlarm')
      .register()
      .registerRunListener( () => {
        this.executeCommand(this.getCommand_disarm());
        return Promise.resolve( true );
      }
    );

    // register listener for ACTION "arm" FlowCard
    new Homey.FlowCardAction('actionArmAlarm')
      .register()
      .registerRunListener(() => {
        this.executeCommand(this.getCommand_arm(1));
        return Promise.resolve( true );
      }
    );

    // register listener for CONDITION "conditionIsArmed"
    new Homey.FlowCardCondition('conditionIsArmed')
    .register()
    .registerRunListener(() => {
      return Promise.resolve( integraAlarm.conditionIsArmed );
    });

    // register listener for TRIGGER "triggerGotArmed"
    integraAlarm.triggerGotArmed = new Homey.FlowCardTrigger('triggerGotArmed');
    integraAlarm.triggerGotArmed
        .registerRunListener((  ) => {
            // If true, this flow should run
            return Promise.resolve( true );
        }).register();

    // register listener for TRIGGER "triggerGotDisarmed"
    integraAlarm.triggerGotDisarmed = new Homey.FlowCardTrigger('triggerGotDisarmed');
    integraAlarm.triggerGotDisarmed
        .registerRunListener((  ) => {
            // If true, this flow should run
            return Promise.resolve( true );
        }).register();
   } // end onInit

  // loop for continuously monitoring alarm state
  monitorAlarmStatus(i=0) {
      setTimeout(() => {
          if ( debugEnabled ) {
            Homey.app.log('*** Monitor alarm status:', i);
          }
          this.executeCommand(this.getCommand_armedzones());
          this.monitorAlarmStatus(++i);
      }, 5000);
  }

  executeCommand(input){
    // create socket
    const net = require('net');
    const alarm = new net.Socket();
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
      if ( debugEnabled ) {
        Homey.app.log("Received data from alarm...");
      }
      let answer = ETHM1AnswerToArray(data);
      if (verifyAnswer(answer)){
        if ( debugEnabled ) {
          Homey.app.log(" - valid answer: " + answer);
        }
      } else {
        if ( debugEnabled ) {
          Homey.app.log(" - incorrect answer:" + answer);
        }
      }
      let payload = answer.slice(2,-4);
      if ( debugEnabled ) {
        Homey.app.log(" - payload: " + payload);
      }
      parsePayload(payload);
      alarm.destroy();
      return answer;
    });
    alarm.on('error', function(err) {
      if ( debugEnabled ) {
        Homey.app.log('Error: ' + err);
      }
      alarm.destroy();
    });
    alarm.on('timeout', function() {
      if ( debugEnabled ) {
        Homey.app.log('Connection timed out.');
      }
      alarm.destroy();
      alarm.end();
    });
    alarm.on('close', function() {
      if ( debugEnabled ) {
        Homey.app.log('Connection to ' + integraAlarm.ipaddress + ' closed.');
        Homey.app.log(''); // empty line
      }
    });
  }// end executeCommand

 createFrameArray(cmd){
   // cmd must be array
   const frmHdr = ['FE','FE'];
   const frmFtr = ['FE','0D'];
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
    return this.armAction(mode);
  }
  getCommand_disarm() {
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
