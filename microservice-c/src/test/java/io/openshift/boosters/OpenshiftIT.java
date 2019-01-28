/*
 * Copyright 2016-2017 Red Hat, Inc, and individual contributors.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.openshift.boosters;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import io.fabric8.kubernetes.api.model.ConfigMap;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.client.internal.readiness.Readiness;
import io.fabric8.openshift.client.OpenShiftClient;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.arquillian.cube.kubernetes.api.Session;
import org.arquillian.cube.openshift.impl.enricher.AwaitRoute;
import org.arquillian.cube.openshift.impl.enricher.RouteURL;
import org.jboss.arquillian.junit.Arquillian;
import org.jboss.arquillian.test.api.ArquillianResource;
import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

import static io.restassured.RestAssured.get;
import static io.restassured.RestAssured.given;
import static io.restassured.RestAssured.when;
import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.containsString;
import static org.junit.Assert.assertTrue;

/**
 * @author Heiko Braun
 */
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
@RunWith(Arquillian.class)
public class OpenshiftIT {
    private static final String APP_NAME = System.getProperty("app.name");

    private static final String CONFIGMAP_NAME = "app-config";

    @ArquillianResource
    private OpenShiftClient oc;

    @ArquillianResource
    private Session session;

    @RouteURL("${app.name}")
    @AwaitRoute
    private URL url;

    @Before
    public void setup() throws Exception {
        RestAssured.baseURI = url + "api/greeting";
    }

    @Test
    public void testAConfigMapExists() throws Exception {
        Optional<ConfigMap> configMap = findConfigMap();
        assertTrue(configMap.isPresent());
    }

    @Test
    public void testBDefaultGreeting() {
        when()
                .get()
                .then()
                .assertThat().statusCode(200)
                .assertThat().body(containsString("Hello World from a ConfigMap!"));
    }

    @Test
    public void testCCustomGreeting() {
        given()
                .queryParam("name", "Steve")
                .when()
                .get()
                .then()
                .assertThat().statusCode(200)
                .assertThat().body(containsString("Hello Steve from a ConfigMap!"));
    }

    @Test
    public void testDUpdateConfigGreeting() throws Exception {
        deployConfigMap("target/test-classes/test-config-update.yml");

        rolloutChanges();

        when()
                .get()
                .then()
                .assertThat().statusCode(200)
                .assertThat().body(containsString("Good morning World from an updated ConfigMap!"));
    }

    @Test
    public void testEMissingConfigurationSource() throws Exception {
        deployConfigMap("target/test-classes/test-config-broken.yml");

        rolloutChanges();

        await().atMost(5, TimeUnit.MINUTES).untilAsserted(() -> get().then().assertThat().statusCode(500));
    }

    private Optional<ConfigMap> findConfigMap() {
        List<ConfigMap> cfm = oc.configMaps()
                .inNamespace(session.getNamespace())
                .list()
                .getItems();

        return cfm.stream()
                .filter(m -> CONFIGMAP_NAME.equals(m.getMetadata().getName()))
                .findAny();
    }

    private void deployConfigMap(String path) throws IOException {
        try (InputStream yaml = new FileInputStream(path)) {
            // in this test, this always replaces an existing configmap, which is already tracked for deleting
            // after the test finishes
            oc.load(yaml).createOrReplace();
        }
    }

    private void rolloutChanges() throws InterruptedException {
        System.out.println("Rollout changes to " + APP_NAME);

        // in reality, user would do `oc rollout latest`, but that's hard (racy) to wait for
        // so here, we'll scale down to 0, wait for that, then scale back to 1 and wait again
        scale(APP_NAME, 0);
        scale(APP_NAME, 1);

        await().atMost(5, TimeUnit.MINUTES).until(() -> {
            try {
                Response response = get(url);
                return response.getStatusCode() == 200;
            } catch (Exception e) {
                return false;
            }
        });
    }

    private void scale(String name, int replicas) {
        oc.deploymentConfigs()
                .inNamespace(session.getNamespace())
                .withName(name)
                .scale(replicas);

        await().atMost(5, TimeUnit.MINUTES).until(() -> {
            // ideally, we'd look at deployment config's status.availableReplicas field,
            // but that's only available since OpenShift 3.5
            List<Pod> pods = oc
                    .pods()
                    .inNamespace(session.getNamespace())
                    .withLabel("deploymentconfig", name)
                    .list()
                    .getItems();
            try {
                return pods.size() == replicas && pods.stream().allMatch(Readiness::isPodReady);
            } catch (IllegalStateException e) {
                // the 'Ready' condition can be missing sometimes, in which case Readiness.isPodReady throws an exception
                // here, we'll swallow that exception in hope that the 'Ready' condition will appear later
                return false;
            }
        });
    }
}
