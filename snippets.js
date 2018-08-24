'use strict';

const Homey = require('homey');

class integraAlarm extends Homey.App {

	//	Frame structure
	//	[ 0xFE | 0xFE | cmd | d1 | d2 | ... | dn | crc.high | crc.low | 0xFE | 0x0D ]

	onInit() {
		this.log('integraAlarm is running...');
		// retrieve user defined values from settings
		integraAlarm.ipaddress = Homey.ManagerSettings.get('ipaddress');
		integraAlarm.ipport    = Homey.ManagerSettings.get('ipport');
		if ( integraAlarm.ipport == null || integraAlarm.ipport == "")
			integraAlarm.ipport = 7094;
		integraAlarm.usercode  = Homey.ManagerSettings.get('code');

		Homey.app.log(integraAlarm.ipaddress + " @ " + integraAlarm.ipport)

		this.sendCommand(this.getCommandString_selfinfo())

		// register listener for ACTION "disarm" FlowCard
		let disarmAlarm = new Homey.FlowCardAction('disarm')
		.register()
		.registerRunListener(( args, state ) => {
			Homey.app.log("Disarm alarm")
			this.sendCommand(this.getCommandString_disarm());
//			Homey.setCapabilityValue("homealarm_state", "disarmed", true)
			let isDisarmed = true; // true or false
			return Promise.resolve( isDisarmed );
		})

		// register listener for ACTION "arm" FlowCard
		let armAlarm = new Homey.FlowCardAction('arm')
		.register()
		.registerRunListener(( args, state ) => {
			Homey.app.log("Arm alarm")
			this.sendCommand(this.getCommandString_arm());
			let isArmed = true; // true or false
//			Homey.setCapabilityValue("homealarm_state", "armed", true)
			return Promise.resolve( isArmed );
		})

		// register listener for CONDITION "is_armed"
		let stateAlarm = new Homey.FlowCardCondition('is_armed')
		.register()
		.registerRunListener(( args, state ) => {
			let isArmed = false; // true or false
//			Homey.app.log("Status of the alarm (is it armed?): " + isArmed)
			return Promise.resolve( isArmed );
		})
	}

	sendCommand(cmd){
		// create socket
		var net = require('net');
		var alarm = new net.Socket();
		// set timeout to 750 ms
		alarm.setTimeout(750);
		// connect to alarm system
		alarm.connect(integraAlarm.ipport, integraAlarm.ipaddress, function() {
			Homey.app.log("Connected to " + integraAlarm.ipaddress + ":" + integraAlarm.ipport)
			// if connected, send command in binary format
			alarm.write(new Buffer(cmd,'hex'));
		});
		// upon receiving data from the alarm
		alarm.on('data', function(data) {
			var bindata = data.toString('binary');
			var hexdata = new Buffer(bindata, 'ascii').toString('hex');
			Homey.app.log('Received (hex): ' + hexdata);
			Homey.app.log(hexToByteArray(hexdata))
			alarm.destroy();
			return hexdata;
		});
		alarm.on('error', function(err) {
			Homey.app.log('Error: ' + err);
			alarm.destroy();
		});
		alarm.on('timeout', function() {
			Homey.app.log('Timed out');
			alarm.destroy();
		});
		alarm.on('close', function() {
			Homey.app.log('Connection to ' + integraAlarm.ipaddress + ' closed.');
		});
	}

	// decimal to hex conversion
	dec2hex(i) {
		return (i+0x10000).toString(16).substr(-4).toUpperCase();
	}

	// hex to bin conversion
	hex2bin(hex) {
		return new Buffer(hex,'hex');
	}

  // Convert a hex string to a byte array
	hexToByteArray(hex) {
		// strip 0x prefix from hex value
		hex = hex.toString().replace('0x','');
		for (var bytes = [], c = 0; c < hex.length; c += 2){
			bytes.push(parseInt(hex.substr(c, 2), 16));
		}
		return bytes;
	}

	// Convert a byte array to a hex string
	byteArrayToHex(bytes) {
		for (var hex = [], i = 0; i < bytes.length; i++) {
			hex.push((bytes[i] >>> 4).toString(16));
			hex.push((bytes[i] & 0xF).toString(16));
		}
		return hex.join("").toUpperCase();
	}

	// provide string, fill up to 'len' with 'fill' characters and divide into byte pairs
	stringToHexBytes(str,len,fill){
		if ( str.length < len*2 )
		str = str + fill.repeat(len*2-str.length);
		for (var bytes=[], c=0; c<str.length; c+=2){
			let blk = str.substr(c,2);
			bytes.push(blk);
		}
		return bytes;
	}

	// calculate CRC for given cmd according to satel specifications
	// https://www.satel.pl/en/download/instrukcje/ethm1_op_pl_1.07.pdf
	calculateFrameCrc(hex){
		let crc = "0x147A"
		// loop over bytearray elements
		for (var b of this.hexToByteArray(hex)){
			// rotate 1 bit left
			crc = (( crc << 1) & 0xFFFF) | ( crc & 0x8000) >> 15;
			// xOR with 0xFFFF
			crc = crc ^ 0xFFFF;
			// crc + crc.high + b
			crc = (crc + (crc >> 8) + b) & 0xFFFF
		}
		return this.dec2hex(crc)
	}

	printHex(hex){
		return hex.toString().replace(/(.{2})/g,"$1 ");
	}

	createFrame(cmd){
		var frmHdr = 'FEFE';
		var frmFtr = 'FE0D';

		var crc = this.calculateFrameCrc(cmd)
		Homey.app.log("cmd: " + cmd)
		return (frmHdr + cmd + this.calculateFrameCrc(cmd) + frmFtr).toString().replace('0x','');
	}

	armAction(mode) {
		var cmd = '0x8' + mode;
		// add 4 bytes for user code
		cmd = cmd + this.stringToHexBytes(integraAlarm.usercode,8,'F').toString().replace(/,/g,'')
		// add 4 bytes for partitions to arm
		// partition 01 hardcoded
		cmd = cmd + '01000000'
		// create command frame
		return this.createFrame(cmd);
		// execute command
	}

	getCommandString_arm(mode=0) {
		return this.armAction(mode);
	}

	getCommandString_disarm() {
		return this.armAction(4);
	}

	getCommandString_selfinfo(){
		let cmd = '0xE0';
		// add 4 bytes for user code
		cmd = cmd + this.stringToHexBytes(integraAlarm.usercode,8,'F').toString().replace(/,/g,'')
		return this.createFrame(cmd)
	}
}

module.exports = integraAlarm;
