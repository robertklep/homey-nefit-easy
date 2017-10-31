const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');
const Capabilities    = require('./capabilities');

const DEBOUNCE_RATE = 500;
const formatValue   = t => Math.round(t.toFixed(1) * 10) / 10

process.on('unhandledRejection', r => {
  console.log(r.stack);
});

module.exports = class NefitEasyDevice extends Homey.Device {

  async onInit() {
    this.settings = await this.updateSettings();
    this.log(`device init, name = ${ this.getName() }, class = ${ this.getClass() }, serial = ${ this.settings.serialNumber }`);

    // Instantiate client for this device.
    await this.setUnavailable();
    try {
      this.client = await this.getClient(this.settings);
    } catch(e) {
      this.log(`unable to initialize device: ${ e.message }`);
      throw e;
    }

    // Device is available.
    await this.setAvailable();

    // Register capabilities.
    this.registerCapabilities()

    // Get driver.
    this.driver = await this._getDriver();

    // Start syncing periodically.
    this.shouldSync = true;
    this.startSyncing();
  }

  async _getDriver() {
    return new Promise(resolve => {
      let driver = this.getDriver();
      driver.ready(() => resolve(driver));
    });
  }

  registerCapabilities() {
    this.registerMultipleCapabilityListener([ Capabilities.TARGET_TEMP ],     this.onSetTargetTemperature.bind(this), DEBOUNCE_RATE);
    this.registerMultipleCapabilityListener([ Capabilities.CLOCK_PROGRAMME ], this.onSetClockProgramme   .bind(this), DEBOUNCE_RATE);
  }

  // Merge data (from pairing) with settings.
  async updateSettings() {
    let merged   = Object.assign({}, this.getData());
    let settings = this.getSettings();
    Object.keys(settings).forEach(key => {
      if (settings[key]) {
        merged[key] = settings[key];
      }
    });

    // Merge back into settings.
    let x = await this.setSettings(merged);
    return merged;
  }

  async getClient(settings) {
    let client = NefitEasyClient({
      serialNumber : settings.serialNumber,
      accessKey    : settings.accessKey,
      password     : settings.password,
    });
    await client.connect();
    this.log('device connected successfully to backend');
    return client;
  }

  async setValue(cap, value) {
    if (value == null) return;
    if (typeof value === 'number') {
      value = formatValue(value);
    }
    if (this.getCapabilityValue(cap) !== value) {
      await this.setCapabilityValue(cap, value);
      // Trigger?
      /*
      if (cap in this.driver._triggers) {
        this.log('triggering for', cap);
        await this.driver._triggers[cap].trigger(this, { [ cap ] : value });
      }
      */
    }
  }

  async updateStatus() {
    let [ status, pressure ] = await Promise.all([ this.client.status(), this.client.pressure() ]);

    // Set modes and temperatures.
    if (status) {
      // Target temperature depends on the user mode: manual or program.
      let temp = Number(status[ status['user mode'] === 'manual' ? 'temp manual setpoint' : 'temp setpoint' ])
      this.log('updating all status');
      await Promise.all([
        this.setValue(Capabilities.CLOCK_PROGRAMME, status['user mode'] === 'clock'),
        this.setValue(Capabilities.OPERATING_MODE,  status['boiler indicator']),
        this.setValue(Capabilities.CENTRAL_HEATING, status['boiler indicator'] === 'central heating'),
        this.setValue(Capabilities.INDOOR_TEMP,     status['in house temp']),
        this.setValue(Capabilities.OUTDOOR_TEMP,    status['outdoor temp']),
        this.setValue(Capabilities.TARGET_TEMP,     temp)
      ]);
    }

    // Set pressure, if the device supports it.
    if (this.hasCapability('system_pressure') && pressure && pressure.unit === 'bar') {
      this.log('updating pressure', pressure);
      await this.setValue(Capabilities.PRESSURE, pressure.pressure);
    }
  }

  async onSetTargetTemperature(data, opts) {
    let value = data[Capabilities.TARGET_TEMP];
    this.log('setting target temperature to', value);

    // Retrieve current target temperature from backend.
    let status = await this.client.status();
    let currentValue = formatValue(status[ status['user mode'] === 'manual' ? 'temp manual setpoint' : 'temp setpoint' ]);

    if (currentValue === value) {
      this.log('value matches current, not updating', value);
      // Check if capability value matches.
      if (this.getCapabilityValue(Capabilities.TARGET_TEMP) !== value) {
        await this.setValue(Capabilities.TARGET_TEMP, value);
      }
      return true;
    }

    return this.client.setTemperature(value).then(s => {
      this.log('...status:', s.status);
      if (s.status === 'ok') {
        return this.setValue(Capabilities.TARGET_TEMP, value);
      }
    });
  }

  async onSetClockProgramme(data, opts) {
    let value = data[Capabilities.CLOCK_PROGRAMME];
    this.log('setting programme mode to', value ? 'clock' : 'manual');

    // Retrieve current status from backend.
    let status = await this.client.status();
    let currentValue = status['user mode'] === 'clock';

    if (currentValue === value) {
      this.log('value matches current, not updating');
      // Check if capability value matches.
      if (this.getCapabilityValue(Capabilities.CLOCK_PROGRAMME) !== value) {
        await this.setValue(Capabilities.CLOCK_PROGRAMME, value);
      }
      return true;
    }

    return this.client.setUserMode(value ? 'clock' : 'manual').then(s => {
      this.log('...status:', s.status);
      if (s.status === 'ok') {
        return this.setValue(Capabilities.CLOCK_PROGRAMME, value);
      }
    });
  }

  async startSyncing() {
    // Prevent more than one syncing cycle.
    if (this.hasSyncingStarted) return;

    // Start syncing.
    this.hasSyncingStarted = true;
    this.log('starting sync');
    this.sync();
  }

  async sync() {
    if (! this.shouldSync || this.isSyncing) return;

    this.isSyncing = true;
    this.log('updating status');
    try {
      await this.updateStatus();
      await this.setAvailable();
    } catch(e) {
      this.log('error updating status', e);
      await this.setUnavailable();
    }
    this.isSyncing = false;

    // Schedule next sync.
    let iv = this.settings.syncInterval;
    this.timeout = setTimeout(() => this.sync(), iv === 42 ? 10000 : iv * 1000);
  }

  // this method is called when the Device is added
  async onAdded() {
    this.log('new device added: ', this.getName(), this.getData().serialNumber);
  }

  // this method is called when the Device is deleted
  async onDeleted() {
    this.log('device deleted', this.getName(), this.settings.serialNumber);
    this.client  && this.client.end();
    this.timeout && clearTimeout(this.timeout);
    this.shouldSync = false;
    this.setUnavailable();
  }

  async onSettings(oldSettings, newSettings, changes, callback) {
    // If password has changed, validate client.
    if (changes.includes('password')) {
      let client;
      try {
        client = await this.getClient(newSettings);
        await client.status();
      } catch(e) {
        this.log('unable to validate password change');
        return callback(Homey.__('settings.password'));
      } finally {
        client && client.end();
      }
    }
    this.settings = Object.assign({}, newSettings);
    return callback(null, true);
  }

}
