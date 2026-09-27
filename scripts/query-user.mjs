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
  expression: `(() => {
    const tok = localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token');
    return tok ? JSON.parse(tok).user : null;
  })()`,
  returnByValue: true
});
console.log('USER:', data.result.value?.email, data.result.value?.id);
ws.close();
