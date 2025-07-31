package org.acme.Managers;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import org.acme.KafkaEmitter;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Map;

@ApplicationScoped
public class RequestManager {

    @Inject
    KafkaEmitter emitter;

    @ConfigProperty(name = "topics.file-upload")
    String fileUploadTopic;

    public void handleRequest(String uuid, String fileName, String _topic) {
        String topic = getTopicName(_topic);
        if (topic != null) {
            emitter.sendToKafka(uuid, fileName, topic);
        } else {
            throw new IllegalArgumentException("Unknown request type: " + _topic);
        }
    }

    private String getTopicName(String name) {
        Map<String, String> topicMap = Map.of(
            "file-upload", fileUploadTopic
        );
        return topicMap.get(name);
    }
}