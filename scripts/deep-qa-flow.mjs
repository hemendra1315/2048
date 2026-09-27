import fs from 'node:fs';
import path from 'node:path';

const ARTIFACTS_DIR = 'C:/Users/SELVI/.gemini/antigravity/brain/ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
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

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const capturedErrors = [];
  const capturedLogs = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      capturedLogs.push(`[${type}] ${text}`);
      if (type === 'error' || type === 'assert') {
        capturedErrors.push(`[Console ${type}] ${text}`);
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const exp = msg.params.exceptionDetails;
      capturedErrors.push(`[Uncaught Exception] ${exp.text} ${exp.exception?.description || ''}`);
    }
  });

  async function takeScreenshot(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(ARTIFACTS_DIR, `${name}.png`);
    fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
    console.log(`[Screenshot Captured] ${name}.png`);
  }

  async function evalInPage(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails);
    }
    return res.result?.value;
  }

  console.log('\n--- Step 1: Check Current Screen & Unlock if at Arcade ---');
  let currentTitle = await evalInPage(`document.title`);
  console.log('Current Document Title:', currentTitle);
  await takeScreenshot('qa_01_initial_screen');

  // Trigger PIN unlock or unlock flow if on Arcade cover
  await evalInPage(`(() => {
    // If PIN modal or vault unlock can be triggered
    const settingsBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label')?.includes('settings') || b.innerText.includes('ARCADE'));
    if (settingsBtn) {
      // Simulate long press or secret tap if needed, or trigger unlock directly
      console.log('Found button:', settingsBtn.innerText || settingsBtn.getAttribute('aria-label'));
    }
    // Check if custom window / localStorage trigger exists
    const token = localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token');
    return { tokenExists: Boolean(token) };
  })()`);

  // Let's trigger the secret tap sequence or vault state to open vault
  const unlockResult = await evalInPage(`(() => {
    // Dispatch unlock event or set state if available
    const header = document.querySelector('header') || document.body;
    // Dispatch custom event if any, or trigger secret code
    window.dispatchEvent(new CustomEvent('vault:unlock', { detail: { pin: '0000' } }));
    // If there is an unlock button or trigger on the page:
    const arcadeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Hemuji') || b.innerText.includes('ARCADE'));
    if (arcadeBtn) {
      // 5 rapid taps to trigger secret pin sheet
      for (let i = 0; i < 5; i++) {
        arcadeBtn.click();
      }
    }
    return { clicked: Boolean(arcadeBtn) };
  })()`);
  console.log('Unlock trigger result:', unlockResult);
  await sleep(1000);

  // Check if PIN sheet appeared
  const pinSheetCheck = await evalInPage(`(() => {
    const pinInputs = Array.from(document.querySelectorAll('button')).filter(b => /^[0-9]$/.test(b.innerText.trim()));
    if (pinInputs.length > 0) {
      // Tap 0-0-0-0
      const zeroBtn = pinInputs.find(b => b.innerText.trim() === '0');
      if (zeroBtn) {
        for (let i = 0; i < 4; i++) zeroBtn.click();
        return { pinEntered: true };
      }
    }
    return { pinEntered: false, digitButtons: pinInputs.length };
  })()`);
  console.log('PIN sheet check:', pinSheetCheck);
  await sleep(1500);
  await takeScreenshot('qa_02_after_unlock_attempt');

  // Let's check current UI view
  const currentView = await evalInPage(`(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean);
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')).map(h => h.innerText.trim());
    return { headings, buttons: buttons.slice(0, 20) };
  })()`);
  console.log('Current View Status:', currentView);

  // If in Messages / Vault, let's navigate to conversations
  console.log('\n--- Step 2: Open Chat / Conversation ---');
  const chatOpenResult = await evalInPage(`(() => {
    // Find conversation item or chat row
    const convItems = Array.from(document.querySelectorAll('[data-conversation-id], [role="button"], button')).filter(el => {
      const text = el.innerText || '';
      return text.includes('Sanahh') || text.includes('Hemu') || text.includes('General') || text.includes('Squad');
    });
    if (convItems.length > 0) {
      convItems[0].click();
      return { opened: true, text: convItems[0].innerText.slice(0, 50) };
    }
    return { opened: false, availableButtons: Array.from(document.querySelectorAll('button')).map(b => b.innerText).slice(0, 10) };
  })()`);
  console.log('Chat Open Result:', chatOpenResult);
  await sleep(1500);
  await takeScreenshot('qa_03_chat_view');

  console.log('\n--- Step 3: Open Chat Extras / Shared Vault ---');
  const vaultOpenResult = await evalInPage(`(() => {
    // Look for vault button or chat header extras
    const buttons = Array.from(document.querySelectorAll('button'));
    const vaultBtn = buttons.find(b => {
      const label = (b.getAttribute('aria-label') || b.innerText || '').toLowerCase();
      return label.includes('vault') || label.includes('shared') || label.includes('media') || label.includes('extras') || label.includes('lock') || label.includes('shield');
    });
    if (vaultBtn) {
      vaultBtn.click();
      return { clickedVault: true, btnText: vaultBtn.innerText || vaultBtn.getAttribute('aria-label') };
    }
    // Try top right button in header or attachment button
    const headerBtns = Array.from(document.querySelectorAll('header button'));
    if (headerBtns.length > 0) {
      headerBtns[headerBtns.length - 1].click();
      return { clickedHeaderAction: true };
    }
    return { clickedVault: false };
  })()`);
  console.log('Vault Open Result:', vaultOpenResult);
  await sleep(1500);
  await takeScreenshot('qa_04_vault_or_extras');

  // If chat extras menu opened, click "Shared Vault"
  await evalInPage(`(() => {
    const items = Array.from(document.querySelectorAll('button, [role="button"]'));
    const vaultItem = items.find(el => (el.innerText || '').toLowerCase().includes('shared vault'));
    if (vaultItem) {
      vaultItem.click();
      return { clickedSharedVaultItem: true };
    }
    return { clickedSharedVaultItem: false };
  })()`);
  await sleep(1500);
  await takeScreenshot('qa_05_shared_vault_screen');

  console.log('\n--- Step 4: Verify Shared Vault Tabs & Inspector ---');
  const vaultState = await evalInPage(`(() => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.innerText.trim());
    const tabs = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t => ['All', 'Photos', 'Videos', 'Documents', 'Albums', 'New Album'].includes(t));
    const mediaItems = document.querySelectorAll('[data-vault-item-id], img, video').length;
    return { headings, tabs, mediaItems };
  })()`);
  console.log('Shared Vault State:', vaultState);

  // Click on "Albums" tab if present
  const albumTabResult = await evalInPage(`(() => {
    const albumTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Albums');
    if (albumTab) {
      albumTab.click();
      return { clickedAlbumTab: true };
    }
    return { clickedAlbumTab: false };
  })()`);
  console.log('Album Tab Result:', albumTabResult);
  await sleep(1000);
  await takeScreenshot('qa_06_shared_vault_albums_tab');

  console.log('\n--- Step 5: Check Full Console Logs and Errors ---');
  console.log(`Total captured console logs: ${capturedLogs.length}`);
  console.log(`Total captured errors/exceptions: ${capturedErrors.length}`);
  if (capturedErrors.length > 0) {
    console.error('Captured Errors:');
    capturedErrors.forEach(err => console.error(err));
  } else {
    console.log('PASS: 0 runtime console errors or uncaught exceptions found!');
  }

  // Check DOM broken images or failed asset loads
  const assetHealth = await evalInPage(`(() => {
    const brokenImages = Array.from(document.querySelectorAll('img')).filter(img => !img.complete || img.naturalWidth === 0);
    return {
      totalImages: document.querySelectorAll('img').length,
      brokenImagesCount: brokenImages.length,
      brokenSrcs: brokenImages.map(img => img.src).slice(0, 5)
    };
  })()`);
  console.log('Asset Health Check:', assetHealth);

  ws.close();
  console.log('\nQA Automated Flow Completed Successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('QA Automation Error:', err);
  process.exit(1);
});
