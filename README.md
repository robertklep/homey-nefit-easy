# Nefit Easy app for Homey (Unofficial)

Control your Nefit Easy thermostat with Homey!

IMPORTANT: This app uses an unsupported and unofficial approach, don't use the app excessively or you might risk being blocked from the Nefit Easy API (temporarily). With regular usage you should not experience any problems. A consequence of this unofficial approach is that the app can only poll to update data every 60 seconds, therefore temperature changed triggers might be delayed a bit.

### DEPRECATED

Because I stopped using Homey, and also because I moved house and my new home doesn't use Nefit devices, I can no longer properly support this app, which means I won't be implementing new features or bugfixes.

If another developer wants to assume responsibility for further development of this app, feel free to contact me.

### Changelog

3.2.0 (2018-08-21):
- Reverted to previous XMPP client (more resource-friendly)

3.1.1 (2018-08-10):
- Possible memory leak fix

3.1.0 (2018-08-01):
- Updated core Nefit library to improve autoreconnect behaviour

3.0.3 (2018-07-04):
- Change of ownership

3.0.2 (2018-03-31):
- Due to changes in the Nefit/Bosch backend the devices paired with the stable (pre-SDKv2) version of this App need to be repaired. This update will mark incompatible devices for re-pairing and re-establish the connection with the Nefit/Bosch backend.

3.0.0 (2018-05-29):
- Fixes due to changes in the Nefit/Bosch backend (which stopped the app from working).

2.0.1:
- Capability changes to play nice with [HomeyKit](https://apps.athom.com/app/com.swttt.homekit). Re-adding device is required (though not enforced if the previous device entry was based on 2.0.0).

2.0.0:
- Update to SDKv2, add various capabilities and functionalities. Re-adding device is enforced.
