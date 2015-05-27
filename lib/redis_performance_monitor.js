/**
 * This script was developed by Guberni and is part of Tellki's Monitoring Solution
 *
 * March, 2015
 * 
 * Version 1.0
 * 
 * DESCRIPTION: Monitor Redis performance
 *
 * SYNTAX: node redis_performance_monitor.js <METRIC_STATE> <HOST> <PORT> <PASS_WORD>
 * 
 * EXAMPLE: node redis_performance_monitor.js "1,1,1,1,1,1,1,1,1,1,1,1" "10.10.2.5" "6379" "password"
 *
 * README:
 *		<METRIC_STATE> is generated internally by Tellki and it's only used by Tellki default monitors: 1 - metric is on; 0 - metric is off
 *		<HOST> redis ip address or hostname
 *		<PORT> redis port
 *		<PASS_WORD> redis password
 */

var fs = require('fs');
var redis = require('redis');
 
/**
 * Metrics.
 */
var metrics = [];
metrics['ConnectionsPerSecond'] 	= { id : '1633:Connections/Sec:4', 				key : 'total_connections_received', ratio : true };
metrics['ConnectedClients'] 		= { id : '1634:Connected Clients:4', 			key : 'connected_clients', 			ratio : false };
metrics['BlockedClients']		 	= { id : '1635:Blocked Clients:4', 				key : 'blocked_clients', 			ratio : false };
metrics['UsedMemory'] 				= { id : '1636:Used Memory:4', 					key : 'used_memory', 				ratio : false };
metrics['CommandsPerSecond'] 		= { id : '1637:Commands/Sec:4', 				key : 'total_commands_processed', 	ratio : true };
metrics['KeyHits'] 					= { id : '1638:Key Hits:4', 					key : 'keyspace_hits', 				ratio : false };
metrics['KeyMisses'] 				= { id : '1639:Key Misses:4', 					key : 'keyspace_misses', 			ratio : false };
metrics['KeysEvicted'] 				= { id : '1640:Keys Evicted:4', 				key : 'evicted_keys', 				ratio : false };
metrics['KeysExpired'] 				= { id : '1641:Keys Expired:4', 				key : 'expired_keys', 				ratio : false };
metrics['BackgroundSaveInProgress'] = { id : '1642:Background Save:9',				key : 'rdb_bgsave_in_progress', 	ratio : false };
metrics['ChangesSinceLastSave'] 	= { id : '1643:Changes since last Save:4', 		key : 'rdb_changes_since_last_save', ratio : false };
metrics['ConnectedSlaves'] 			= { id : '1644:Connected Slaves:4', 			key : 'connected_slaves', 			ratio : false };

var tempDir = '/tmp';
var sleepTime = 1000;

/**
 * Entry point.
 */
