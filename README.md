# homebridge-433-arduino
[![NPM Version](https://img.shields.io/npm/v/homebridge-433-arduino.svg)](https://www.npmjs.com/package/homebridge-433-arduino)

A homebridge plugin to control 433MHz switches and receive 433MHz switch signals using an Arduino Micro connected via USB or an ESP8266 / ESP32 via WiFi to send and receive data.

## Introduction
This plugin allows you to use cheap 433MHz wireless switches as lamps, fans or generic switches in HomeKit and control them using Siri. You can also use your 433Mhz remote to control things in HomeKit, like for example start scenes.

### Improvements over other similar plugins
 - Bidirectional, can send and receive switch signals
 - Virtually no CPU load on the server (RasPi) even when receiving
 - Sending signals works properly and sequentially, no broken signals when many devices are controlled
 - Knows what signals have been sent and received so theres no mixup where it receives its own signal
 - Rock-solid RF signal quality and timing through Arduino micro controller

### Why use an Arduino?
There is plugins out there that use the Raspberry Pi GPIO functions to send and receive 433 MHZ data. The problem with these is that especially the receiving part requires quite a lot of CPU power as the RasPi lacks real hardware interrupts on its GPIO ports. Sending works okay most of the time if the RasPi isn't under much load. The RasPi 1 can struggle to get accurate RF timing with short pulse durations even under low load however.

Additionally, the RasPi works on 3.3V and most 433MHz receivers/transmitters work best at 5V. The Arduino micro runs on 5V and allows a much more stable connection to the receivers and transmitters.

All of this prompted me to create a plugin that doesn't have these issues. The Arduino Micro is a cheap piece of hardware and believe me if you played around with 433MHz switches and HomeKit, you will definitely appreciate the rock-solid performance of the external receiver and sender.

### Supported switches
Most 433 MHz switches should work, heres a list of ones I or others tried:
- Etekcity 5-port power plug
- Intertechno YWT-800 switch
- Intertechno CMR-1000 actuator

Even unsupported switches can be made to work, see below. Optionally on ESP you can use ESPiLight to be able to control even more devices out of the box (see below).

## Installation
This is the simple setup with an Arduino on the serial port and simple 433MHz receiver/sender pairs, see below for using CC1101 or ESP hardware as well as WiFi / Websockets for the connection.

### On the Arduino
You will need an Arduino Micro. Other Arduinos should work too but you might have to adapt the pin numbers accordingly. I like the Micro because of its size and relative power.

You will also need a 433MHz sender/receiver pair. For the sender you can use basically any 433MHz module (e.g FS1000A). For the receiver the very cheap modules didn't work properly for me, try to get the "superheterodyne" (NOT superregeneration) receiver as it works MUCH better.

#### Installation
1. Install the Arduino IDE in your computer (http://arduino.cc)
2. Install the "rc-switch" library in the Arduino IDE (https://github.com/sui77/rc-switch)
3. Connect a 433 MHz receiver to pin 3 and power on the Arduino Micro
4. Connect a 433 MHz sender to pin 4 and power on the Arduino Micro
5. Install the code below on the Arduino Micro and connect it to the homebridge server via USB

```
/*
  Arduino code for homebridge-433-arduino v0.9
  (c) by Normen Hansen, released under MIT license
  uses code from  http://forum.arduino.cc/index.php?topic=396450.0
*/

#include <RCSwitch.h>
RCSwitch mySwitch = RCSwitch();
const byte numChars = 255; // max number of received chars
char receivedChars[numChars]; // an array to store the received data
boolean newData = false; // was a full new string received?
String dash = "/";

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(100);
  mySwitch.enableReceive(0);  // Receiver on interrupt 0 => that is pin #3 on micro!!
  mySwitch.enableTransmit(4); // Actual Pin 4
  mySwitch.setRepeatTransmit(5);
}

// gets the values from a string formatted like 123456/123
String getValue(String data, char separator, int index) {
  int found = 0;
  int strIndex[] = {0, -1};
  int maxIndex = data.length()-1;
  for(int i=0; i<=maxIndex && found<=index; i++){
    if(data.charAt(i)==separator || i==maxIndex){
      found++;
      strIndex[0] = strIndex[1]+1;
      strIndex[1] = (i == maxIndex) ? i+1 : i;
    }
  }
  return found>index ? data.substring(strIndex[0], strIndex[1]) : "";
}

void receiveSerialData() {
    static byte ndx = 0;
    char endMarker = '\n';
    char rc;
    if (Serial.available() > 0) {
        rc = Serial.read();
        if (rc != endMarker) {
            receivedChars[ndx] = rc;
            ndx++;
            if (ndx >= numChars) {
                ndx = numChars - 1;
            }
        }
        else {
            receivedChars[ndx] = '\0'; // terminate the string
            ndx = 0;
            newData = true;
        }
    }
}

void sendRcData() {
    if (newData == true) {
        long value = getValue(receivedChars, '/', 0).toInt();
        long pulse = getValue(receivedChars, '/', 1).toInt();
        long protocol = getValue(receivedChars, '/', 2).toInt();
        if(protocol==0) protocol = 1;
        mySwitch.setProtocol(protocol);
        mySwitch.setPulseLength(pulse);
        mySwitch.send(value, 24);
        Serial.println("OK");
        newData = false;
    }
}

void receiveRcData(){
  if (mySwitch.available()) {
    long value = mySwitch.getReceivedValue();
    long pulse = mySwitch.getReceivedDelay();
    long protocol = mySwitch.getReceivedProtocol();
    if (value != 0) {
      String out = value + dash + pulse + dash + protocol;
      Serial.println( out );
    }
    mySwitch.resetAvailable();
  }
}

void loop() {
  receiveSerialData();
  sendRcData();
  receiveRcData();
}
```

### On the homebridge server
#### Install software
1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install --unsafe-perm -g homebridge-433-arduino
3. Update your configuration file. See the sample below.

#### Configure config.json

`serial_port` is the USB port you have your Arduino connected to, normally /dev/ttyACM0 (Arduino) or /dev/ttyUSB0 (ESP) on Raspberry Pi.

`switches` is the list of configured switches. When Homebridge is running the console will show the needed code and pulse values for any received 433MHz signals it can decode so you can find them there and enter them in your config.json file.

Switches work bidirectionally, when a switch is changed in homekit a 433 signal is sent, when the 433 signal is received the switch in homekit is changed.

`buttons` is a list of configured buttons. Buttons work differently in that there is no on/off pair, each signal is routed to its own switch. These switches enable for one second and then disable again. This makes it easy to trigger scenes with these buttons regardless of their on/off state.

Buttons only work for receiving signals.

`detectors` is a list of configured smoke detectors.

Smoke detectors will only report their current state (smoke detected or not).

`sensors` is a list of configured leak sensors.

Leak sensors will only report their current state (leak detected or not).

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
         },
         {
           "name" : "My Other Button",
           "code":1234501,
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

##### Optional settings
`host` is the hostname of the ESP based transceiver, not used when serial_port is given

`port` is the port of the ESP based transceiver, not used when serial_port is given

`input_output_timeout` is the time in milliseconds that the plugin waits after it has received a signal before sending any signals itself. This is to avoid interfering with switches that send signals. If both the Arduino and the switch are sending at the same time none of the signals will be decoded by the receivers. The default value is `500`.

You will only need this value if you have 433 switches that control scenes which in turn control 433 plugs. In that case the switch is sending 433 signals and if the plugin would start sending immediately when it decodes the first signal it might start sending while the switch is still sending as well, mixing the signals.

Decrease this value to get quicker response of 433 plugs in the aforementioned scenarios, increase it if 433 plugs don't react at all in such scenarios.

`throttle` is the time in milliseconds that the incoming signal of a single button or switch will be throttled. This is to avoid switches triggering HomeKit multiple times when pressed. The default value is `500`.

### Adding support for unsupported Switches
If you have a 433 device that doesn't work you can try and download a different version of the rcswitch library and run a "discovery application" that suggests how to extend the rcswitch.cpp file to add support for the unknown signal:

https://github.com/Martin-Laclaustra/rc-switch/

Download the modified rc-switch branch "protocollessreceiver", it includes the discovery code for Arduino. It should run as is on the 433 board for this project.

## Advanced Installation (WIP)
The installation above is the simple solution and works fine for many switches and with low-cost hardware. However an extended version of the Arduino code is available that allows using more powerful ESP hardware and supports CC1101 based transceivers.

See here for the extended code and how to configure and use it: https://github.com/normen/arduino-433

Read the above simple installation instructions before to understand how the library works in general.

#### WiFi / Websockets
When running on ESP hardware the library can optionally use WiFi / websockets instead of a serial port to connect to the transceiver, specify `host` & `port` of the transceiver in the config.json instead of `serial_port`.

#### ESPiLight
Optionally you can use the ESPiLight library instead of rc-switch which supports a wider range of 433MHz devices. When using it (configured in the Arduino code) the format of the messages changes from code/pulse/protocol to type and message (different for each switch type), see below for an example.

Note that for some switches not all of the received info that is given in the homebridge log needs to be added to the config.json. Usually "id", "unit" and "state" are enough.

#### CC1101
The extended library also allows using a CC1101 based transceiver with either Arduino or ESP hardware. Note that this transceiver is usually 3.3V only and should not be used with Arduino Micro (5V), Arduino Nano or ESP8266 will work (3.3V).

### Example config.json with Websockets & ESPPiLight
Note that for switches you can specify "state":"on" or "state":"off", they will still switch on and off as intended. For buttons you have to specify which of the two states you want to use as a button.

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
          "type": "my_type",
          "message":{
            "id": "A3",
            "unit": "60",
            "state": "on"
          }
        }
      ],
      "buttons": [
        {
          "name" : "My Button",
          "type": "my_type",
          "message":{
            "id": "B4",
            "unit": "20",
            "state": "off"
          }
        }
      ]
    }
]
```

## Credits

Credit goes to
- rainlake (https://github.com/rainlake/homebridge-platform-rcswitch)

## License

Published under the MIT License.
