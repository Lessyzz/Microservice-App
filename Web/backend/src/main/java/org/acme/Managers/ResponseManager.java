package org.acme.Managers;

import java.util.HashMap;
import java.util.Map;

import org.acme.KafkaEmitter;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class ResponseManager {

    @Inject
    KafkaEmitter emitter;

    public Map<String, Object> checkResults(String uuid) {
        boolean completed = emitter.hasAllResponses(uuid);

        Map<String, Object> response = new HashMap<>();
        response.put("completed", completed);

        if (completed) {
            response.put("results", emitter.getResults(uuid));
        }
        return response;
    }
}