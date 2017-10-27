const DEBUG = true;
const Homey = require('homey');

module.exports = class NefitEasyApp extends Homey.App {
  onInit() {
    this.log(`${ Homey.manifest.id } is running...`);
    if (DEBUG) {
      require('inspector').open(9229, '0.0.0.0');
    }
  }
}
