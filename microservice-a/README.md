# Microservice A - Node.js

> IMPORTANT: This application requires Node.js 8.x or greater and `npm` 5 or greater.

## Run, test, deploy and debug

### Running locally

To run this microservice on your local host:

```
$ git clone https://github.com/lbroudoux/openshift-msa-blueprint

$ cd openshift-msa-blueprint/microservice-a

$ npm install && npm start
```

### Testing it

To interact with your microservice while its running, use the form at `http://localhost:8080` or the `curl` command:

```
$ curl http://localhost:8080/api/greeting
{"a":{"content":"Hello, World!"}}

$ curl http://localhost:8080/api/greeting?name=Sarah
{"a":{"content":"Hello, Sarah!"}}
```

### Deploying on OpenShift

This microservice is also meant to be deployed onto an OpenShift cluster. Here's the steps to follow below:

*  Log in and create your project

```
$ oc login -u developer -p developer

$ oc new-project MY_PROJECT_NAME
```

*  Be sure that view access rights for the service account are added before deploying your booster using: `oc policy add-role-to-user view -n $(oc project -q) -z default`

* Navigate to the root directory of this microservice

* Create a `ConfigMap` configuration using `app-config.yml`

```
$ oc create configmap microservice-a-config --from-file=app-config.yml
```

* Deploy your microservice on OpenShift using Source-to-image (S2I) build

```
$ npm install && npm run openshift
```

To interact with your microservice while it's running, you first need to obtain its URL:

```
$ oc get route microservice-a -o jsonpath={$.spec.host}

microservice-a-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME
```

You can use the form at your application's url or you can use the `curl` command:

```
$ curl http://microservice-a-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME/api/greeting
{"content":"Hello World from a ConfigMap!"}

$ curl http://microservice-a-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME/api/greeting?name=Sarah
{"content":"Hello Sarah from a ConfigMap!"}
```

## Development notes

### Service Discovery

Getting the other microservice URL is straightforward into OpenShift because of the SDN layer. When `microservice-a` wants to join `microservice-b` it does not to call an external registry managing this. If both services are deployed into the same namespace, they can directly use their short name as a DNS alias.

That way, when you are looking at `app.js` invocation code, you'll just see references of `microservice-b` as hostname with its default `Service` port.

```js
var req = http.request({
  hostname: "microservice-b", port: 8080,
  path: '/api/greeting', method: 'GET', headers: headers
}
```

> HINT: If you're deploying locally, you may just have to replace `microservice-b` with `localhost` and `8080` with the port you have choosen for the component. See other microservices documentation for how to configure and override their port.

### Externalized configuration

Configuration of application is externalized into a file called `app-config.yml`. When deployed locally, this file is read from application root folder. When deployed into OpenShift, this file is used as a source for a `ConfigMap`.

So basically, application should read this file at startup or repeatedly and  `app.js` file may be adapted that way:

```js
setInterval(() => {
  retrieveConfigfMap().then(config => {
    [...]
}, 2000);
```

The `retrieveConfigMap()` function is a little indirection that is using a file specified as the `NODE_CONFIGMAP_PATH` environment variable in priority ; or fallback to local `app-config.yml`:

```js
function retrieveConfigfMap () {
  return readFile(process.env.NODE_CONFIGMAP_PATH || 'app-config.yml', {encoding: 'utf8'}).then(configMap => {
    [...]
  });
}
```

The `nodeshift` utility we use for deploying onto OpenShift allows us to configure the binding of a declared `ConfigMap` to our containerized application. This is done by providing Kubernetes manifest fragments into the `.nodeshift/deployment.yml` file. Below we can see that the `microservice-a-config` `ConfigMap` is mounted into container and referenced into the `NODE_CONFIGMAP_PATH`:

```yaml
spec:
  template:
    spec:
      # Declare a volume mounting the config map
      volumes:
        - configMap:
            # Name of the config map
            name: microservice-a-config
            optional: true
            # Define the items from the config map to mount
            items:
            - key: app-config.yml
              path: app-config.yml
            # Volume name (used as reference below)
          name: config
      containers:
        - env:
            - name: NODE_CONFIGMAP_PATH
              value: /app/config/app-config.yml
          volumeMounts:
          - mountPath: /app/config
            name: config
```

### Health probes

In order to provide health scanning probes, we use the [kube-probe](https://www.npmjs.com/package/kube-probe) module. `app.js` is just modified to add probe for the application:

```js
const probe = require('kube-probe');

[...]

probe(app);
```

Whilst the module auto-exposes 2 new endpoints for probes, those have to be declared as fragments into the `.nodeshift/deployment.yml` file:

```yaml
readinessProbe:
  httpGet:
    path: /api/health/readiness
    port: 8080
    scheme: HTTP
livenessProbe:
  httpGet:
    path: /api/health/liveness
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 60
  periodSeconds: 30
```

### Distributed tracing

OpenTracing can be implemented using [express-opentracing](https://www.npmjs.com/package/express-opentracing) module. `app.js` is modified that way to enable the tracer client baked by Jaeger implementation:

```js
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
```

You may have checked in the configuration that it relies onto a `JAEGER_HOST` environment variable for getting the name of the Jaeger service. So you may export a simple env variable when deploying in local:

```
$ export JAEGER_HOST=localhost
```

or setup a container environment variable when deployed onto OpenShift:

```
$ oc set env dc/microservice-a JAEGER_HOST=jaeger-agent.cockpit.svc.cluster.local
```

### Prometheus metrics

Pormetheus metrics are brought by the excellent [express-prom-bundle](https://www.npmjs.com/package/express-prom-bundle) module. Integrating it as a middleware for Express, is as easy as adding those few lines into `app.js`:

```js
const promBundle = require("express-prom-bundle");
const metricsMiddleware = promBundle({includeMethod: true, includePath: true});
app.use(metricsMiddleware);
```

This will bring you automatic metrics for your Express routes. You can check the metrics availables by calling `http://localhost:8080/metrics` endpoint.

When using a Prometheus instance deployed on OpenShift or other Kubernetes instance, you may have default configuration that expect your Prometheus metrics to be exposed onto port `9779`. As this is not our configuration, we have to tell it explicitily by using annotations on the OpenShift `Service`. This can be done providing the following fragment into `.nodeshift/service.yml` file:

```yaml
metadata:
  annotations:
    prometheus.io/port: '8080'
    prometheus.io/scrape: 'true'
```

## More Information

You can learn more about the booster used and the Node.js runtime in the link : [Node.js Runtime Guide](http://launcher.fabric8.io/docs/nodejs-runtime.html).
