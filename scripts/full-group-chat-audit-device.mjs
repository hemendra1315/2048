import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ARTIFACTS_DIR = 'C:\\Users\\SELVI\\.gemini\\antigravity\\brain\\ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';

function captureScreenshot(filename) {
  const fullPath = path.join(ARTIFACTS_DIR, filename);
  execSync(`adb shell screencap -p /sdcard/${filename} && adb pull /sdcard/${filename} "${fullPath}"`, { stdio: 'pipe' });
  const stats = fs.statSync(fullPath);
  console.log(`📸 [ADB-SCREENSHOT] Saved: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
  return fullPath;
}

async function getDebuggerUrl() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  return page.webSocketDebuggerUrl;
}

const wsUrl = await getDebuggerUrl();
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));

let id = 1;
const callbacks = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.id && callbacks.has(msg.id)) {
    const cb = callbacks.get(msg.id);
    callbacks.delete(msg.id);
    if (msg.error) cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else cb.resolve(msg.result);
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = id++;
  callbacks.set(msgId, { resolve, reject });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});

const evalJs = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result?.value;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('🚀 Executing Complete Group Chat & Nicknames Physical Device Audit...');

// Step 1: Trigger long press on header button to open unlock modal
console.log('1️⃣ Triggering stealth unlock long-press...');
await evalJs(`(() => {
  const headerBtn = document.querySelector('header button');
  if (headerBtn) {
    headerBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  }
})()`);
await sleep(1100);

await evalJs(`(() => {
  const headerBtn = document.querySelector('header button');
  if (headerBtn) {
    headerBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  }
})()`);
await sleep(800);

captureScreenshot('device_group_audit_01_unlock_sheet.png');

// Step 2: Fill in password/PIN and unlock
console.log('2️⃣ Submitting unlock credentials...');
await evalJs(`(() => {
  const input = document.querySelector('input[type="password"], input[placeholder*="Password"], input[inputmode="numeric"]');
  if (input) {
    const proto = window.HTMLInputElement.prototype;
    const setVal = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setVal) setVal.call(input, '2048');
    else input.value = '2048';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const form = input.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    } else {
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.innerText.toLowerCase().includes('unlock') || b.type === 'submit'
      );
      if (submitBtn) submitBtn.click();
    }
  }
})()`);
await sleep(1500);

// Step 3: Switch to Chats Tab
console.log('3️⃣ Switching to Chats / Messages tab...');
await evalJs(`(() => {
  const tabs = Array.from(document.querySelectorAll('button, a, div[role="tab"]'));
  const msgTab = tabs.find(el => el.innerText.includes('Chats') || el.innerText.includes('Messages') || el.querySelector('svg.lucide-message-square'));
  if (msgTab) msgTab.click();
})()`);
await sleep(1000);

captureScreenshot('device_group_audit_02_inbox_live.png');

// Step 4: Click New Group Button
console.log('4️⃣ Opening New Group Chat Modal...');
const groupModalResult = await evalJs(`(() => {
  const newGroupBtn = Array.from(document.querySelectorAll('button')).find(b => 
    b.getAttribute('title')?.toLowerCase().includes('new group') ||
    b.getAttribute('aria-label')?.toLowerCase().includes('new group') ||
    b.querySelector('svg.lucide-users')
  );
  if (newGroupBtn) {
    newGroupBtn.click();
    return { clicked: true };
  }
  return { clicked: false };
})()`);
console.log('Group Modal Click Result:', groupModalResult);
await sleep(1000);

captureScreenshot('device_group_audit_03_new_group_modal.png');

// Step 5: Close New Group Modal and open Sanahh chat room
console.log('5️⃣ Navigating to Sanahh Chat Room...');
await evalJs(`(() => {
  const closeBtn = Array.from(document.querySelectorAll('button')).find(b => 
    b.getAttribute('aria-label')?.includes('Close') || 
    b.getAttribute('title')?.includes('Close') ||
    b.querySelector('svg.lucide-x')
  );
  if (closeBtn) closeBtn.click();
})()`);
await sleep(600);

await evalJs(`(() => {
  const chatItem = Array.from(document.querySelectorAll('button, div[role="button"], li')).find(el => 
    el.getAttribute('aria-label')?.toLowerCase().includes('sanahh') ||
    el.innerText.toLowerCase().includes('sanahh')
  );
  if (chatItem) chatItem.click();
})()`);
await sleep(1500);

captureScreenshot('device_group_audit_04_chatroom_active.png');

// Step 6: Open Header Group / Contact Info Sheet
console.log('6️⃣ Opening Group / Contact Info Dossier...');
await evalJs(`(() => {
  const headerInfo = document.querySelector('header button, .sticky.top-0 button');
  if (headerInfo) headerInfo.click();
})()`);
await sleep(1000);

captureScreenshot('device_group_audit_05_info_dossier.png');

console.log('\n🎉 ALL ZERO-TRUST PHYSICAL DEVICE AUDIT ARTIFACTS CAPTURED SUCCESSFULLY!');
ws.close();
