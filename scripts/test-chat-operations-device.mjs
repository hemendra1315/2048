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

async function runChatAudit() {
  const wsUrl = await getDebuggerUrl();
  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  console.log('💬 1. Opening Chat Room with sanahh on Physical Device...');
  const chatOpened = await cdp.evaluate(`(() => {
    // Find the sanahh conversation row
    const elements = Array.from(document.querySelectorAll('div, button, li'));
    const sanahhEl = elements.find(el => el.innerText && el.innerText.includes('sanahh') && (el.innerText.includes('Photo') || el.innerText.includes('am') || el.innerText.includes('pm')));
    if (sanahhEl) {
      sanahhEl.click();
      return { success: true, text: sanahhEl.innerText.substring(0, 50) };
    }
    // Fallback: click any chat item
    const fallback = document.querySelector('[role="button"], .cursor-pointer');
    if (fallback) {
      fallback.click();
      return { success: true, fallback: true };
    }
    return { success: false };
  })()`);
  console.log('Chat opened result:', chatOpened);

  await cdp.sleep(1500);
  await cdp.captureScreenshot('device_audit_10_sanahh_chat_room.png');

  // Inspect Chat Room Structure
  const roomInspection = await cdp.evaluate(`(() => {
    const header = document.querySelector('header')?.innerText || document.querySelector('h1, h2')?.innerText;
    const msgCount = document.querySelectorAll('[data-message-id], .message-bubble, div[class*="rounded-2xl"]').length;
    const input = document.querySelector('textarea, input[type="text"]:not([placeholder*="Search"])');
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText.trim());
    return {
      header,
      msgCount,
      hasComposer: !!input,
      composerPlaceholder: input?.getAttribute('placeholder'),
      buttons: buttons.filter(Boolean)
    };
  })()`);
  console.log('Chat Room Inspection on Device:', roomInspection);

  // 2. Send Live Text Message
  console.log('\n💬 2. Typing and Sending Test Message on Physical Device...');
  const sendResult = await cdp.evaluate(`(() => {
    const input = document.querySelector('textarea, input[type="text"]:not([placeholder*="Search"])');
    if (!input) return { success: false, reason: 'no_input' };
    
    // Set value and trigger input event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype || window.HTMLInputElement.prototype, 'value')?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, 'Verified on Nothing Phone USB ADB! 🚀');
    } else {
      input.value = 'Verified on Nothing Phone USB ADB! 🚀';
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Click Send Button
    const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('title')?.toLowerCase().includes('send') || b.getAttribute('aria-label')?.toLowerCase().includes('send') || b.querySelector('svg.lucide-send'));
    if (sendBtn) {
      sendBtn.click();
      return { success: true, method: 'send_button' };
    }

    // Try submitting form or enter key
    const form = input.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return { success: true, method: 'form_submit' };
    }

    return { success: false, reason: 'no_send_button' };
  })()`);
  console.log('Send Message Result:', sendResult);

  await cdp.sleep(2000);
  await cdp.captureScreenshot('device_audit_11_message_sent.png');

  // 3. Open Shared Vault inside Chat Room
  console.log('\n🔒 3. Opening Shared Vault from Chat Room...');
  const vaultOpenResult = await cdp.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const vaultBtn = buttons.find(b => {
      const t = (b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText || '').toLowerCase();
      return t.includes('vault') || b.querySelector('svg.lucide-folder') || b.querySelector('svg.lucide-shield');
    });
    if (vaultBtn) {
      vaultBtn.click();
      return { success: true, buttonText: vaultBtn.innerText || vaultBtn.getAttribute('title') };
    }
    return { success: false };
  })()`);
  console.log('Vault Open Result:', vaultOpenResult);

  await cdp.sleep(1500);
  await cdp.captureScreenshot('device_audit_12_shared_vault_live.png');

  const liveVaultDetails = await cdp.evaluate(`(() => {
    return {
      title: document.querySelector('h1, h2, h3, div.font-bold')?.innerText,
      tabs: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t.length > 0 && t.length < 30),
      images: Array.from(document.querySelectorAll('img')).map(i => i.src.substring(0, 80)),
    };
  })()`);
  console.log('Live Shared Vault Details:', liveVaultDetails);

  // 4. Open Chat Theme / Extras Sheet
  console.log('\n🎨 4. Returning to chat and opening Chat Extras / Wallpaper Sheet...');
  await cdp.evaluate(`(() => {
    // Click Back from Shared Vault
    const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Back') || b.querySelector('svg.lucide-arrow-left'));
    if (backBtn) backBtn.click();
  })()`);
  await cdp.sleep(1000);

  // Click Extras / Theme button in header
  const extrasOpened = await cdp.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('header button, div.flex button'));
    const moreBtn = buttons.find(b => b.getAttribute('title')?.toLowerCase().includes('theme') || b.getAttribute('title')?.toLowerCase().includes('more') || b.querySelector('svg.lucide-more-vertical') || b.querySelector('svg.lucide-palette') || b.querySelector('svg.lucide-sparkles'));
    if (moreBtn) {
      moreBtn.click();
      return { success: true };
    }
    return { success: false };
  })()`);
  console.log('Extras sheet opened:', extrasOpened);

  await cdp.sleep(1200);
  await cdp.captureScreenshot('device_audit_13_chat_extras_sheet.png');

  cdp.close();
  console.log('\n🎉 Real-device chat operations audit completed successfully!');
}

runChatAudit();
