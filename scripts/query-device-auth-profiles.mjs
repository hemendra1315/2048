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
    const tok = localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token');
    const sess = tok ? JSON.parse(tok) : null;
    if (!sess) return JSON.stringify({ hasSession: false, rawTok: tok });

    const res = await fetch('https://dddsplxihciighvmaqqt.supabase.co/rest/v1/profiles?select=*', {
      headers: {
        'apikey': '${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8'}',
        'Authorization': 'Bearer ' + sess.access_token
      }
    });
    const status = res.status;
    const body = await res.text();
    return JSON.stringify({ hasSession: true, status, body });
  })()`,
  returnByValue: true,
  awaitPromise: true
});
console.log('LIVE PROFILES JSON:', data.result.value);
ws.close();
