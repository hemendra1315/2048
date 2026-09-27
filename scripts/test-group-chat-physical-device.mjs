import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\SELVI\\.gemini\\antigravity\\brain\\ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';

async function getDebuggerUrl() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  if (!page) {
    throw new Error('No localhost webview target found: ' + JSON.stringify(pages));
  }
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
    const filePath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`[CDP] Saved screenshot: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return filePath;
  }

  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('[AUDIT] Connecting to Nothing Phone via CDP port 9222...');
  const wsUrl = await getDebuggerUrl();
  const client = new CDPClient(wsUrl);
  await client.connect();
  console.log('[AUDIT] Connected to Chrome DevTools Protocol on physical device!');

  await client.send('Page.enable');
  await client.send('Runtime.enable');

  // Check state
  const state = await client.evaluate(`(() => ({
    hasPinInput: !!document.querySelector('input[type="password"], input[inputmode="numeric"]'),
    hasChatsList: !!document.querySelector('input[placeholder*="Search chats"]'),
    activeText: document.body.innerText.slice(0, 200)
  }))()`);
  console.log('[AUDIT] Initial Screen State:', state);

  // If in cover mode and not in chats list:
  if (!state.hasChatsList) {
    console.log('[AUDIT] Triggering secret unlock long-press...');
    await client.evaluate(`(() => {
      const headerBtn = document.querySelector('header button');
      if (headerBtn) {
        headerBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      }
    })()`);
    await client.sleep(1200);

    await client.evaluate(`(() => {
      const headerBtn = document.querySelector('header button');
      if (headerBtn) {
        headerBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      }
    })()`);
    await client.sleep(800);

    // Enter PIN 2048
    console.log('[AUDIT] Entering PIN 2048 into unlock modal...');
    await client.evaluate(`(() => {
      const pinInputs = Array.from(document.querySelectorAll('input'));
      const pinInput = pinInputs.find(i => i.type === 'password' || i.getAttribute('inputmode') === 'numeric' || (i.placeholder && i.placeholder.toLowerCase().includes('pin')));
      if (pinInput) {
        const proto = window.HTMLInputElement.prototype;
        const setVal = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setVal) {
          setVal.call(pinInput, '2048');
        } else {
          pinInput.value = '2048';
        }
        pinInput.dispatchEvent(new Event('input', { bubbles: true }));
        pinInput.dispatchEvent(new Event('change', { bubbles: true }));

        const submitBtn = Array.from(document.querySelectorAll('button')).find(b => 
          b.innerText.toLowerCase().includes('unlock') || b.type === 'submit'
        );
        if (submitBtn) submitBtn.click();
      }
    })()`);
    await client.sleep(1200);
  }

  // Ensure on messages tab
  await client.evaluate(`(() => {
    const tabs = Array.from(document.querySelectorAll('button, a, div[role="tab"]'));
    const msgTab = tabs.find(el => el.innerText.includes('Chats') || el.innerText.includes('Messages'));
    if (msgTab) msgTab.click();
  })()`);
  await client.sleep(1000);

  // 1. Capture Inbox View
  console.log('[AUDIT] Capturing Inbox View...');
  await client.captureScreenshot('device_group_01_inbox.png');

  // Check inbox conversations count and group button presence
  const inboxState = await client.evaluate(`(() => {
    const convButtons = Array.from(document.querySelectorAll('button[aria-label*="chat with"], button[aria-label*="group"]')).map(b => b.getAttribute('aria-label'));
    const allButtons = Array.from(document.querySelectorAll('button')).map(b => b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText.trim()).filter(Boolean);
    return {
      convCount: convButtons.length,
      convLabels: convButtons,
      buttons: allButtons.slice(0, 10)
    };
  })()`);
  console.log('[AUDIT] Inbox State:', inboxState);

  // 2. Open "New Group" Modal
  console.log('[AUDIT] Opening New Group modal...');
  const newGroupClick = await client.evaluate(`(() => {
    const newGrpBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.getAttribute('title')?.toLowerCase().includes('new group') || 
      b.getAttribute('aria-label')?.toLowerCase().includes('new group') ||
      b.innerText.toLowerCase().includes('new group') ||
      b.querySelector('svg.lucide-users')
    );
    if (newGrpBtn) {
      newGrpBtn.click();
      return { clicked: true, title: newGrpBtn.getAttribute('title') || newGrpBtn.getAttribute('aria-label') || newGrpBtn.innerText };
    }
    return { clicked: false };
  })()`);
  console.log('[AUDIT] New Group Button Click Result:', newGroupClick);
  await client.sleep(800);

  // Capture New Group Modal
  await client.captureScreenshot('device_group_02_new_group_modal.png');

  // Close modal
  await client.evaluate(`(() => {
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.getAttribute('aria-label')?.includes('Close') || 
      b.getAttribute('title')?.includes('Close') ||
      b.querySelector('svg.lucide-x')
    );
    if (closeBtn) closeBtn.click();
  })()`);
  await client.sleep(600);

  // 3. Open Sanahh's chat room
  console.log('[AUDIT] Opening Sanahh chat room...');
  await client.evaluate(`(() => {
    const chatBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.getAttribute('aria-label')?.toLowerCase().includes('sanahh') ||
      b.innerText.toLowerCase().includes('sanahh')
    );
    if (chatBtn) chatBtn.click();
  })()`);
  await client.sleep(1200);

  // Capture Chat Room
  await client.captureScreenshot('device_group_03_chat_active.png');

  // 4. Click header contact info
  console.log('[AUDIT] Opening Header Info Dossier...');
  await client.evaluate(`(() => {
    const headerBtn = document.querySelector('header button, .sticky button');
    const dossierBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.getAttribute('aria-label')?.toLowerCase().includes('info') || 
      b.getAttribute('title')?.toLowerCase().includes('info') ||
      b.querySelector('svg.lucide-info')
    );
    if (dossierBtn) dossierBtn.click();
    else if (headerBtn) headerBtn.click();
  })()`);
  await client.sleep(800);

  // Capture Info Sheet
  await client.captureScreenshot('device_group_04_info_sheet.png');

  console.log('[AUDIT] Zero-trust physical device live audit completed successfully!');
  client.close();
}

run().catch(err => {
  console.error('[AUDIT] Failure:', err);
  process.exit(1);
});
