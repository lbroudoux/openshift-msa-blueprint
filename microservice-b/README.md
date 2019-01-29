# Microservice B - Spring Boot

> IMPORTANT: This application requires Java 8 JDK or greater and Maven 3.3.x or greater.


## Run, test, deploy and debug

### Running locally

To run this microservice on your local host:

```
$ cd microservice-b

$ mvn spring-boot:run
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

## Development notes

### Externalized configuration

### Health probes

### Distributed tracing

### Prometheus metrics

## More Information

You can learn more about this booster and the Spring Boot runtime in the link: [Spring Boot Runtime Guide](http://launcher.fabric8.io/docs/spring-boot-runtime.html).

> NOTE: Run the set of integration tests included with this booster using `mvn clean verify -Popenshift,openshift-it`.
