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
$ oc create configmap app-config --from-file=app-config.yml
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

### Externalized configuration

`.nodeshift/deployment.yml`

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
            - name: LOG_SPANS
              value: true
```

### Health probes

`app.js`

```js
const probe = require('kube-probe');

[...]

probe(app);
```

### Distributed tracing

`app.js`

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

```
$ oc set env dc/microservice-a JAEGER_HOST=jaeger-agent.cockpit.svc.cluster.local
```

### Prometheus metrics

`app.js`

```js
const promBundle = require("express-prom-bundle");
const metricsMiddleware = promBundle({includeMethod: true, includePath: true});
app.use(metricsMiddleware);
```

`.nodeshift/service.yml`

```yaml
metadata:
  annotations:
    prometheus.io/port: '8080'
    prometheus.io/scrape: 'true'
```

## More Information

You can learn more about the booster used and the Node.js runtime in the link : [Node.js Runtime Guide](http://launcher.fabric8.io/docs/nodejs-runtime.html).
