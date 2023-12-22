# DISCONTINUED

As I moved my whole setup to a [FHEM](https://fhem.de) server with a [SIGNALduino](https://github.com/RFD-FHEM/SIGNALDuino) this project is now deprecated. This does *not* mean that its not working or will stop working in the future.

The good news is that if you want to change your existing setup to a SIGNALDuino as well you probably already have all the hardware to do that.

If you are using the CC1101 sender theres a good chance you can make a SIGNALDuino from that hardware! Check the [arduino-433](https://github.com/normen/arduino-433) project for instructions.

## Migration to FHEM

- Use max cube or build/buy a CUL 868MHz stick
- Install [FHEM](https://fhem.de) on server
- Install [fhem plugin](https://github.com/justme-1968/homebridge-fhem) in homebridge
- Define siri in fhem
- Define SIGNALduino in fhem
- Discover devices, apply fixes below if needed
- Set siriName for devices that should appear in HomeBridge
- Optionally set homebridgeMapping for special devices
- Profit

#### AttrTemplates

To ease the setup of some switches I created so called `attrTemplate` files to quickly apply settings to a discovered switch. Some switches needed some massaging to work correctly.

Put [this file](normensTemplates.template) in your `/opt/fhem/FHEM/lib/AttrTemplate` folder, then apply the templates through the FHEMWEB UI `set` command or otherwise.

- `433_Clarus_fix`
  - Fix "Clarus" switches (cheap socket switches)
  - Fixes wrong on/off codes ("Code 01 Unknown")
  - Adapts pulse frequency so switches react
- `433_Intertechno_fix`
  - Fix "Intertechno" switches (especially old)
  - Adapts pulse frequency so switches react better
- `Add_Switches`
  - Add "Buttons" for existing switches on/off presses
- `Make_SmokeDetect`
  - Makes a smoke detector from IT devices that are recognized as a switch
  - Adds a watchdog that resets the "on" state automatically
- `Make_LeakDetect`
  - Makes a leak detector from IT devices that are recognized as a switch
  - Adds a watchdog that resets the "on" state automatically
- `Make_MotionSensor`
  - Makes a motion detector from IT devices that are recognized as a switch
  - Adds a watchdog that resets the "on" state automatically


# homebridge-433-arduino
[![NPM Version](https://img.shields.io/npm/v/homebridge-433-arduino.svg)](https://www.npmjs.com/package/homebridge-433-arduino) [![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A homebridge plugin to control 433MHz switches and receive 433MHz switch signals using an Arduino Micro or an ESP8266 / ESP32 connected via USB or WiFi to send and receive data.

## Introduction
This plugin allows you to use cheap 433MHz wireless switches as lamps, fans or generic switches in HomeKit and control them using Siri. You can also use your 433Mhz remote to control things in HomeKit, like for example start scenes.

### Improvements over other similar plugins
 - Bidirectional, can send and receive switch signals
 - Virtually no CPU load on the server (RasPi) even when receiving
 - Sending signals works properly and sequentially, no broken signals when many devices are controlled
 - Rock-solid RF signal quality and timing through external micro controller
 - Transceiver can use WiFi so it doesn't need a physical connection to the homebridge server
 - Supports homebridge-config-ui-x to set up switches via web interface

### Why use an external microcontroller?
There is plugins out there that use the Raspberry Pi GPIO functions to send and receive 433 MHZ data. The problem with these is that especially the receiving part requires quite a lot of CPU power as the RasPi lacks real hardware interrupts on its GPIO ports. Sending works okay most of the time if the RasPi isn't under much load. The RasPi 1 can struggle to get accurate RF timing with short pulse durations even under low load however.

Additionally, the RasPi works on 3.3V and most simple 433MHz receivers/transmitters work best at 5V. The Arduino micro for example runs on 5V and allows a much more stable connection to the receivers and transmitters.

### Supported switches
Most cheap 433 MHz switches should work, the transceiver can use either rc-switch or ESPiLight to encode and decode signals. ESPiLight is recommended as it supports more switch types but as the name suggests it requires ESP hardware.

## Installation
### Hardware
The software for the microcontroller has it's own github project. For info on how to set up the microcontroller hardware, see this page: https://github.com/normen/arduino-433

### Homebridge
#### Install software
1. Install this plugin using: `npm install --unsafe-perm -g homebridge-433-arduino`
2. Update your configuration file. See the sample below.
3. Optionally if you have homebridge-config-ui-x installed use the settings panel to configure the plugin

#### Configure config.json
##### Example config.json
 ```javascript
 {
   "bridge": {
     "name": "#####",
     "username": "",
     "port": 51826,
     "pin": ""
   },

   "platforms": [
     {
       "platform": "ArduinoRCSwitch",
       "name": "Arduino RC Switch Platform",
       "serial_port": "/dev/ttyACM0",
       "switches": [
         {
           "name" : "My Device",
           "on": {
             "code":123456,
             "pulse":188
           },
           "off": {
             "code":123457,
             "pulse":188
           }
         },
         {
           "name" : "My Other Device",
           "on": {
             "code":123458,
             "pulse":188,
             "protocol":2
           },
           "off": {
             "code":123459,
             "pulse":188,
             "protocol":2
           }
         }
       ],
       "buttons": [
         {
           "name" : "My Button",
           "code":123450,
           "pulse":188
         }
       ],
       "detectors": [
         {
           "name" : "My Smoke Detector",
           "code":1234502,
           "pulse":366
         }
       ],
       "sensors": [
         {
           "name" : "My Leak Sensor",
           "code":1234503,
           "pulse":366
         }
       ]
     }
   ]
 }

```
##### Settings
- `serial_port` is the USB port you have your Arduino connected to, normally /dev/ttyACM0 (Arduino) or /dev/ttyUSB0 (ESP) on Raspberry Pi. To find the right port do a `ls /dev/tty*`, then connect the transceiver and do `ls /dev/tty*` again, the newly added port is the right one.

- `switches` is the list of configured switches. When Homebridge is running the console will show the needed code and pulse values for any received 433MHz signals it can decode so you can find them there and enter them in your config.json file. Switches work bidirectionally, when a switch is changed in homekit a 433 signal is sent, when the 433 signal is received the switch in homekit is changed.

- `buttons` is a list of configured buttons. Buttons work differently in that there is no on/off pair, each signal is routed to its own switch. These switches enable for one second and then disable again. This makes it easy to trigger scenes with these buttons regardless of their on/off state.
Buttons only work for receiving signals.

- `detectors` is a list of configured smoke detectors. Smoke detectors will only report their current state (smoke detected or not).

- `sensors` is a list of configured leak sensors. Leak sensors will only report their current state (leak detected or not).

- `motion` is a list of configured motion sensors. Motion sensors will only report their current state (motion detected or not).

##### Optional settings
- `host` is the hostname of the WiFi transceiver, not used when serial_port is given. When running on ESP hardware the library can optionally use WiFi / websockets instead of a serial port to connect to the transceiver.

- `port` is the port of the WiFi transceiver, not used when serial_port is given

- `input_output_timeout` is the time in milliseconds that the plugin waits after it has received a signal before sending any signals itself. This is to avoid interfering with switches that send signals. If both the Arduino and the switch are sending at the same time none of the signals will be decoded by the receivers. The default value is `100`.
You will only need this value if you have 433 switches that control scenes which in turn control 433 plugs. In that case the switch is sending 433 signals and if the plugin would start sending immediately when it decodes the first signal it might start sending while the switch is still sending as well, mixing the signals.
Decrease this value to get quicker response of 433 plugs in the aforementioned scenarios, increase it if 433 plugs don't react at all in such scenarios.

- `throttle` is the time in milliseconds that the incoming signal of a single button or switch will be throttled. This is to avoid switches triggering HomeKit multiple times when pressed. The default value is `500`.

##### ESPiLight
Optionally you can use the ESPiLight library instead of rc-switch on the transceiver which supports a wider range of 433MHz devices. When using it (configured in the Arduino code) the format of the messages changes from code/pulse/protocol to type and message (different for each switch type), see below for an example.

Note that for some switches not all of the received info that is given in the homebridge log needs to be added to the config.json. Usually "id", "unit" and "state" are enough.

##### Example config.json with Websockets & ESPPiLight
For switches that report "up" and "down" for the state instead of "on" and "off" you can specify "state":"up" in the configuration to account for that. For buttons you have to specify which state you want to use as a button.

```javascript
"platforms": [
    {
      "platform": "ArduinoRCSwitch",
      "name": "Arduino RC Switch Platform",
      "host": "arduino-433",
      "port": 80,
      "switches": [
        {
          "name" : "My Device",
          "type": "clarus_switch",
          "message":{
            "id": "A3",
            "unit": 60
          }
        }
      ],
      "buttons": [
        {
          "name" : "My Button",
          "type": "clarus_switch",
          "message":{
            "id": "B4",
            "unit": 20,
            "state": "off"
          }
        }
      ]
    }
]
```

## Usage
### Adding Switches
To add switches press a button on the remote control that came with the switch and watch the homebridge log. Switch messages should appear in the log, giving you the needed information to fill out config.json or add switches through the web interface settings panel.

See the wiki for more info as well as tips&tricks for getting your switches to work. Also please add your own info about switches.

https://github.com/normen/homebridge-433-arduino/wiki

## Development
If you want new features or improve the plugin, you're very welcome to do so. The projects `devDependencies` include homebridge and the `npm run test` command has been adapted so that you can run a test instance of homebridge during development. 
#### Setup
- clone github repo
- `npm install` in the project folder
- create `.homebridge` folder in project root
- add `config.json` with appropriate content to `.homebridge` folder
- run `npm run test` to start the homebridge instance for testing

## Credits

Credit goes to
- rainlake (https://github.com/rainlake/homebridge-platform-rcswitch)

## License

Published under the MIT License.
