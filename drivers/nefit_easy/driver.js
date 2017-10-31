const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');
const Device          = require('./device');
const Capabilities    = require('./capabilities');

module.exports = class NefitEasyDriver extends Homey.Driver {

  onInit() {
    // Register flow cards.
    this.registerFlowCards();
  }

  registerFlowCards() {
    this._triggers = {
      [ Capabilities.OPERATING_MODE ] : new Homey.FlowCardTriggerDevice('operating_mode_changed').register().registerRunListener((args, state) => {
        this.log('OM UPDATE', args, state);
        return Promise.resolve(true);
      }),
      [ Capabilities.PRESSURE ]       : new Homey.FlowCardTriggerDevice('system_pressure_changed').register(),
      [ Capabilities.ALARM_PRESSURE ] : new Homey.FlowCardTriggerDevice('alarm_pressure_active').register(),
    }

    this._conditions = {
      operating_mode_matches : new Homey.FlowCardCondition('operating_mode_matches').register().registerRunListener(( args, state ) => {
        return Promise.resolve(args.mode === state[ Capabilities.OPERATING_MODE ]);
      })
    }
  }

  onPair(socket) {
    socket.on('validate_device', this.validateDevice.bind(this));
  }

  async validateDevice(data, callback) {
    this.log('validating new device', data);
    // Check and see if we can connect to the backend with the supplied credentials.
    let client;
    try {
      client = await Device.prototype.getClient.call(this, data);
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

    // Retrieve pressure to see if the device supports it.
    try {
      let pressure = await client.pressure();
      data.supportsPressure = !! pressure;
    } catch(e) {
      // This happens when the Nefit Easy client wasn't able to decode the
      // response from the Nefit backend, which means that the password wasn't
      // correct.
      if (e instanceof SyntaxError) {
        this.log('invalid credentials');
        return callback(Error('credentials'));
      }
      return callback(e);
    } finally {
      client.end();
    }

    // Everything checks out.
    callback(null, { name : 'Nefit Easy', data });
  }

}
