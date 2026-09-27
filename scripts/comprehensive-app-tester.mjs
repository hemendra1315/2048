import fs from 'node:fs';

async function main() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  if (!page) {
    console.error('Target not found');
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener('open', r);
    ws.addEventListener('error', j);
  });

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

  await send('Runtime.enable');
  await send('Log.enable');

  const evaluated = await send('Runtime.evaluate', {
    expression: `(() => {
      const audit = {
        title: document.title,
        url: window.location.href,
        hasGlobalErrors: window.__react_errors || [],
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText.trim()).filter(Boolean),
        buttonLabels: Array.from(document.querySelectorAll('button')).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean),
        inputCount: document.querySelectorAll('input, textarea').length,
        hasBrokenImages: Array.from(document.querySelectorAll('img')).filter(img => !img.complete || img.naturalWidth === 0).length,
        modalsOpen: Array.from(document.querySelectorAll('[role="dialog"]')).map(d => d.getAttribute('aria-label') || 'dialog'),
      };
      return audit;
    })()`,
    returnByValue: true
  });

  console.log('--- Comprehensive DOM & State Probe ---');
  console.log(JSON.stringify(evaluated.result.value, null, 2));

  // Test triggering unlock cover
  const unlockTrigger = await send('Runtime.evaluate', {
    expression: `(() => {
      // Find header or long-press target
      const header = document.querySelector('header') || document.querySelector('button');
      return header ? { found: true, text: header.innerText } : { found: false };
    })()`,
    returnByValue: true
  });
  console.log('Header target:', unlockTrigger.result.value);

  ws.close();
}

main().catch(console.error);
