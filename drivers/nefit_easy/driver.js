const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');
const Device          = require('./device');

module.exports = class NefitEasyDriver extends Homey.Driver {

  onPair(socket) {
    socket.on('validate_device', this.validateDevice.bind(this));
  }

  async validateDevice(data, callback) {
    this.log('validating new device');
    // Check and see if we can connect to the backend with the supplied credentials.
    let client;
    try {
      client = await Device.prototype.instantiateClient.call(this, data);
    } catch(e) {
      this.log('unable to instantiate client:', e.message);
      return callback(e);
    }

    // Check for duplicate.
    let device = this.getDevice(data);
    if (device instanceof Homey.Device) {
      this.log('device is already registered');
      client.end();
      return callback(Error('duplicate'));
    }

    // Load default supported capabilities for the device
    // from the app manifest.
    let capabilities = require('../../app.json').drivers[0].capabilities;

    // Retrieve pressure to see if the device supports it.
    try {
      let pressure = await client.pressure();
      if (pressure) {
        capabilities.push('measure_pressure');
      }
    } catch(e) {
      client.end();
      // This happens when the Nefit Easy client wasn't able to decode the
      // response from the Nefit backend, which means that the password wasn't
      // correct.
      if (e instanceof SyntaxError) {
        this.log('invalid credentials');
        return callback(Error('credentials'));
      }
      return callback(e);
    }
    this.log('supported capabilities:', capabilities);

    // Close connection
    client.end();

    // Everything checks out.
    callback(null, { name : 'Nefit Easy', data, capabilities });
  }

}
