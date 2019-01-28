'use strict';

// Set default server port to 8080
var port = process.env.PORT || 8080;

var async = require('async');
var http = require('http');

const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const express = require('express');
const bodyParser = require('body-parser');

const readFile = promisify(fs.readFile);
// Setup logging
const logger = require('winston');

const app = express();

// Health Check Middleware
const probe = require('kube-probe');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));

let configMap;
let message;

// Prometheus middleware configuration.
const promBundle = require("express-prom-bundle");
const metricsMiddleware = promBundle({includeMethod: true, includePath: true});
app.use(metricsMiddleware);

// OpenTracing + Jaeger middleware configuration.
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
var opentracingMiddleware = require('express-opentracing').default;
var initTracer = require('jaeger-client').initTracer;

var config = {
  'serviceName': 'microservice-a',
  'reporter': {
    'logSpans': process.env.LOG_SPANS || true,
    'agentHost': process.env.JAEGER_HOST,
    'agentPort': 6832
  },
  'sampler': { 'type': 'const', 'param': 1 }
};
var options = {
  'tags': { 'microservice-a': '1.0.0' },
  'logger': logger
};
var jaegerTracer = initTracer(config, options);
app.use("/api/((?!health))*", opentracingMiddleware({tracer: jaegerTracer}))
 

app.use('/api/greeting', (request, response) => {
  const name = (request.query && request.query.name) ? request.query.name : 'World';
  
  const parentSpanContext = request.span.context();
  logger.debug("parentSpanContext: " + JSON.stringify(parentSpanContext));

  if (!message) {
    response.status(500);
    return response.send({content: 'no config map'});
  }

  logger.debug('Replying to request, parameter={}', name);
  var responseData = {};

  // Call the 2 other microservices.
  async.parallel({
    b: function(callback) {
      // Build a span and inject to headers for microservice b.
      const headers = {};
      const span = createClientSpan(parentSpanContext, 'microservice-b', 'http://microservice-b:8088/api/greeting');
      jaegerTracer.inject(span, FORMAT_HTTP_HEADERS, headers);

      var req = http.request({
        //hostname: "localhost", port: 8080,
        hostname: "microservice-b", port: 8080,
        path: '/api/greeting', method: 'GET', headers: headers
      }, function(response) {
        response.on('data', function(data) {
          span.setTag(Tags.HTTP_STATUS_CODE, 200); span.finish();
          callback(null, JSON.parse(data));
        });
        response.on('error', function(e) {
          span.setTag(Tags.HTTP_STATUS_CODE, 500); span.finish();
          callback(new Error('Unable to retrieve response from microservice-b'))
        });
      });
      req.on('error', function(err) {
        logger.error('Problem with request to microservice-b: ' + err.message);
        callback(new Error('Unable to connect to microservice-b'))
      });
      req.end();
    },
    c: function(callback) {
      // // Build a span and inject to headers for microservice c.
      const headers = {};
      const span = createClientSpan(parentSpanContext, 'microservice-c', 'http://microservice-c:8088/api/greeting');
      jaegerTracer.inject(span, FORMAT_HTTP_HEADERS, headers);

      var req = http.request({
        //hostname: "localhost", port: 8081,
        hostname: "microservice-c", port: 8080,
        path: '/api/greeting', method: 'GET', headers: headers
      }, function(response) {
        response.setEncoding('utf-8');
        response.on('data', function(data) {
          span.setTag(Tags.HTTP_STATUS_CODE, 200); span.finish();
          callback(null, JSON.parse(data));
        });
        response.on('error', function(e) {
          span.setTag(Tags.HTTP_STATUS_CODE, 500); span.finish();
          callback(new Error('Unable to retrieve response from microservice-c'))
        });
      });
      req.on('error', function(err) {
        logger.error('Problem with request to microservice-c: ' + err.message);
        callback(new Error('Unable to connect to microservice-c'))
      });
      req.end();
    }
  }, function(err, results) {
    // results is now equals to: {b: {content: ""}, c: {content: ""}}
    logger.info("Results: " + JSON.stringify(results));
    responseData = results;
    responseData.a = {'content': message.replace(/%s/g, name)};
    return response.send(responseData);
  });

});

// Set health check
probe(app);

// Periodic check for config map update
// If new configMap is found, then set new log level
setInterval(() => {
  retrieveConfigfMap().then(config => {
    if (!config) {
      message = null;
      return;
    }

    configMap = config;
    message = config.message;

    // Set New log level
    if (logger.level !== config.level.toLowerCase()) {
      logger.info('New configuration retrieved: {}', config.message);
      logger.info('New log level: {}', config.level.toLowerCase());
      logger.level = config.level.toLowerCase();
    }
  }).catch(err => {
    logger.error('Error getting config', err);
  });
}, 2000);

// Get ConfigMap Stuff
const jsyaml = require('js-yaml');

// Find the Config Map
function retrieveConfigfMap () {
  return readFile(process.env.NODE_CONFIGMAP_PATH || 'app-config.yml', {encoding: 'utf8'}).then(configMap => {
    // Parse the configMap, which is yaml
    const configMapParsed = jsyaml.safeLoad(configMap);
    return configMapParsed;
  });
}

function createClientSpan(rootSpanCtx, service, url) {
  const span = jaegerTracer.startSpan(service + ' invocation', {childOf: rootSpanCtx});
  span.log( {'event': service + ' invocation' });
  span.setTag(Tags.HTTP_URL, url);
  span.setTag(Tags.HTTP_METHOD, "GET");
  span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
  return span
}

app.listen(port, function () {
  console.log('Microservice-A listening on port: ' + port);
})

module.exports = app;
