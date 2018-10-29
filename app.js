const Homey    = require('homey');
const camelize = s => s.replace(/(_[a-z])/g, m => m[1].toUpperCase());

module.exports = class NefitEasyApp extends Homey.App {
  onInit() {
    this.log(`${ Homey.manifest.id } is running...(debug mode ${ Homey.env.DEBUG ? 'on' : 'off' })`);
    if (Homey.env.DEBUG) {
      require('inspector').open(9229, '0.0.0.0');
    }

    // Register actions.
    this.registerAction('set_clock_program');
  }

  registerAction(name) {
    const method = camelize(name) + 'Action';
    new Homey.FlowCardAction(name).register()
             .registerRunListener(this[method].bind(this));
  }

  async setClockProgramAction(args, state) {
    return args.device.onSetClockProgramme({ clock_programme : args.value === 'on' });
  }
}