(function() {
	try
	{
		monitorInput(process.argv);
	}
	catch(err)
	{	
		if(err instanceof InvalidParametersNumberError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof InvalidAuthenticationError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof UnknownHostError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else
		{
			console.log(err.message);
			process.exit(1);
		}
	}
}).call(this);

// ############################################################################
// PARSE INPUT

/**
 * Verify number of passed arguments into the script.
 */
function monitorInput(args)
{
	args = args.slice(2);
	if(args.length != 4)
		throw new InvalidParametersNumberError();
	
	monitorInputProcess(args);
}

/**
 * Process the passed arguments and send them to monitor execution.
 * Receive: arguments to be processed
 */
function monitorInputProcess(args)
{
	//<METRIC_STATE>
	var metricState = args[0].replace('"', '');
	var tokens = metricState.split(',');
	var metricsExecution = new Array(7);
	for (var i in tokens)
		metricsExecution[i] = (tokens[i] === '1');
	
	//<HOST> 
	var hostname = args[1];
	
	//<PORT> 
	var port = args[2];
	if (port.length === 0)
		port = '6379';
		
	// <USER_NAME> 
	var username = args[3];
	username = username.length === 0 ? '' : username;
	username = username === '""' ? '' : username;
	if (username.length === 1 && username === '"')
		username = '';
	
	// <PASS_WORD>
	var passwd = args[3];
	passwd = passwd.length === 0 ? '' : passwd;
	passwd = passwd === '""' ? '' : passwd;
	if (passwd.length === 1 && passwd === '"')
		passwd = '';

	// Create request object to be executed.	
	var request = new Object();
	request.checkMetrics = metricsExecution;
	request.hostname = hostname;
	request.port = port;
	request.passwd = passwd;
	
	// Call monitor.
	monitorRedis(request);
}

// ############################################################################
// GET METRICS

/**
 * Retrieve metrics information
 * Receive: object request containing configuration
 *
 * HTTP request to retrieve data
 * Receive:
 * - request: object containing request configuration
 */
function monitorRedis(request)
{
	var metricsObj = [];
	var client = redis.createClient(request.port, request.hostname, {});

	if (request.passwd !== '')
	{
		client.auth(request.passwd);
	}
	
	client.on('connect', function() {
		processInfo(client, metricsObj, request);
	});
	
	client.on('error', function (err) {
		if (err !== undefined && (err.message.indexOf('NOAUTH') != -1 || err.message.indexOf('invalid password') != -1))
		{
			client.quit();
			errorHandler(new InvalidAuthenticationError());
		}
		
		if (err !== undefined && (err.message.indexOf('ENETUNREACH') != -1 || err.message.indexOf('ECONNREFUSED') != -1))
		{
			client.quit();
			errorHandler(new UnknownHostError());
		}
			
		errorHandler(err.message);
	});
}

/**
 * Get metrics from INFO command.
 */
function processInfo(client, metricsObj, request)
{
	client.info(function(err, data) {
		var data = parseInfo(data);
		var jsonString = '[';
		var dateTime = new Date().toISOString();
		
		var i = 0;
		for(var key in metrics)
		{
			if (request.checkMetrics[i])
			{
				var metric = metrics[key];
				var val = data[metric.key] + '';
				
				if (key === 'BackgroundSaveInProgress')
					val = val === '0' ? 1 : 0;
				
				if (key === 'UsedMemory')
					val = parseInt(val, 10) / 1024 / 1024;
							
				jsonString += '{';
				jsonString += '"variableName":"' + key + '",';
				jsonString += '"metricUUID":"' + metric.id + '",';
				jsonString += '"timestamp":"' + dateTime + '",';
				jsonString += '"value":"' + val + '"';
				jsonString += '},';
			}
			i++;
		}
	
		if(jsonString.length > 1)
			jsonString = jsonString.slice(0, jsonString.length - 1);
		jsonString += ']';
		
		processDeltas(request, jsonString);

		client.quit();
	});
}

/**
 * Parse INFO command output.
 */
function parseInfo(info)
{
	var lines = info.split('\r\n');
	var obj = {};
	for (var i = 0, l = info.length; i < l; i++)
	{
		var line = lines[i];
		if (line && line.split)
		{
			line = line.split(':');
			if (line.length > 1)
			{
				var key = line.shift();
				obj[key] = line.join(':');
			}
		}
	}
	return obj;
}

// ############################################################################
// OUTPUT METRICS

/**
 * Send metrics to console
 * Receive: metrics list to output
 */
function output(metrics)
{
	for (var i in metrics)
	{
		var out = "";
		var metric = metrics[i];
		
		out += metric.id;
		out += "|";
		out += metric.value;
		out += "|";
		
		console.log(out);
	}
}


// ############################################################################
// RATE PROCESSING

/**
 * Process performance results
 * Receive: 
 * - request object containing configuration
 * - retrived results
 */
function processDeltas(request, results)
{
	var file = getFile(request.hostname, request.port);
	var toOutput = [];
	
	if (file)
	{		
		var previousData = JSON.parse(file);
		var newData = JSON.parse(results);
			
		for(var i = 0; i < newData.length; i++)
		{
			var endMetric = newData[i];
			var initMetric = null;
			
			for(var j = 0; j < previousData.length; j++)
			{
				if(previousData[j].metricUUID === newData[i].metricUUID)
				{
					initMetric = previousData[j];
					break;
				}
			}
			
			if (initMetric != null)
			{
				var deltaValue = getDelta(initMetric, endMetric);
				
				var rateMetric = new Object();
				rateMetric.id = endMetric.metricUUID;
				rateMetric.timestamp = endMetric.timestamp;
				rateMetric.value = deltaValue;
				
				toOutput.push(rateMetric);
			}
			else
			{	
				var rateMetric = new Object();
				rateMetric.id = endMetric.metricUUID;
				rateMetric.timestamp = endMetric.timestamp;
				rateMetric.value = 0;
				
				toOutput.push(rateMetric);
			}
		}
		
		setFile(request.hostname, request.port, results);

		for (var m = 0; m < toOutput.length; m++)
		{
			for (var z = 0; z < newData.length; z++)
			{
				var systemMetric = metrics[newData[z].variableName];
				
				if (systemMetric.ratio === false && newData[z].metricUUID === toOutput[m].id)
				{
					toOutput[m].value = newData[z].value;
					break;
				}
			}
		}

		output(toOutput)
	}
	else
	{
		setFile(request.hostname, request.port, results);
		
		// Execute again.
		setTimeout(function() {
			monitorInput(process.argv);
		}, sleepTime);
	}
}

/**
 * Calculate ratio metric's value
 * Receive: 
 * - previous value
 * - current value
 * - 
 */
function getDelta(initMetric, endMetric)
{
	var deltaValue = 0;
	var decimalPlaces = 2;
	var date = new Date().toISOString();
	
	if (parseFloat(endMetric.value) < parseFloat(initMetric.value))
	{	
		deltaValue = parseFloat(endMetric.value).toFixed(decimalPlaces);
	}
	else
	{	
		var elapsedTime = (new Date(endMetric.timestamp).getTime() - new Date(initMetric.timestamp).getTime()) / 1000;	
		deltaValue = ((parseFloat(endMetric.value) - parseFloat(initMetric.value))/elapsedTime).toFixed(decimalPlaces);
	}
	
	return deltaValue;
}

/**
 * Get last results if any saved
 * Receive: 
 * - hostname or ip address
 * - port
 */
function getFile(hostname, port)
{
	var dirPath =  __dirname +  tempDir + "/";
	var filePath = dirPath + ".redis_"+ hostname +"_"+ port +".dat";
	
	try
	{
		fs.readdirSync(dirPath);
		
		var file = fs.readFileSync(filePath, 'utf8');
		
		if (file.toString('utf8').trim())
		{
			return file.toString('utf8').trim();
		}
		else
		{
			return null;
		}
	}
	catch(e)
	{
		return null;
	}
}

/**
 * Save current metrics values to be used to calculate ratios on next runs
 * Receive: 
 * - hostname or ip address
 * - port
 * - retrieved result
 */
function setFile(hostname, port, json)
{
	var dirPath =  __dirname +  tempDir + "/";
	var filePath = dirPath + ".redis_"+ hostname +"_"+ port +".dat";
		
	if (!fs.existsSync(dirPath)) 
	{
		try
		{
			fs.mkdirSync( __dirname + tempDir);
		}
		catch(e)
		{
			var ex = new CreateTmpDirError(e.message);
			ex.message = e.message;
			errorHandler(ex);
		}
	}

	try
	{
		fs.writeFileSync(filePath, json);
	}
	catch(e)
	{
		var ex = new WriteOnTmpFileError(e.message);
		ex.message = e.message;
		errorHandler(ex);
	}
}

// ############################################################################
// ERROR HANDLER

/**
 * Used to handle errors of async functions
 * Receive: Error/Exception
 */
function errorHandler(err)
{
	if(err instanceof InvalidAuthenticationError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof UnknownHostError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof MetricNotFoundError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof CreateTmpDirError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof WriteOnTmpFileError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else
	{
		console.log(err.message);
		process.exit(1);
	}
}

// ############################################################################
// EXCEPTIONS

/**
 * Exceptions used in this script.
 */
function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = "Wrong number of parameters.";
	this.code = 3;
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function InvalidAuthenticationError() {
    this.name = "InvalidAuthenticationError";
    this.message = "Invalid authentication.";
	this.code = 2;
}
InvalidAuthenticationError.prototype = Object.create(Error.prototype);
InvalidAuthenticationError.prototype.constructor = InvalidAuthenticationError;

function UnknownHostError() {
    this.name = "UnknownHostError";
    this.message = "Unknown host.";
	this.code = 27;
}
UnknownHostError.prototype = Object.create(Error.prototype);
UnknownHostError.prototype.constructor = UnknownHostError;

function MetricNotFoundError() {
    this.name = "MetricNotFoundError";
    this.message = "";
	this.code = 8;
}
MetricNotFoundError.prototype = Object.create(Error.prototype);
MetricNotFoundError.prototype.constructor = MetricNotFoundError;

function CreateTmpDirError()
{
	this.name = "CreateTmpDirError";
    this.message = "";
	this.code = 21;
}
CreateTmpDirError.prototype = Object.create(Error.prototype);
CreateTmpDirError.prototype.constructor = CreateTmpDirError;

function WriteOnTmpFileError()
{
	this.name = "WriteOnTmpFileError";
    this.message = "";
	this.code = 22;
}
WriteOnTmpFileError.prototype = Object.create(Error.prototype);
WriteOnTmpFileError.prototype.constructor = WriteOnTmpFileError;
