var NefitEasyClient = require('nefit-easy-commands');

// Keep a list of all clients
var clients = [];

/**
 * When driver is started, make sure all clients are reconnected
 */
module.exports.init = function (devices_data, callback) {

	// Loop over all installed devices and re-establish clients
	for (var x = 0; x < devices_data.length; x++) {

		// Make sure devices shows reconnecting message while unavailable
		module.exports.setUnavailable(devices_data[x], __("reconnecting"));

		// Wrap createClient function to keep the variables in scope
		function wrapperFunction(device_data) {

			// Reconnect
			createClient(device_data, function (err, client) {
				if (!err && client) {

					// If success, add it
					addOrUpdateClient(client);

					// Mark as available
					module.exports.setAvailable(device_data);
				}
				else {

					// Could not create client to connect to device
					module.exports.setUnavailable(device_data, __("not_reachable"));
				}
			});
		}

		// Trigger createClient
		wrapperFunction(devices_data[x]);
	}

	// To simulate realtime events we have to poll
	startPolling();

	// Ready
	callback(null, true);
};

/**
 * Pairing process for the Nefit Easy
 */
module.exports.pair = function (socket) {

	socket.on("validate_device", function (settings, callback) {

		// Try to create a client and connect to it
		var client = NefitEasyClient({
			serialNumber: settings.serialNumber,
			accessKey: settings.accessKey,
			password: settings.password
		});

		// Listen for uncaught exceptions
		client.on('error', function(err) {
			console.error('NefitEasyClient uncaught error', err);
		});

		// Create a timeout for when connection fails
		var timeout = setTimeout(function () {
			callback(true, null);
		}, 10000);

		// Establish connection to client
		client.connect().then(function () {
			return [client.status(), client.pressure()];
		}).spread(function () {

			// Clear error callback
			clearTimeout(timeout);

			// Create id
			settings.id = new Buffer(settings.serialNumber + settings.accessKey).toString('base64');

			// Return settings
			callback(null, settings);
		}).catch(function () {

			// Request could not be made
			callback(true, null);
		});
	});

	// Add device to homey
	socket.on("add_device", function (device) {

		// Store client globally
		addOrUpdateClient(
			NefitEasyClient({
				serialNumber: device.data.serialNumber,
				accessKey: device.data.accessKey,
				password: device.data.password
			})
		);
	});
};

/**
 * These functions represent the capabilities of Toon
 */
