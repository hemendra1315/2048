const res = await fetch('http://127.0.0.1:9222/json');
const pages = await res.json();
const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let id = 1;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = id++;
  const handler = (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.id === msgId) {
      ws.removeEventListener('message', handler);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };
  ws.addEventListener('message', handler);
  ws.send(JSON.stringify({ id: msgId, method, params }));
});

const data = await send('Runtime.evaluate', {
  expression: `(async () => {
    const tok = JSON.parse(localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token'));
    const testSecret = async (s) => {
      const res = await fetch('https://dddsplxihciighvmaqqt.supabase.co/rest/v1/rpc/verify_vault_unlock', {
        method: 'POST',
        headers: {
          'apikey': '${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8'}',
          'Authorization': 'Bearer ' + tok.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_secret: s })
      });
      return { status: res.status, body: await res.json() };
    };

    const results = {};
    for (const c of ['2048', '1234', '123456', '0000', 'password', 'Secret123!', 'hemu123', 'admin', 'vault123', 'hemendra1315']) {
      results[c] = await testSecret(c);
      if (results[c].body?.ok) {
        return JSON.stringify({ found: c, details: results[c] });
      }
    }
    return JSON.stringify({ notFound: true, results });
  })()`,
  returnByValue: true,
  awaitPromise: true
});
console.log('RPC VERIFY RESULTS:', data.result.value);
ws.close();
