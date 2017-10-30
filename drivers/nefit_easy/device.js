const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');

const DEBOUNCE_RATE = 500;
const formatValue   = t => Math.round(t.toFixed(1) * 10) / 10

// Capabilities
const INDOOR_TEMP     = 'measure_temperature';
const TARGET_TEMP     = 'target_temperature';
const PRESSURE        = 'system_pressure';
const CLOCK_PROGRAMME = 'clock_programme';
const OPERATING_MODE  = 'operating_mode';

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
    this.registerMultipleCapabilityListener([ TARGET_TEMP ],     this.onSetTargetTemperature.bind(this), DEBOUNCE_RATE);
    this.registerMultipleCapabilityListener([ CLOCK_PROGRAMME ], this.onSetClockProgramme   .bind(this), DEBOUNCE_RATE);

    // Start syncing periodically..
    this.shouldSync = true;
    this.startSyncing();
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
      return await this.setCapabilityValue(cap, value);
    }
  }

  async updateStatus() {
    let [ status, pressure ] = await Promise.all([ this.client.status(), this.client.pressure() ]);

    // Set modes and temperatures.
    if (status) {
      // Target temperature depends on the user mode: manual or program.
      let temp = Number(status[ status['user mode'] === 'manual' ? 'temp manual setpoint' : 'temp setpoint' ])
      await Promise.all([
        this.setValue(CLOCK_PROGRAMME, status['user mode'] === 'clock'),
        this.setValue(OPERATING_MODE,  status['boiler indicator']),
        this.setValue(INDOOR_TEMP,     status['in house temp']),
        this.setValue(TARGET_TEMP,     temp)
      ]);
    }

    // Set pressure, if the device supports it.
    if (this.hasCapability('system_pressure') && pressure) {
      await this.setValue(PRESSURE, pressure.pressure);
    }
  }

  onSetTargetTemperature(value, opts) {
    this.log('setting target temperature to', value);
    if (this.getCapabilityValue(TARGET_TEMP) === value) {
      this.log('value matches current, not updating', value);
      return Promise.resolve();
    }
    return this.client.setTemperature(value).then(s => {
      this.log('...status:', s.status);
      if (s.status === 'ok') {
        return this.setValue(TARGET_TEMP, value);
      }
    });
  }

  onSetClockProgramme(value, opts) {
    value = value[CLOCK_PROGRAMME];
    this.log('setting programme mode to', value ? 'clock' : 'manual');
    if (this.getCapabilityValue(CLOCK_PROGRAMME) === value) {
      this.log('value matches current, not updating');
      return Promise.resolve();
    }
    return this.client.setUserMode(value ? 'clock' : 'manual').then(s => {
      this.log('...status:', s.status);
      if (s.status === 'ok') {
        return this.setValue(CLOCK_PROGRAMME, value);
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
      this.log('error updating status', e.message);
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
