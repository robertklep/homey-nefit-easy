const DEBUG           = true;
const Homey           = require('homey');
const NefitEasyClient = require('nefit-easy-commands');
const debounce        = require('debounce');

const SYNC_INTERVAL     = DEBUG ? 10000 : 60000;
const DEBOUNCE_RATE     = 500;
const MEASURED_INDOOR   = 'measure_temperature';
const TARGET            = 'target_temperature';
const formatTemperature = t => Math.round(t.toFixed(1) * 10) / 10

module.exports = class NefitEasyDevice extends Homey.Device {

  async onInit() {
    this.log(`device init, name = ${ this.getName() }, class = ${ this.getClass() }, serial = ${ this.getData().serialNumber }`);
    await this.setUnavailable();

    // Instantiate client for this device.
    try {
      await this.instantiateClient();
    } catch(e) {
      this.log(`unable to initialize device: ${ e.message }`);
      throw e;
    }

    // Device is available.
    await this.setAvailable();

    // Register capabilities.
    this.registerCapabilityListener(TARGET, debounce(this.onSetTargetTemperature, DEBOUNCE_RATE).bind(this));

    // Start syncing periodically..
    this.shouldSync = true;
    this.startSyncing();
  }

  async instantiateClient() {
    const data  = this.getData();
    this.client = NefitEasyClient({
      serialNumber : data.serialNumber,
      accessKey    : data.accessKey,
      password     : data.password,
    });

    await this.client.connect();
    this.log('device connected successfully to backend');

    // Update status.
    return this.updateStatus();
  }

  async updateStatus() {
    let status = this.status = await this.client.status();

    // Set measured temperatures.
    await this.setCapabilityValue(MEASURED_INDOOR, formatTemperature(status['in house temp']));

    // Target temperature depends on the user mode: manual or program.
    let temp = Number(status[ status['user mode'] === 'manual' ? 'temp manual setpoint' : 'temp setpoint' ])
    await this.setCapabilityValue(TARGET, formatTemperature(temp));
  }

  onSetTargetTemperature(value, opts) {
    if (this.getCapabilityValue(TARGET) === value) {
      this.log('value matches current, not updating', value);
      return Promise.resolve();
    }
    this.log('setting target temperature to', value);
    return this.client.setTemperature(value).then(s => {
      this.log('...status:', s.status);
      if (s.status === 'ok') {
        return this.setCapabilityValue(TARGET, value);
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
    this.log('device added');
  }

  // this method is called when the Device is deleted
  onDeleted() {
    this.log('device deleted');
    this.shouldPoll = false;
  }

}
