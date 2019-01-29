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

### Health probes

### Distributed tracing

### Prometheus metrics

## More Information

You can learn more about the booster used and the Node.js runtime in the link : [Node.js Runtime Guide](http://launcher.fabric8.io/docs/nodejs-runtime.html).
