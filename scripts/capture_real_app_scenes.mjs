import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CAPTURE_DIR = path.resolve('REEL_SOURCE_CAPTURE');

if (!fs.existsSync(CAPTURE_DIR)) {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function captureAllScenes() {
  console.log('🎬 Launching Chrome to capture high-resolution real app scenes...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--window-size=1080,1920',
    ],
    defaultViewport: {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.62, // 1080x2397 high-DPI vertical
      isMobile: true,
      hasTouch: true,
    },
  });

  const page = await browser.newPage();

  // 1. 2048 Cover Game
  console.log('📸 1. Capturing 2048 Cover Game...');
  await page.goto('http://localhost:5173/?demo=1', { waitUntil: 'networkidle0' });
  await delay(1000);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '01_2048_cover.png') });

  // 2. Open Stealth PIN Modal
  console.log('📸 2. Capturing Stealth PIN Modal...');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('vault:open-unlock'));
  });
  await delay(600);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '02_pin_modal_empty.png') });

  // Type PIN dots
  await page.evaluate(() => {
    const input = document.querySelector('input[type="password"], input[type="text"], input[inputmode="numeric"]');
    if (input) {
      input.value = '1234';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await delay(400);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '02_pin_modal_filled.png') });

  // Unlock Vault
  console.log('📸 3. Unlocking into Hidden Inbox...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const demoBtn = btns.find(b => b.textContent && (b.textContent.includes('Demo') || b.textContent.includes('Alex') || b.textContent.includes('Gopika') || b.textContent.includes('Sign In')));
    if (demoBtn) demoBtn.click();
  });
  await delay(1200);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '03_hidden_inbox.png') });

  // 4. Open Direct Chat
  console.log('📸 4. Opening Direct Chat...');
  const chatItem = await page.$('div.cursor-pointer, [data-conversation-id], div[role="listitem"]');
  if (chatItem) {
    await chatItem.click();
    await delay(1000);
  }
  await page.screenshot({ path: path.join(CAPTURE_DIR, '04_direct_chat.png') });

  // 5. Voice Note Waveform / Reaction
  console.log('📸 5. Capturing Voice Note & Chat Interaction...');
  await page.screenshot({ path: path.join(CAPTURE_DIR, '05_voice_notes.png') });

  // 6. View Once Lightbox
  console.log('📸 6. Capturing View Once Media...');
  const viewOnceBadge = await page.$('button[title*="View Once" i], [data-ephemeral="true"], span.tag');
  if (viewOnceBadge) {
    await viewOnceBadge.click();
    await delay(600);
  }
  await page.screenshot({ path: path.join(CAPTURE_DIR, '06_view_once.png') });

  // 7. Open Shared Vault inside DM
  console.log('📸 7. Opening Shared Vault inside DM...');
  // Click back if in lightbox
  await page.evaluate(() => {
    const closeBtn = document.querySelector('button[aria-label*="Close" i], button[title*="Close" i]');
    if (closeBtn) closeBtn.click();
  });
  await delay(500);

  // Click Vault Tab / Shared Vault button
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const vaultTab = buttons.find(b => b.textContent && (b.textContent.includes('Shared Vault') || b.textContent.includes('Vault') || b.textContent.includes('Media')));
    if (vaultTab) vaultTab.click();
  });
  await delay(1000);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '07_shared_vault_tab.png') });

  // 8. Shared Vault Photo Grid
  console.log('📸 8. Capturing Shared Vault Media Grid...');
  await page.screenshot({ path: path.join(CAPTURE_DIR, '08_shared_vault_grid.png') });

  // 9. Private Gallery Tab
  console.log('📸 9. Capturing Private Gallery Tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    const galleryTab = buttons.find(b => b.textContent && b.textContent.includes('Gallery'));
    if (galleryTab) galleryTab.click();
  });
  await delay(1000);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '09_private_gallery.png') });

  // 10. Panic Return to 2048
  console.log('📸 10. Triggering Panic Return...');
  await page.evaluate(() => {
    const panicBubble = document.querySelector('button[aria-label*="Return to 2048" i], button[title*="Return to 2048" i]');
    if (panicBubble) panicBubble.click();
  });
  await delay(800);
  await page.screenshot({ path: path.join(CAPTURE_DIR, '10_panic_return_2048.png') });

  await browser.close();
  console.log('✅ All real app scenes captured successfully in REEL_SOURCE_CAPTURE/');
}

captureAllScenes().catch(err => {
  console.error('Error capturing scenes:', err);
  process.exit(1);
});
