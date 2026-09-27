import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\SELVI\\.gemini\\antigravity\\brain\\ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';

async function getDebuggerUrl() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  return page.webSocketDebuggerUrl;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', reject);
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(msg.error);
          else cb.resolve(msg.result);
        }
      });
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    console.log(`📸 Screenshot saved: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return fullPath;
  }

  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const wsUrl = await getDebuggerUrl();
  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  console.log('📱 Dispatching PointerDown event on header button...');
  await cdp.evaluate(`(() => {
    const headerBtn = document.querySelector('header button');
    if (headerBtn) {
      const evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
      headerBtn.dispatchEvent(evt);
    }
  })()`);

  console.log('⏳ Holding long-press (1000ms)...');
  await cdp.sleep(1100);

  await cdp.evaluate(`(() => {
    const headerBtn = document.querySelector('header button');
    if (headerBtn) {
      const evt = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
      headerBtn.dispatchEvent(evt);
    }
  })()`);

  await cdp.sleep(600);
  await cdp.captureScreenshot('device_audit_09_unlock_sheet.png');

  const unlockSheetCheck = await cdp.evaluate(`(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
    return {
      inputs: inputs.map(i => ({ type: i.type, placeholder: i.placeholder })),
      buttons: buttons.filter(b => b.length > 0),
    };
  })()`);
  console.log('Unlock Sheet UI Details:', unlockSheetCheck);

  cdp.close();
}

run();
