# Microservice B - Spring Boot

> IMPORTANT: This application requires Java 8 JDK or greater and Maven 3.3.x or greater.


## Run, test, deploy and debug

### Running locally

To run this microservice on your local host:

```
$ cd microservice-b

$ mvn spring-boot:run
```

If you have already launched some other services of this application locally, you'll need changing the default port like in command below:

```
 $ mvn spring-boot:run -Dserver.port=8090
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

* Be sure that view access rights for the service account are added before deploying your booster using: `oc policy add-role-to-user view -n $(oc project -q) -z default`.

* Navigate to the root directory of your microservice

* Deploy your `ConfigMap` configuration using `application.yml`.

```
$ oc create configmap microservice-b-config --from-file=application.yml
```

* Deploy your microservice on OpenShift using Source-to-image (S2I) build

```
$ mvn clean fabric8:deploy -Popenshift
```

To interact with your microservice while it's running, you first need to obtain its URL:

```
$ oc get route microservice-b -o jsonpath={$.spec.host}

microservice-b-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME
```

You can use the form at your application's url or you can use the `curl` command:

```
$ curl http://microservice-b-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME/api/greeting
{"content":"Hello World from a ConfigMap!"}

$ curl http://microservice-b-MY_PROJECT_NAME.LOCAL_OPENSHIFT_HOSTNAME/api/greeting?name=Sarah
{"content":"Hello Sarah from a ConfigMap!"}
```

### Debugging it

```
$ mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5005"
```

## Development notes

### Externalized configuration

Externalized configuration into this microservice is provided through the help of `spring-cloud-kubernetes-config` library. The behavior of this library is to use Kubernetes APIs to check for an existing `ConfigMap` in order to retrieve application properties.

So basically, you just have to give a ConfigMap name into `src/main/resources/bootstrap.properties` like this:

```yaml
spring.cloud.kubernetes.config.name=microservice-b-config
```

and at startup, it takes care of checking if there's such a `ConfigMap` into the Kubernetes namespaces the user is currently logged in.

### Health probes

Health probes in Spring Boot 2 applications can be added by including the `spring-boot-starter-actuator` dependency. Actuator is now using Micrometer as a base framework and it will also used when dealing with Prometheus metrics.

Including the dependency is not enough and you should also adapt the `application.yml` configuration file to enable exposing the different management endpoints offered by Actuator like below:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: "*"
```

> IMPORTANT: As including any endpoints maybe convenient for our purposes, this is clearly not a production settings. Endpoints should be restricted and protected.

dding this dependency automatically add new endpoints on `/actuator/health` for defining a liveness and a readiness probes. However, this endpoints should be also declared to OpenShift using the `src/main/fabric8/deployment.yml` fragment:

```yaml
livenessProbe:
  failureThreshold: 3
  httpGet:
    path: /actuator/health
    port: 8080
    scheme: HTTP
  initialDelaySeconds: 15
  periodSeconds: 10
  successThreshold: 1
  timeoutSeconds: 3
readinessProbe:
  [...]
```

### Distributed tracing

The `opentracing-spring-jaeger-cloud-starter` dependency is necessary for having OpenTracing support through the Jaeger implementation. Once this dependency is added to your Maven pom.xml, all the Web Servlet endpoints will be instrumented for detecting / creating / closing traces span. Our `GreetingController` beng a Spring MVC controller, it falls within this instrumentation.

The `ConfigMap` configuration file `application.yml` (or its local variant `application-local.yml` if you make local tests) should be adapted to add configuration for the Jaeger tracer and how to reach the central collector:

```yaml
opentracing:
  jaeger:
    enabled: true
    log-spans: true
    enable-b3-propagation: false
    udp-sender:
      host: "jaeger-agent.cockpit.svc.cluster.local"
      port: 5775
```

Remember that in the Introduction - Supporting tools installation section - I've mentionned installing Jaeger server into the `cockpit` namespace and making this namespace a global one. So that, I'm no able to reach OpenShift Service in that namespace just by using `jaeger-agent.cockpit.svc.cluster.local` DNS alias.

If you want to test or debug OpenTracing instrumentation locally, you can also choose to deploy Jaeger locally using the Docker image. Just execute:

```
$ docker run -it --rm -p 6831:6831/udp -p 6832:6832/udp -p 5775:5775/udp -p 14268:14268 -p 16686:16686 jaegertracing/all-in-one
```

Jaeger GUI will be available on `http://localhost:16686`.

### Prometheus metrics

Application metrics gathering is included into `spring-boot-starter-actuator` but we need another dependency to have Prometheus format export available. So just add `micrometer-registry-prometheus` dependency to your pom.xml and a new endpoint will be available at `/actuator/prometheus` to make your metrics available at Prometheus text format.

We'll need also to activate the Prometheus endpoint into the `application.yml` configuration file used as our `ConfigMap` source:

```yaml
management:
  [...]
  endpoint:
    metrics:
      enabled: true
    prometheus:
      enabled: true
  metrics:
    export:
      prometheus:
        enabled: true
```

When using a Prometheus instance deployed on OpenShift or other Kubernetes instance, you may have default configuration that expect your Prometheus metrics to be exposed onto port `9779` and on `/metrics` endpoint. As this is not our configuration, we have to tell it explicitily by using annotations on the OpenShift `Service`. This can be done providing the following fragment into `src/main/fabric8/service.yml` file:

```yaml
metadata:
  annotations:
    prometheus.io/path: /actuator/prometheus
    prometheus.io/port: '8080'
    prometheus.io/scrape: 'true'
```

> NOTE: Micrometer should also allow instrumentation of arbitrary methods using @Timed annotation. Instrumentation of Spring Beans is not done by default so that you'll have to add a `TimedConfiguration` that uses AspectJ weaving. Tried this setup but did not succeed for now....


## More Information

You can learn more about this booster and the Spring Boot runtime in the link: [Spring Boot Runtime Guide](http://launcher.fabric8.io/docs/spring-boot-runtime.html).

> NOTE: Run the set of integration tests included with this booster using `mvn clean verify -Popenshift,openshift-it`.
