# Microservice C - Thorntail

> IMPORTANT: This application requires Java 8 JDK or greater and Maven 3.3.x or greater.


## Run, test, deploy and debug

### Running locally

To run this microservice on your local host:

```
$ cd microservice-c

$ mvn thorntail:run
```

If you have already launched some other services of this application locally, you'll need changing the default port like in command below:

```
 $ mvn thorntail:run -Dswarm.port.offset=11
```

Application will be available on `http://localhost:8091`.

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

Configuration of application is externalized into a file called `app-config.yml`. When deployed locally, this file is ignored: the standard `src/main/resources/project-defaults.yml` file embedded into Thorntail WAR is used. When deployed into OpenShift, this file is used as a source for a `ConfigMap`.

In order to configure your OpenShift `Deployment` to use the `ConfigMap`, you have to provide a customization fragment that will be used by the Maven Fabric8 plugin. This fragment is located into `src/main/fabric8/deployment.yml` and specify a mounting point for your container. It also specify the `JAVA_OPTIONS` environment variables that will help specify the override path for this configuration file:

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

Health probes for your application can be simply defined using the `microprofile-health` microprofile module. This dependency is added into the Maven pom.xml. Adding this dependency automatically add new endpoints for defining a liveness and a readiness probes. However, this endpoints should be also declared to OpenShift using the `src/main/fabric8/deployment.yml` fragment:

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
          readinessProbe:
            [...]
```

### Distributed tracing

Distributed tracing can be easily added using the `microprofile-opentracing` microprofile dependency and the `jaeger` library from Thorntail. Once added, each Servlet and JAX-RS endpoint are automatically filtered for retrieving / creating / closing an OpenTracing span context.

Within our `ConfigMap` configuration file, we just have to add the configuration of the tracer as well as the endpoint where to send collected traces and spans. As explained into the introduction - see Supporting tools installation - I've made the choice to install Jaeger into the `cockpit` namespace of my OpenShift cluster, so that I'll use the below configuration into the `app-config.yml` file:

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

If you want to test or debug OpenTracing instrumentation locally, you can also choose to deploy Jaeger locally using the Docker image. Just execute:

```
$ docker run -it --rm -p 6831:6831/udp -p 6832:6832/udp -p 5775:5775/udp -p 14268:14268 -p 16686:16686 jaegertracing/all-in-one
```

Jaeger GUI will be available on `http://localhost:16686`.

### Prometheus metrics

Application metrics can be added to your application by including the `microprofile-metrics` dependency into your Maven configuration. This microprofile extension publishes a default Prometheus compliant endpoint on `/metrics`.

Within the Java code of your application, you'll need to add specific annotation so that you'll tell the metrics extension to create new metrics for you. Here below into the `src/main/java/io/openshift/boosters/GreetingEndpoint.java` file, we'll create 2 new metrics: a counter and a timer.

```java
@Counted(monotonic = true, name = "greeting.count", absolute = true, description = "Counter for GET /greeting", tags = "type=endpoint")
@Timed(name = "greeting.time", absolute = true, description = "Timer for GET /greeting", tags = "type=endpoint")
public Response greeting(@QueryParam("name") String name) {
  [...]
}
```

This will bring you automatic metrics for your endpoint. You can check the metrics availables by calling `http://localhost:8080/metrics` endpoint.

When using a Prometheus instance deployed on OpenShift or other Kubernetes instance, you may have default configuration that expect your Prometheus metrics to be exposed onto port `9779`. As this is not our configuration, we have to tell it explicitily by using annotations on the OpenShift `Service`. This can be done providing the following fragment into `src/main/fabric8/service.yml` file:

```yaml
metadata:
  annotations:
    prometheus.io/port: '8080'
    prometheus.io/scrape: 'true'
```

## More Information

You can learn more about this booster and the Thorntail runtime in the link : [Thorntail Runtime Guide](http://launcher.fabric8.io/docs/thorntail-runtime.html).

> NOTE: Run the set of integration tests included with this booster using `mvn clean verify -Popenshift,openshift-it`.
