import http from 'http';

const postData = JSON.stringify({
  messages: [{ role: "user", content: "What is my account balance?" }],
  uid: "3",
  thread_id: "test_frontend_123"
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 5001,
  path: '/api/ai/aegis/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  res.on('data', (chunk) => {
    console.log(`CHUNK: ${chunk.toString()}`);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});
req.write(postData);
req.end();
