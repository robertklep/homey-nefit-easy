const Homey = require('homey');

module.exports = class NefitEasyApp extends Homey.App {
  onInit() {
    this.log(`${ Homey.manifest.id } is running...(debug mode ${ Homey.env.DEBUG ? 'on' : 'off' })`);
    if (Homey.env.DEBUG) {
      require('inspector').open(9229, '0.0.0.0');
    }
  }
}
