const payload = { messages: [{ role: 'user', content: 'hello, how are you' }] };

(async () => {
  try {
    console.log('Sending payload:', JSON.stringify(payload, null, 2));
    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('\n=== Response ===');
    console.log('Status:', res.status);
    console.log('Headers:', Object.fromEntries(res.headers.entries()));
    
    const text = await res.text();
    console.log('\nResponse body (first 500 chars):');
    console.log(text.slice(0, 500));
    
    // Try to parse as JSON if it looks like JSON
    if (text.trim().startsWith('{')) {
      try {
        const json = JSON.parse(text);
        console.log('\nParsed JSON:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('(Could not parse as JSON)');
      }
    }
    
    console.log('\nTotal response length:', text.length, 'characters');
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
