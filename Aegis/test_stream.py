import requests
import json

payload = {
    "messages": [{"role": "user", "content": "What is my account balance?"}],
    "uid": "3",
    "thread_id": "test_stream_123"
}

with requests.post("http://127.0.0.1:5050/chat", json=payload, stream=True) as r:
    with open("stream_output.txt", "w", encoding="utf-8") as f:
        for line in r.iter_lines():
            if line:
                f.write(line.decode('utf-8') + "\n")
