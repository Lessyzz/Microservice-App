from kafka import KafkaConsumer, KafkaProducer
import json
import os
import time
import socket

def wait_for_kafka(host, port, timeout=30):
    print(f"Waiting for kafka connection: {host}:{port}")
    start_time = time.time()
    while True:
        try:
            with socket.create_connection((host, port), timeout=2):
                print(f"Connected: {host}:{port}")
                return
        except (OSError, ConnectionRefusedError):
            if time.time() - start_time > timeout:
                raise RuntimeError("Could not connect to Kafka broker.")
            time.sleep(2)

wait_for_kafka("kafka", 9092)

consumer = KafkaConsumer(
    'file-upload-topic', 
    bootstrap_servers='kafka:9092', 
    group_id="file-upload-letter-count-consumer-group",
    auto_offset_reset='earliest',
    value_deserializer=lambda x: x.decode('utf-8')
)
producer = KafkaProducer(
    bootstrap_servers='kafka:9092',
    value_serializer=lambda x: json.dumps(x).encode('utf-8')
)

print("Listening for messages on 'file-upload-topic'...")

for message in consumer:
    raw_value = message.value.strip()
    print(f"Received message: {raw_value}")

    if not raw_value:
        print("Empty message received, skipping.")
        continue

    try:
        data = json.loads(raw_value)
        filename = data.get('filename')
        uuid = data.get('uuid')
    except json.JSONDecodeError:
        print(f"Not JSON, using as filename: {raw_value}")
        filename = raw_value

    if not filename:
        print("Filename not found, skipping.")
        continue

    print(f"Processing file: {filename}")
    filepath = f"/work/{filename}"

    for attempt in range(10):
        if os.path.exists(filepath):
            print(f"File found: {filepath}")
            break
        print(f"Waiting for file... Attempt {attempt + 1}/10")
        time.sleep(1)
    else:
        print(f"ERROR: {filepath} not found after 10 seconds.")
        continue

    try:
        letter_count = 0
        with open(filepath, 'rb') as f:
            content = f.read()
            letter_count = sum(c.isalpha() for c in content.decode(errors='ignore'))

        response = {
            "uuid": uuid,
            "letterCount": letter_count
        }
        
        producer.send('file-response-letter-count-topic', response)
        producer.flush()
        print(f"[✓] Letter count calculated and sent for {filename}: {letter_count}")

    except Exception as e:
        print(f"File processing error: {e}")
        continue