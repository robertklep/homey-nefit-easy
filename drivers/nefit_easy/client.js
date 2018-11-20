const { NefitEasyCommands } = require('nefit-easy-commands');

module.exports = class NefitEasyClient extends NefitEasyCommands {
  holidayMode() {
    return this.get('/heatingCircuits/hc1/holidayMode/status');
  }

  setHolidayMode(value) {
    return this.put('/heatingCircuits/hc1/holidayMode/status', { value : value ? 'on' : 'off' });
  }
};
