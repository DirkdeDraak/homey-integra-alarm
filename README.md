# Integra Alarm

Control your Satel Integra alarm via the ETHM-1 module

You have to install this manually for now:
1. download this repository
2. start a Terminal session
3. install the Athom cli environment (see https://github.com/athombv/node-athom-cli)
4. go into the directory org.myalarm.integra
5. run: athom login (and follow instructions)
6. run: athom app run

Configure your alarm on the Homey
1. Go to Homey Settings and look for Integra Alarm
2. Set your alarms IP address
3. Set an access code that can arm/disarm the alarm

Go to Homey Flow editor
1. Create a flow and drag to the Integra Alarm device to the THEN column and select arm/disarm
