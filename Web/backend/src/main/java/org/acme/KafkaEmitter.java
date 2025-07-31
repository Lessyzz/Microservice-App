package org.acme;

import io.smallrye.mutiny.Uni;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.errors.WakeupException;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

@ApplicationScoped
public class KafkaEmitter {

    private Producer<String, String> producer;
    private Consumer<String, String> consumer;

    // Inject topic names from application.conf
    @ConfigProperty(name = "topics.file-response-letter-count")
    String letterCountTopic;

    @ConfigProperty(name = "topics.file-response-word-count")
    String wordCountTopic;

    @ConfigProperty(name = "topics.file-response-hash")
    String hashTopic;

    private final Map<String, CompletableFuture<String>> pending = new ConcurrentHashMap<>();
    private final Map<String, Map<String, String>> receivedResults = new ConcurrentHashMap<>();
    private final Map<String, Long> lastUpdateTimestamps = new ConcurrentHashMap<>();
    private final Set<String> expectedFields = Set.of("sha256", "letterCount", "wordCount");
    private final ObjectMapper mapper = new ObjectMapper();
    private ScheduledExecutorService cleanerExecutor;
    private static final long RESULTS_EXPIRATION_MS = 60 * 60 * 1000;
    private Thread consumerThread;

    @PostConstruct
    public void init() {
        initProducer();
        initConsumer();
        startConsumerThread();
        startCleaner();
    }

    private void initProducer() {
        Properties producerProps = new Properties();
        producerProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
        producerProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        producerProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        producer = new KafkaProducer<>(producerProps);
    }

    private void initConsumer() {
        Properties consumerProps = new Properties();
        consumerProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:9092");
        consumerProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        consumerProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        consumerProps.put(ConsumerConfig.GROUP_ID_CONFIG, "backend-consumer-group");
        consumerProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        consumer = new KafkaConsumer<>(consumerProps);

        consumer.subscribe(Arrays.asList(letterCountTopic, wordCountTopic, hashTopic));
    }

    private void startConsumerThread() {
        consumerThread = new Thread(this::consumeResponses);
        consumerThread.setDaemon(true);
        consumerThread.start();
    }

    private void startCleaner() {
        cleanerExecutor = Executors.newSingleThreadScheduledExecutor();
        cleanerExecutor.scheduleAtFixedRate(this::cleanOldResults, 10, 10, TimeUnit.MINUTES);
    }

    public Uni<String> sendToKafka(String uuid, String filename, String topic) {
        CompletableFuture<String> future = new CompletableFuture<>();
        pending.put(uuid, future);

        try {
            Map<String, String> messageData = new HashMap<>();
            messageData.put("uuid", uuid);
            messageData.put("filename", filename);
            String jsonMessage = mapper.writeValueAsString(messageData);

            ProducerRecord<String, String> record = new ProducerRecord<>(topic, uuid, jsonMessage);
            producer.send(record, (metadata, exception) -> {
                if (exception != null) {
                    System.err.println("Kafka sent message error: " + exception.getMessage());
                    exception.printStackTrace();
                    CompletableFuture<String> f = pending.remove(uuid);
                    if (f != null) {
                        f.completeExceptionally(exception);
                    }
                } else {
                    System.out.println("Kafka sent message successfully, offset: " + metadata.offset());
                }
            });
            producer.flush();
        } catch (Exception e) {
            CompletableFuture<String> f = pending.remove(uuid);
            if (f != null) {
                f.completeExceptionally(e);
            }
        }

        return Uni.createFrom().completionStage(future)
                .ifNoItem().after(Duration.ofSeconds(10)).fail()
                .onFailure().recoverWithItem("hata");
    }

    private void consumeResponses() {
        try {
            while (!Thread.currentThread().isInterrupted()) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> record : records) {
                    try {
                        String json = record.value();
                        Map<?, ?> data = mapper.readValue(json, Map.class);

                        String uuid = (String) data.get("uuid");
                        if (uuid == null) {
                            System.err.println("No UUID found. Skipping.");
                            continue;
                        }

                        String topic = record.topic();

                        receivedResults.putIfAbsent(uuid, new ConcurrentHashMap<>());
                        lastUpdateTimestamps.put(uuid, System.currentTimeMillis());

                        Map<String, String> resultMap = receivedResults.get(uuid);

                        if (topic.equals(hashTopic) && data.get("sha256") != null) {
                            resultMap.put("sha256", data.get("sha256").toString());
                        } else if (topic.equals(letterCountTopic) && data.get("letterCount") != null) {
                            resultMap.put("letterCount", data.get("letterCount").toString());
                        } else if (topic.equals(wordCountTopic) && data.get("wordCount") != null) {
                            resultMap.put("wordCount", data.get("wordCount").toString());
                        } else {
                            System.out.println("Unknown topic: " + topic);
                        }

                        if (hasAllResponses(uuid)) {
                            CompletableFuture<String> f = pending.remove(uuid);
                            if (f != null && !f.isDone()) {
                                f.complete("ok");
                            }
                        }

                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }
        } catch (WakeupException e) {
            System.out.println("Kafka consumer thread warning: WakeupException");
        } catch (Exception ex) {
            ex.printStackTrace();
        } finally {
            consumer.close();
        }
    }

    public boolean hasAllResponses(String uuid) {
        Map<String, String> result = receivedResults.get(uuid);
        if (result == null) {
            return false;
        }
        for (String field : expectedFields) {
            String value = result.get(field);
            if (value == null || value.isEmpty()) {
                return false;
            }
        }
        return true;
    }

    public Map<String, String> getResults(String uuid) {
        return receivedResults.getOrDefault(uuid, Map.of());
    }

    private void cleanOldResults() {
        long now = System.currentTimeMillis();
        for (String uuid : lastUpdateTimestamps.keySet()) {
            long lastUpdate = lastUpdateTimestamps.get(uuid);
            if (now - lastUpdate > RESULTS_EXPIRATION_MS) {
                receivedResults.remove(uuid);
                lastUpdateTimestamps.remove(uuid);
                pending.remove(uuid);
            }
        }
    }

    public void shutdown() {
        if (consumerThread != null && consumerThread.isAlive()) {
            consumer.wakeup();
            try {
                consumerThread.join(5000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (cleanerExecutor != null && !cleanerExecutor.isShutdown()) {
            cleanerExecutor.shutdown();
        }
        if (producer != null) {
            producer.close();
        }
    }
}