from kafka import KafkaConsumer, KafkaProducer
import json
import os
import time
import socket

KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_HOST, KAFKA_PORT = KAFKA_BOOTSTRAP_SERVERS.split(":")
KAFKA_PORT = int(KAFKA_PORT)

def wait_for_kafka(host, port, timeout=30):
    start_time = time.time()
    while True:
        try:
            with socket.create_connection((host, port), timeout=2):
                return
        except (OSError, ConnectionRefusedError):
            if time.time() - start_time > timeout:
                raise RuntimeError(f"Could not connect to Kafka broker at {host}:{port}")
            time.sleep(2)

wait_for_kafka(KAFKA_HOST, KAFKA_PORT)

consumer = KafkaConsumer(
    'file-upload-topic',
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    group_id="file-upload-word-count-consumer-group",
    auto_offset_reset='earliest',
    value_deserializer=lambda x: x.decode('utf-8')
)
producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
    value_serializer=lambda x: json.dumps(x).encode('utf-8')
)

for message in consumer:
    raw_value = message.value.strip()
    if not raw_value:
        continue

    try:
        data = json.loads(raw_value)
        filename = data.get('filename')
        uuid = data.get('uuid')
    except json.JSONDecodeError:
        filename = raw_value

    if not filename:
        continue

    filepath = f"/work/{filename}"

    for attempt in range(10):
        if os.path.exists(filepath):
            break
        time.sleep(1)
    else:
        print(f"ERROR: {filepath} not found after 10 seconds.")
        continue

    try:
        with open(filepath, 'rb') as f:
            content = f.read()
            word_count = len(content.decode('utf-8', errors='ignore').split())

        producer.send('file-response-word-count-topic', {"uuid": uuid, "wordCount": word_count})
        producer.flush()
        print(f"[✓] Word count sent for {filename}: {word_count}")

    except Exception as e:
        print(f"File processing error: {e}")