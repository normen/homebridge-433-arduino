# homebridge-433-arduino
A homebridge plugin to control 433MHz switches and receive 433MHz switch signals using two Arduino Micros connected via USB to send and receive data.

## Introduction
This plugin allows you to use cheap 433MHz wireless switches as lamps, fans or generic switches in HomeKit and control them using Siri. You can also use your 433Mhz remote to control things in HomeKit, like for example start scenes.

### Improvements over other similar plugins
 - Bidirectional, can send and receive switch signals
 - Knows what signals have been sent and received so theres no mixup where it receives its own signal
 - Sending signals works properly and sequentially, no broken signals when many devices are controlled
 - Rock-solid RF signal quality and timing through Arduino micro controller

### Why use Arduinos?
There is plugins out there that use the Raspberry Pi GPIO functions to send and receive 433 MHZ data. The problem with these is that especially the receiving part requires quite a lot of CPU power as the RasPi lacks real hardware interrupts on its GPIO ports. Sending works okay most of the time if the RasPi isn't under much load. The RasPi 1 can struggle to get accurate RF timing with short pulse durations even under low load however.

All of this prompted me to create a plugin that doesn't have these issues. The Arduino Micro is a cheap piece of hardware and believe me if you played around with 433MHz switches and HomeKit, you will definitely appreciate the rock-solid performance of the external receiver and sender.

### Why use TWO Arduinos?
Depending on your setup you can use only a receiver or only a sender as well. But then you will only be able to send or receive. Using two Arduinos ensures that all switches being pressed are properly received and all switch signals are properly broadcast, even when

### Supported switches
Most 433 MHz switches should work, heres a list of ones I or others tried:
- Etekcity 5-port power plug
- Intertechno YWT-800 switch
- Intertechne CMR-1000 actuator

## Installation

### On the homebridge server
#### Install software
1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-433-arduino
3. Update your configuration file. See the sample below.

#### Configure config.json

`serial_port_in`, `serial_port_out` is the USB ports you have your Arduinos connected to, normally /dev/ttyACM0 and /dev/ttyACM1 on Raspberry Pi. If you leave any one of these out of your configuration the plugin will simply not receive or send data. So you can use it to only send or only receive data.

`switches` is the list of configured switches. When Homebridge is running the console will show the needed code and pulse values for any received 433MHz signals it can decode so you can find them out there and enter them in your config file.

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
       "serial_port_in": "/dev/ttyACM0",
 			 "serial_port_out": "/dev/ttyACM1",
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
             "pulse":188
           },
           "off": {
             "code":123459,
             "pulse":188
           }
         }
       ]
     }
   ]
 }

```

### On the Arduinos
#### Installation
1. Install the Arduino IDE in your computer (http://arduino.cc)
2. Install the "rcswitch" library in the Arduino IDE
3. Install the code below on two Arduino Micro devices
```
Dis be code for da arduino
```

## Credits

Credit goes to
- rainlake (https://github.com/rainlake/homebridge-platform-rcswitch)

## License

Published under the MIT License.
