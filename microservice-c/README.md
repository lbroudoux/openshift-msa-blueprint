# Microservice C - Thorntail

> IMPORTANT: This application requires Java 8 JDK or greater and Maven 3.3.x or greater.


## Run, test, deploy and debug

### Running locally

To run this microservice on your local host:

```
$ cd microservice-c

$ mvn thorntail:run
```

### Testing it

To interact with your booster while its running, use the form at `http://localhost:8080` or the `curl` command:

```
$ curl http://localhost:8080/api/greeting
{"content":"Hello, World!"}

$ curl http://localhost:8080/api/greeting?name=Sarah
{"content":"Hello, Sarah!"}
```

### Deploying on OpenShift

This microservice is also meant to be deployed onto an OpenShift cluster. Here's the steps to follow below:

* Log in and create your project.

```
$ oc login -u developer -p developer

$ oc new-project MY_PROJECT_NAME
```

* Navigate to the root directory of your microservice

* Deploy your `ConfigMap` configuration using `app-config.yml`

```
$ oc create configmap microservice-c-config --from-file=app-config.yml
```

* Deploy your microservice on OpenShift using Source-to-image (S2I) build

```
$ mvn clean fabric8:deploy -Popenshift
```

To interact with your microservice while it's running, you first need to obtain its URL:

```
$ oc get route microservice-c -o jsonpath={$.spec.host}

microservice-c-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME
```

You can use the form at your application's url or you can use the `curl` command:

```
$ curl http://microservice-c-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME/api/greeting
{"content":"Hello World from a ConfigMap!"}

$ curl http://microservice-c-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME/api/greeting?name=Sarah
{"content":"Hello Sarah from a ConfigMap!"}
```

### Debugging it

```
$ mvn thorntail:run -Dswarm.debug.port=5006
```

```
$ mvn thorntail:run -Dswarm.port.offset=1 -Dswarm.debug.port=5006 -DskipTests
```

## Development notes

### Externalized configuration

`src/main/fabric8/deployment.yml`

```yaml
spec:
  template:
    spec:
      containers:
        -
          [...]
          volumeMounts:
            - name: config
              mountPath: /app/config
          env:
            - name: JAVA_OPTIONS
              value: "-Dswarm.project.stage.file=file:///app/config/project-defaults.yml"
          volumes:
          - configMap:
            name: microservice-c-config
            items:
            - key: "app-config.yml"
              path: "project-defaults.yml"
            name: config
```

### Health probes

`src/main/fabric8/deployment.yml`

```yaml
spec:
  template:
    spec:
      containers:
        -
          [...]
          livenessProbe:
            failureThreshold: 3
            httpGet:
              path: /health
              port: 8080
              scheme: HTTP
            initialDelaySeconds: 10
            periodSeconds: 15
            successThreshold: 1
            timeoutSeconds: 3
```

### Distributed tracing

`app-config.yml`

```yaml
thorntail:
  jaeger:
    enabled: true
    service-name: microservice-c
    sampler-type: const
    sampler-parameter: 1
    remote-reporter-http-endpoint: 'http://jaeger-agent.cockpit.svc.cluster.local:14268/api/traces'
    reporter-log-spans: true
```

### Prometheus metrics

`src/main/fabric8/service.yml`

```yaml
metadata:
  annotations:
    prometheus.io/port: '8080'
    prometheus.io/scrape: 'true'
```

## More Information

You can learn more about this booster and the Thorntail runtime in the link : [Thorntail Runtime Guide](http://launcher.fabric8.io/docs/thorntail-runtime.html).

> NOTE: Run the set of integration tests included with this booster using `mvn clean verify -Popenshift,openshift-it`.