module.exports.capabilities = {

	target_temperature: {

		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Get client
			var client = getClient(device_data.serialNumber, device_data.accessKey);

			if (client) {

				// Check if data already present
				if (client.target_temperature) {
					callback(null, client.target_temperature);
				}
				else {
					// Create a timeout for when connection fails
					var timeout = setTimeout(function () {
						callback(true, null);
					}, 10000);

					// Connect client and retrieve status
					client.connect().then(function () {
						return [client.status(), client.pressure()];
					}).spread(function (status) {

						// Clear error callback
						clearTimeout(timeout);

						// Update device data
						client.target_temperature = Math.round(status['temp setpoint'].toFixed(1) * 10) / 10;

						// Return received value
						callback(null, Math.round(status['temp setpoint'].toFixed(1) * 10) / 10);

					}).catch(function () {

						// Clear error callback
						clearTimeout(timeout);

						// Something went wrong
						callback(true, false);
					});
				}
			}
			else {
				callback(true, false);
			}
		},

		set: function (device_data, temperature, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Get client
			var client = getClient(device_data.serialNumber, device_data.accessKey);
			if (client) {
				// Create a timeout for when connection fails
				var timeout = setTimeout(function () {
					callback(true, null);
				}, 10000);

				// Connect client and retrieve status
				client.connect().then(function () {

					// Set temperature
					client.setTemperature(Math.round(temperature.toFixed(1) * 10) / 10);

					// Emit when user changes target temperature
					if (client.target_temperature != Math.round(temperature.toFixed(1) * 10) / 10) {

						// Emit event
						module.exports.realtime(device_data, 'target_temperature', Math.round(temperature.toFixed(1) * 10) / 10);

						// Update device data
						client.target_temperature = Math.round(temperature.toFixed(1) * 10) / 10;
					}

					// Clear error callback
					clearTimeout(timeout);

					// Return received value
					callback(null, temperature);

				}).catch(function () {

					// Clear error callback
					clearTimeout(timeout);

					// Something went wrong
					callback(true, false);
				});
			}
			else {
				callback(true, false);
			}
		}
	},

	measure_temperature: {

		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Get client
			var client = getClient(device_data.serialNumber, device_data.accessKey);
			if (client) {

				// Check if data already present
				if (client.measure_temperature) {
					callback(null, client.measure_temperature);
				}
				else {
					// Create a timeout for when connection fails
					var timeout = setTimeout(function () {
						callback(true, null);
					}, 10000);

					// Connect client and retrieve status
					client.connect().then(function () {
						return [client.status(), client.pressure()];
					}).spread(function (status) {

						// Clear error callback
						clearTimeout(timeout);

						// Update device data
						client.measure_temperature = Math.round(status['in house temp'].toFixed(1) * 10) / 10;

						// Return received value
						callback(null, Math.round(status['in house temp'].toFixed(1) * 10) / 10);

					}).catch(function () {

						// Clear error callback
						clearTimeout(timeout);

						// Something went wrong
						callback(true, false);
					});
				}
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

	// Try to find client
	var client_index = -1;
	for (var x = 0; x < clients.length; x++) {
		if (clients[x].opts.serialNumber === device_data.serialNumber && clients[x].opts.accessKey === device_data.accessKey) {
			client_index = x;
		}
	}

	// If client found, remove it
	if (client_index > -1) {
		clients.splice(client_index, 1);
	}
};

/**
 * Method that re-establishes the connection with a nefit
 * easy client
 * @param device_id
 * @param callback
 */
function createClient(device_data, callback) {

	// Check if device is present and contains data and client
	if (device_data && device_data.serialNumber && device_data.accessKey && device_data.password) {

		// Try to create a client and connect to it
		var client = NefitEasyClient({
			serialNumber: device_data.serialNumber,
			accessKey: device_data.accessKey,
			password: device_data.password
		});

		// Listen for uncaught exceptions
		client.on('error', function(err) {
			console.error('NefitEasyClient uncaught error', err);
		});

		// Create a timeout for when connection fails
		var timeout = setTimeout(function () {
			callback(true, null);
		}, 10000);

		// Establish connection to client
		client.connect().then(function () {
			return [client.status(), client.pressure()];
		}).spread(function (status) {

			// And store temp setpoint
			client.target_temperature = Math.round(status['temp setpoint'].toFixed(1) * 10) / 10;

			// And store in house temp
			client.measure_temperature = Math.round(status['in house temp'].toFixed(1) * 10) / 10;

			// Clear error callback
			clearTimeout(timeout);

			// Return device
			callback(null, client);
		}).catch(function () {
			callback(true, false);
		});
	}
	else {
		callback(true, false);
	}
}

/**
 * Add or update client on internal client list
 * @param client
 * @param callback
 */
function addOrUpdateClient(client) {

	// Check if valid client
	if (client && client.opts && client.opts.serialNumber && client.opts.accessKey) {

		// Try to find client
		var client_index = -1;
		for (var x = 0; x < clients.length; x++) {
			if (clients[x].opts.serialNumber === client.opts.serialNumber && clients[x].opts.accessKey === client.opts.accessKey) {
				client_index = x;
			}
		}

		// If already present
		if (client_index > -1) {

			// First find and delete device
			clients.splice(client_index, 1);

			// Than update it
			clients.push(client);
		}
		else {

			// Add it
			clients.push(client);
		}
	}
}

/**
 * Nefit Easy doesn't support realtime, therefore we have to poll
 * for changes considering the measured and target temperature
 */
function startPolling() {

	// Poll every 30 seconds
	setInterval(function () {

		// Loop over all devices
		for (var i = 0; i < clients.length; i++) {
			var client = clients[i];

			// Get toon object
			if (client) {

				var device_data = {
					id: new Buffer(client.opts.serialNumber + client.opts.accessKey).toString('base64'),
					serialNumber: client.opts.serialNumber,
					accessKey: client.opts.accessKey,
					password: client.opts.password
				};

				// Connect client and retrieve status
				client.connect().then(function () {
					return [client.status(), client.pressure()];
				}).spread(function (status) {

					// Device could be reached, mark as available in case it was unavailable
					module.exports.setAvailable(device_data);

					// If updated temperature is not equal to prev temperature
					if (client.target_temperature && (Math.round(status['temp setpoint'].toFixed(1) * 10) / 10) != client.target_temperature) {

						// Do a realtime update
						module.exports.realtime(device_data, "target_temperature", Math.round(status['temp setpoint'].toFixed(1) * 10) / 10);
					}

					// And store updated value
					client.target_temperature = Math.round(status['temp setpoint'].toFixed(1) * 10) / 10;

					// If updated temperature is not equal to prev temperature
					if (client.measure_temperature && (Math.round(status['in house temp'].toFixed(1) * 10) / 10) != client.measure_temperature) {

						// Do a realtime update
						module.exports.realtime(device_data, "measure_temperature", Math.round(status['in house temp'].toFixed(1) * 10) / 10);
					}

					// And store updated value
					client.measure_temperature = Math.round(status['in house temp'].toFixed(1) * 10) / 10;
				}).catch(function () {

					// Could not create client to connect to device
					module.exports.setUnavailable(device_data, __("not_reachable"));
				});
			}
		}
	}, 1000 * 60);
};

/**
 * Gets a device based on an id
 * @param device_id
 * @returns {*}
 */
function getClient(serialNumber, accessKey) {
	for (var x = 0; x < clients.length; x++) {
		if (clients[x].opts.serialNumber === serialNumber && clients[x].opts.accessKey === accessKey) {
			return clients[x];
		}
	}
};