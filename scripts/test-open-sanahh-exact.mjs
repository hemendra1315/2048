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

  console.log('🎯 Clicking the Sanahh conversation row specifically...');
  const clickRes = await cdp.evaluate(`(() => {
    const btn = document.querySelector('button[aria-label*="sanahh"]');
    if (btn) {
      btn.click();
      return { clicked: true, label: btn.getAttribute('aria-label') };
    }
    return { clicked: false };
  })()`);
  console.log('Click result:', clickRes);

  await cdp.sleep(2000);
  await cdp.captureScreenshot('device_audit_14_sanahh_chat_active.png');

  // Check ChatRoom Elements
  const roomState = await cdp.evaluate(`(() => {
    const headerTitle = document.querySelector('h2, h1, .font-semibold')?.innerText;
    const input = document.querySelector('textarea, input[placeholder*="message"], input[type="text"]');
    const bubbles = Array.from(document.querySelectorAll('[data-message-id], [class*="bubble"], div[class*="rounded-2xl"]')).map(b => b.innerText.substring(0, 40));
    const allBtns = Array.from(document.querySelectorAll('button')).map(b => b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText.trim());
    return {
      headerTitle,
      hasInput: !!input,
      inputPlaceholder: input?.getAttribute('placeholder'),
      bubblesCount: bubbles.length,
      sampleBubbles: bubbles.slice(0, 5),
      buttons: allBtns.filter(Boolean)
    };
  })()`);
  console.log('Sanahh ChatRoom Live State:', roomState);

  // Send a Live Message from the device
  console.log('\n💬 Sending Live Message from Nothing Phone...');
  const sendRes = await cdp.evaluate(`(() => {
    const input = document.querySelector('textarea, input[placeholder*="message"], input[type="text"]');
    if (!input) return { sent: false, error: 'no_input_found' };

    const proto = window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setVal = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setVal) {
      setVal.call(input, 'Verified on Nothing Phone USB ADB! 🚀');
    } else {
      input.value = 'Verified on Nothing Phone USB ADB! 🚀';
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Find send button
    const sendBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.getAttribute('title') || b.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('send') || b.querySelector('svg.lucide-send');
    });

    if (sendBtn) {
      sendBtn.click();
      return { sent: true, method: 'send_button' };
    }
    return { sent: false, error: 'no_send_button' };
  })()`);
  console.log('Send Message result:', sendRes);

  await cdp.sleep(2000);
  await cdp.captureScreenshot('device_audit_15_chat_with_new_message.png');

  // Open Shared Vault from ChatRoom
  console.log('\n🔒 Opening Shared Vault inside sanahh ChatRoom...');
  const vaultClickRes = await cdp.evaluate(`(() => {
    const vaultBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const t = (b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText || '').toLowerCase();
      return t.includes('vault') || b.querySelector('svg.lucide-shield-check') || b.querySelector('svg.lucide-folder');
    });
    if (vaultBtn) {
      vaultBtn.click();
      return { opened: true, btn: vaultBtn.getAttribute('title') || vaultBtn.innerText };
    }
    return { opened: false };
  })()`);
  console.log('Vault click result:', vaultClickRes);

  await cdp.sleep(2000);
  await cdp.captureScreenshot('device_audit_16_shared_vault_sanahh.png');

  const vaultContent = await cdp.evaluate(`(() => {
    const title = document.querySelector('h1, h2, h3')?.innerText;
    const filters = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => ['All', 'Photos', 'Videos', 'Audio', 'Notes', 'Favorites'].some(f => t.includes(f)));
    const mediaCount = document.querySelectorAll('img, audio, .group').length;
    return { title, filters, mediaCount };
  })()`);
  console.log('Shared Vault Content on Device:', vaultContent);

  cdp.close();
}

run();
