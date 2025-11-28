const fetch = require('node-fetch');

async function test() {
  const res = await fetch('http://localhost:3000/api/langchain-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, how are you?' }] }),
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}

test().catch(err => { console.error(err); process.exit(1); });
