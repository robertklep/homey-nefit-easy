const NefitEasyClient = require('nefit-easy-commands');

var devices = [];

/**
 *
 */
module.exports.init = function (devices_data, callback) {

	// Loop over all installed devices and reconnect them
	for (var x = 0; x < devices_data.length; x++) {

		// Reconnect
		reconnectClient(devices_data[x].id, function (err, device) {
			if (!err && device) {

				// If success, add it as device
				devices.push(device);
			}
		});
	}

	// Ready
	callback(null, true);
};

/**
 * TODO build input fields for serial/access_key/password -> bcrypt!
 */
module.exports.pair = function (socket) {

	// Show list of devices
	socket.on("nefit_setup", function (data, callback) {

		// TODO Handle incoming nefit credentials

		// TODO Verify credentials

		// TODO Safe encrypted

		// Instantiate client
		const client = NefitEasyClient({
			serialNumber: data.serialNumber,
			accessKey: data.accessKey,
			password: data.password
		});

		// Establish connection to client
		client.connect().then(function () {

			// Construct device
			var device = {
				name: "Nefit Easy",
				data: {
					id: data.serialNumber,
					client: client
				}
			};

			// Return device
			callback(null, device);
		});
	});

	// Add device to homey
	socket.on("add_device", function (device, callback) {

		// Store device globally
		devices.push(device);
	});
}
;

/**
 * These functions represent the capabilities of Toon
 */
module.exports.capabilities = {

	target_temperature: {

		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Get device
			var device = getDevice(device_data.id);

			// Check if device is present and contains data and client
			if (device && device.data && device.data.client) {

				// TODO is this async? Fetch status
				var status = device.data.client.status();

				// Return result
				callback(null, status['temp setpoint']);
			}
			else {
				callback(true, false);
			}
		},

		set: function (device_data, temperature, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Get device
			var device = getDevice(device_data.id);

			// Check if device is present and contains data and client
			if (device && device.data && device.data.client) {

				// TODO is this async? Fetch status
				// TODO check for valid temperature value (between ? and ?)
				device.data.client.setTemperature(temperature);

				// Return result
				callback(null, temperature);
			}
			else {
				callback(true, false);
			}
		}
	},

	measure_temperature: {

		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Get device
			var device = getDevice(device_data.id);

			// Check if device is present and contains data and client
			if (device && device.data && device.data.client) {

				// TODO is this async? Fetch status
				var status = device.data.client.status();

				// Return result
				callback(null, status['in house temp']);
			}
			else {
				callback(true, false);
			}
		}
	}
};

/**
 * Delete devices internally when users removes one
 * @param device_data
 */
module.exports.deleted = function (device_data) {
	var device = getDevice(device_data.id);

	// Find device and delete
	var device_index = devices.indexOf(device);
	if (device_index > -1) {
		devices.splice(device_index, 1);
	}
};

/**
 * Method that re-establishes the connection with a nefit
 * easy client
 * @param device_id
 * @param callback
 */
function reconnectClient(device_id, callback) {

	// Get device
	var device = getDevice(device_id);

	// Check if device is present and contains data and client
	if (device && device.data && device.data.client) {

		// Establish connection to client
		device.data.client.connect().then(function () {

			// Construct device
			var device = {
				name: "Nefit Easy",
				data: {
					id: device.data.serialNumber,
					client: device.data.client
				}
			};

			// Return device
			callback(null, device);
		});
	}
	else {
		callback(true, false);
	}
}

/**
 * Gets a device based on an id
 * @param device_id
 * @returns {*}
 */
function getDevice(device_id) {
	for (var x = 0; x < devices.length; x++) {
		if (devices[x].data.id === device_id) {
			return devices[x];
		}
	}
};