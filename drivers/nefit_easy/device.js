const DEBUG           = true;
const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');

const SYNC_INTERVAL = DEBUG ? 10000 : 60000;
const DEBOUNCE_RATE = 500;
const formatValue   = t => Math.round(t.toFixed(1) * 10) / 10

// Capabilities
const INDOOR_TEMP     = 'measure_temperature';
const TARGET_TEMP     = 'target_temperature';
const PRESSURE        = 'measure_pressure';
const CLOCK_PROGRAMME = 'clock_programme';
const OPERATING_MODE  = 'operating_mode';

module.exports = class NefitEasyDevice extends Homey.Device {

  async onInit() {
    this.log(`device init, name = ${ this.getName() }, class = ${ this.getClass() }, serial = ${ this.getData().serialNumber }`);
    await this.setUnavailable();

    // Instantiate client for this device.
    try {
      this.client = await this.instantiateClient(this.getData());
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

  async instantiateClient(data) {
    let client = NefitEasyClient({
      serialNumber : data.serialNumber,
      accessKey    : data.accessKey,
      password     : data.password,
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
    if (this.hasCapability('measure_pressure') && pressure) {
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
    this.timeout = setTimeout(() => this.sync(), SYNC_INTERVAL);
  }

  // this method is called when the Device is added
  onAdded() {
    this.log('new device added', this.getName(), this.getData().serialNumber);
  }

  // this method is called when the Device is deleted
  onDeleted() {
    this.log('device deleted', this.getName(), this.getData().serialNumber);
    if (this.client) {
      this.client.end();
    }
    this.shouldSync = false;
  }

}
