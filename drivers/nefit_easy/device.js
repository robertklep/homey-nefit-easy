const DEBUG           = true;
const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');

const SYNC_INTERVAL = DEBUG ? 10000 : 60000;
const DEBOUNCE_RATE = 500;
const formatValue   = t => Math.round(t.toFixed(1) * 10) / 10

// Capabilities
const INDOOR_TEMP = 'measure_temperature';
const TARGET_TEMP = 'target_temperature';
const PRESSURE    = 'measure_pressure';

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
    this.registerMultipleCapabilityListener([ TARGET_TEMP ] , this.onSetTargetTemperature.bind(this), DEBOUNCE_RATE);

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

  async updateStatus() {
    let [ status, pressure ] = await Promise.all([ this.client.status(), this.client.pressure() ]);

    // Set measured temperature and pressure.
    await this.setCapabilityValue(INDOOR_TEMP, formatValue(status['in house temp']));
    if (this.hasCapability('measure_pressure') && pressure) {
      await this.setCapabilityValue(PRESSURE, formatValue(pressure.pressure));
    }

    // Target temperature depends on the user mode: manual or program.
    let temp = Number(status[ status['user mode'] === 'manual' ? 'temp manual setpoint' : 'temp setpoint' ])
    await this.setCapabilityValue(TARGET_TEMP, formatValue(temp));
  }

  onSetTargetTemperature(value, opts) {
    if (this.getCapabilityValue(TARGET_TEMP) === value) {
      this.log('value matches current, not updating', value);
      return Promise.resolve();
    }
    this.log('setting target temperature to', value);
    return this.client.setTemperature(value).then(s => {
      this.log('...status:', s.status);
      if (s.status === 'ok') {
        return this.setCapabilityValue(TARGET_TEMP, value);
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
