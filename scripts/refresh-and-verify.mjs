import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ARTIFACTS_DIR = 'C:\\Users\\SELVI\\.gemini\\antigravity\\brain\\ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';

function captureScreenshot(filename) {
  const fullPath = path.join(ARTIFACTS_DIR, filename);
  execSync(`adb shell screencap -p /sdcard/${filename} && adb pull /sdcard/${filename} "${fullPath}"`, { stdio: 'pipe' });
  const stats = fs.statSync(fullPath);
  console.log(`📸 [ADB] Saved: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
  return fullPath;
}

const res = await fetch('http://127.0.0.1:9222/json');
const pages = await res.json();
const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
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

const evaluate = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result?.value;
};

console.log('🔄 Reloading page on Nothing Phone...');
await evaluate(`window.location.reload()`);
await new Promise(r => setTimeout(r, 2000));

console.log('📸 Capturing Reloaded Screen...');
captureScreenshot('device_audit_20_reloaded_launcher.png');

const pageInfo = await evaluate(`(() => ({
  title: document.title,
  buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
  inputs: Array.from(document.querySelectorAll('input')).map(i => i.placeholder || i.type)
}))()`);
console.log('Page Info:', pageInfo);

ws.close();
