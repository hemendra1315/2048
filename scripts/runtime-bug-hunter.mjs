import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  console.log('Discovered devtools targets:', pages.map(p => ({ title: p.title, url: p.url, id: p.id })));

  const page = pages.find(p => p.type === 'page' && (p.url.includes('localhost') || p.url.includes('http')));
  if (!page) {
    console.error('No suitable webview page target found');
    process.exit(1);
  }

  console.log('Connecting to target:', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  let nextId = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = nextId++;
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

  // Enable Log, Runtime, Network, Page domains
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const logs = [];
  const errors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      logs.push(`[Console ${type}] ${text}`);
      if (type === 'error') errors.push(`[Console Error] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const exp = msg.params.exceptionDetails;
      errors.push(`[Uncaught Exception] ${exp.text} ${exp.exception?.description || ''}`);
    }
  });

  // Evaluate current app state
  const appState = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        url: window.location.href,
        readyState: document.readyState,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 300),
        hasRoot: Boolean(document.getElementById('root')),
        buttonCount: document.querySelectorAll('button').length,
        buttons: Array.from(document.querySelectorAll('button')).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 15),
        localStorageKeys: Object.keys(localStorage),
        sessionExists: Boolean(localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token')),
      };
    })()`,
    returnByValue: true,
  });

  console.log('App Runtime State:', JSON.stringify(appState.result.value, null, 2));

  // Take a high-resolution screenshot from the live device
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.resolve('runtime_device_audit.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log('Saved live screenshot to:', shotPath);

  console.log('\n--- Captured Errors (Total: ' + errors.length + ') ---');
  if (errors.length === 0) {
    console.log('Zero runtime console errors or uncaught exceptions detected on device!');
  } else {
    errors.forEach(e => console.error(e));
  }

  ws.close();
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
