# Nefit Easy app for Homey (Unofficial)

Control your Nefit Easy thermostat with Homey!

IMPORTANT: This app uses an unsupported and unofficial approach, don't use the app excessively or you might risk being blocked from the Nefit Easy API (temporarily). With regular usage you should not experience any problems. A consequence of this unofficial approach is that the app can only poll to update data every 60 seconds, therefore temperature changed triggers might be delayed a bit.

### Changelog

3.0.2
- Due to changes in the Nefit/Bosch backend the devices paired with the stable (pre-SDKv2) version of this App need to be repaired. This update will mark incompatible devices for re-pairing and re-establish the connection with the Nefit/Bosch backend.

3.0.0 (2018-05-29):
- Fixes due to changes in the Nefit/Bosch backend (which stopped the app from working).

2.0.1:
- Capability changes to play nice with [HomeyKit](https://apps.athom.com/app/com.swttt.homekit). Re-adding device is required (though no enforced if the previous device entry was based on 2.0.0).

2.0.0:
- Update to SDKv2, add various capabilities and functionalities. Re-adding device is enforced.
