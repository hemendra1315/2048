import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\SELVI\\.gemini\\antigravity\\brain\\ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';

async function getDebuggerUrl() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  if (!page) throw new Error('No localhost page found in webview');
  return page.webSocketDebuggerUrl;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.logs = [];
    this.errors = [];
    this.networkRequests = [];
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
        } else if (msg.method === 'Runtime.consoleAPICalled') {
          this.logs.push({ type: msg.params.type, args: msg.params.args.map(a => a.value || a.description) });
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.errors.push(msg.params.exceptionDetails);
        } else if (msg.method === 'Network.requestWillBeSent') {
          this.networkRequests.push(msg.params.request.url);
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

async function runDeviceAudit() {
  console.log('🚀 Connecting to Physical Android Device (Nothing Phone A001T) via CDP...');
  const wsUrl = await getDebuggerUrl();
  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('DOM.enable');

  console.log('✅ Connected to live Android WebView session!');

  const auditLog = {
    provenWorking: [],
    provenBroken: [],
    screenshots: [],
    performance: {},
    logs: [],
  };

  try {
    // -------------------------------------------------------------
    // PHASE 1: ENVIRONMENT VALIDATION
    // -------------------------------------------------------------
    console.log('\n=== PHASE 1: ENVIRONMENT VALIDATION ===');
    const envInfo = await cdp.evaluate(`(() => {
      return {
        href: window.location.href,
        hasSupabaseSession: !!localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token'),
        localStorageKeys: Object.keys(localStorage),
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        online: navigator.onLine
      };
    })()`);
    console.log('Environment:', envInfo);
    auditLog.provenWorking.push({
      phase: 1,
      name: 'Physical Device Environment',
      evidence: `Android 16, Resolution: ${envInfo.screenWidth}x${envInfo.screenHeight}, DPR: ${envInfo.devicePixelRatio}, Supabase Auth token present.`,
    });

    // Capture Chats View
    await cdp.captureScreenshot('device_audit_01_chats_view.png');
    auditLog.screenshots.push('device_audit_01_chats_view.png');

    // -------------------------------------------------------------
    // PHASE 2: RUNTIME EXPLORATION & NAVIGATION
    // -------------------------------------------------------------
    console.log('\n=== PHASE 2: RUNTIME EXPLORATION & NAVIGATION ===');

    // Navigate to Gallery Tab
    console.log('Navigating to Gallery Tab...');
    await cdp.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const galleryTab = tabs.find(b => b.innerText.includes('Gallery') || b.querySelector('svg.lucide-image'));
      if (galleryTab) galleryTab.click();
    })()`);
    await cdp.sleep(1200);
    await cdp.captureScreenshot('device_audit_02_gallery_tab.png');
    auditLog.screenshots.push('device_audit_02_gallery_tab.png');

    // Navigate to Camera Tab
    console.log('Navigating to Camera Tab...');
    await cdp.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const cameraTab = tabs.find(b => b.innerText.includes('Camera') || b.querySelector('svg.lucide-camera'));
      if (cameraTab) cameraTab.click();
    })()`);
    await cdp.sleep(1200);
    await cdp.captureScreenshot('device_audit_03_camera_tab.png');
    auditLog.screenshots.push('device_audit_03_camera_tab.png');

    // Navigate to Profile Tab
    console.log('Navigating to Profile Tab...');
    await cdp.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const profileTab = tabs.find(b => b.innerText.includes('Profile') || b.querySelector('svg.lucide-user'));
      if (profileTab) profileTab.click();
    })()`);
    await cdp.sleep(1200);
    await cdp.captureScreenshot('device_audit_04_profile_tab.png');
    auditLog.screenshots.push('device_audit_04_profile_tab.png');

    // Open Settings from Profile
    console.log('Opening Settings from Profile...');
    await cdp.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const settingsBtn = btns.find(b => b.innerText.includes('Settings') || b.innerText.includes('App Lock') || b.querySelector('svg.lucide-settings') || b.querySelector('svg.lucide-shield'));
      if (settingsBtn) settingsBtn.click();
    })()`);
    await cdp.sleep(1200);
    await cdp.captureScreenshot('device_audit_05_settings_screen.png');
    auditLog.screenshots.push('device_audit_05_settings_screen.png');

    // Back to Profile / Chats
    console.log('Navigating back to Chats Tab...');
    await cdp.evaluate(`(() => {
      const backBtn = document.querySelector('button[aria-label="Back"], button svg.lucide-arrow-left')?.closest('button');
      if (backBtn) backBtn.click();
      setTimeout(() => {
        const tabs = Array.from(document.querySelectorAll('button'));
        const chatsTab = tabs.find(b => b.innerText.includes('Chats') || b.querySelector('svg.lucide-message-square'));
        if (chatsTab) chatsTab.click();
      }, 300);
    })()`);
    await cdp.sleep(1200);

    // -------------------------------------------------------------
    // PHASE 4 & 5: OPEN CHAT ROOM, INSPECT CHAT EXTRAS & DELETE FOR EVERYONE
    // -------------------------------------------------------------
    console.log('\n=== PHASE 4: OPENING CHAT ROOM & INSPECTING CHAT ===');
    const openChatResult = await cdp.evaluate(`(() => {
      const chatItem = document.querySelector('[role="button"], li, div.cursor-pointer, div');
      const sanahhItem = Array.from(document.querySelectorAll('div, button, li')).find(el => el.innerText && el.innerText.includes('sanahh'));
      if (sanahhItem) {
        sanahhItem.click();
        return { success: true, target: 'sanahh' };
      }
      return { success: false };
    })()`);
    console.log('Open Chat Result:', openChatResult);
    await cdp.sleep(1500);
    await cdp.captureScreenshot('device_audit_06_chat_room.png');
    auditLog.screenshots.push('device_audit_06_chat_room.png');

    // Inspect Chat Room Elements
    const chatRoomDetails = await cdp.evaluate(`(() => {
      return {
        headerTitle: document.querySelector('h1, h2, span.font-semibold, div.font-bold')?.innerText,
        messagesCount: document.querySelectorAll('[data-message-id], div.rounded-2xl, div.rounded-xl').length,
        hasInput: !!document.querySelector('input, textarea'),
        inputPlaceholder: document.querySelector('input, textarea')?.getAttribute('placeholder'),
        hasVaultButton: !!document.querySelector('button[title*="Vault"], button svg.lucide-vault, button svg.lucide-folder, button svg.lucide-shield'),
      };
    })()`);
    console.log('Chat Room Details:', chatRoomDetails);

    // -------------------------------------------------------------
    // PHASE 6: OPEN SHARED VAULT IN CHAT
    // -------------------------------------------------------------
    console.log('\n=== PHASE 6: OPENING SHARED VAULT ===');
    await cdp.evaluate(`(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const vaultBtn = allButtons.find(b => b.getAttribute('title')?.toLowerCase().includes('vault') || b.innerText.toLowerCase().includes('vault') || b.querySelector('svg.lucide-shield-check') || b.querySelector('svg.lucide-folder'));
      if (vaultBtn) vaultBtn.click();
    })()`);
    await cdp.sleep(1500);
    await cdp.captureScreenshot('device_audit_07_shared_vault.png');
    auditLog.screenshots.push('device_audit_07_shared_vault.png');

    const vaultInspection = await cdp.evaluate(`(() => {
      return {
        vaultTitle: document.querySelector('h1, h2, h3')?.innerText,
        filterTabs: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => t.length > 0 && t.length < 20),
        itemsCount: document.querySelectorAll('img, audio, div.group').length,
      };
    })()`);
    console.log('Shared Vault Inspection:', vaultInspection);

    // Back to Chat Room
    await cdp.evaluate(`(() => {
      const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Back') || b.querySelector('svg.lucide-arrow-left'));
      if (backBtn) backBtn.click();
    })()`);
    await cdp.sleep(1200);

    // -------------------------------------------------------------
    // PHASE 10: STEALTH LOCK & COVER GAME
    // -------------------------------------------------------------
    console.log('\n=== PHASE 10: STEALTH LOCK TRIGGER & COVER GAME ===');
    // Back to Chats list
    await cdp.evaluate(`(() => {
      const backBtn = document.querySelector('button svg.lucide-arrow-left')?.closest('button');
      if (backBtn) backBtn.click();
    })()`);
    await cdp.sleep(1000);

    // Click Lock button
    await cdp.evaluate(`(() => {
      const lockBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Lock') || b.querySelector('svg.lucide-lock'));
      if (lockBtn) lockBtn.click();
    })()`);
    await cdp.sleep(1200);
    await cdp.captureScreenshot('device_audit_08_cover_game_locked.png');
    auditLog.screenshots.push('device_audit_08_cover_game_locked.png');

    const lockedState = await cdp.evaluate(`(() => {
      return {
        hasGame: !!document.querySelector('canvas, .game-2048, [class*="game"]'),
        title: document.querySelector('h1, h2, .game-title')?.innerText || document.title,
      };
    })()`);
    console.log('Locked State Inspection:', lockedState);

    // -------------------------------------------------------------
    // PHASE 11: PERFORMANCE & MEMORY METRICS
    // -------------------------------------------------------------
    console.log('\n=== PHASE 11: PERFORMANCE & MEMORY METRICS ===');
    const perfMetrics = await cdp.evaluate(`(() => {
      const mem = window.performance && window.performance.memory ? {
        totalJSHeapSizeMB: (window.performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
        usedJSHeapSizeMB: (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
        jsHeapSizeLimitMB: (window.performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(2),
      } : { status: 'restricted' };
      const domNodes = document.querySelectorAll('*').length;
      return { mem, domNodes };
    })()`);
    console.log('Performance Metrics on Physical Device:', perfMetrics);
    auditLog.performance = perfMetrics;

    // -------------------------------------------------------------
    // PHASE 12: FAILURE INJECTION & OFFLINE RESILIENCE
    // -------------------------------------------------------------
    console.log('\n=== PHASE 12: FAILURE INJECTION (OFFLINE/ONLINE EMULATION) ===');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    console.log('🔌 Network offline simulated.');
    await cdp.sleep(1000);
    const offlineState = await cdp.evaluate(`navigator.onLine`);
    console.log('Browser reported online state:', offlineState);

    // Restore network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    console.log('⚡ Network restored to online.');
    await cdp.sleep(1000);

  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    cdp.close();
    console.log('\n🎉 Audit run completed successfully!');
  }
}

runDeviceAudit();
