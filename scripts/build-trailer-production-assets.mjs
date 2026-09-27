import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve('.');
const ASSETS_DIR = path.join(ROOT_DIR, 'trailer-assets');
const SHOTS_DIR = path.join(ASSETS_DIR, 'screenshots');
const VIDEO_DIR = path.join(ASSETS_DIR, 'video');
const VFX_DIR = path.join(ASSETS_DIR, 'vfx');
const FRAMES_TMP = path.join(ROOT_DIR, 'temp_frames');

[ASSETS_DIR, SHOTS_DIR, VIDEO_DIR, VFX_DIR, FRAMES_TMP].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9444;

console.log('🚀 Starting Headless Chrome Asset Engine...');
const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--disable-gpu',
  '--window-size=1080,1920',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
], { stdio: 'ignore' });

await new Promise(r => setTimeout(r, 1500));

const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
const pages = await res.json();
const targetPage = pages.find(p => p.type === 'page') || pages[0];

const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let msgId = 1;
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
  const id = msgId++;
  callbacks.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1080,
  height: 1920,
  deviceScaleFactor: 1,
  mobile: true
});

async function renderHtmlToImage(htmlContent, outputPath) {
  const encoded = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
  await send('Page.navigate', { url: encoded });
  await new Promise(r => setTimeout(r, 150));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
  console.log(`📸 [EXPORTED SCREENSHOT] -> ${path.basename(outputPath)} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
}

async function renderHtmlFramesToMp4(generateFrameHtmlFn, totalDurationSec, fps, outputPath) {
  const totalFrames = Math.floor(totalDurationSec * fps);
  // Clear temp frames dir
  fs.readdirSync(FRAMES_TMP).forEach(f => fs.unlinkSync(path.join(FRAMES_TMP, f)));

  for (let i = 0; i < totalFrames; i++) {
    const t = (i / totalFrames) * totalDurationSec;
    const frameHtml = generateFrameHtmlFn(t, i, totalFrames);
    const encoded = `data:text/html;charset=utf-8,${encodeURIComponent(frameHtml)}`;
    await send('Page.navigate', { url: encoded });
    await new Promise(r => setTimeout(r, 30));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const frameNum = String(i).padStart(4, '0');
    fs.writeFileSync(path.join(FRAMES_TMP, `frame_${frameNum}.png`), Buffer.from(shot.data, 'base64'));
  }

  // Compile with ffmpeg
  const inputPattern = path.join(FRAMES_TMP, 'frame_%04d.png');
  execSync(`ffmpeg -y -r ${fps} -i "${inputPattern}" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast "${outputPath}"`, { stdio: 'pipe' });
  console.log(`🎥 [EXPORTED VIDEO] -> ${path.basename(outputPath)} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB, ${totalDurationSec}s @ ${fps}fps)`);
}

/* =========================================================================
   HTML TEMPLATE GENERATORS (Obsidian #030406 + Teal #0f766e / #2dd4bf)
   ========================================================================= */

const BASE_HEAD = `
<head>
  <meta charset="UTF-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body { background-color: #030406; color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .glass-panel { background: rgba(13, 17, 23, 0.94); backdrop-filter: blur(24px); border: 1px solid rgba(45, 212, 191, 0.25); }
    .neon-teal { color: #2dd4bf; text-shadow: 0 0 20px rgba(45, 212, 191, 0.8); }
    .neon-glow { box-shadow: 0 0 40px rgba(45, 212, 191, 0.35); }
  </style>
</head>
`;

function wrapMobileDevice(content, subtitleText = '', badgeText = '') {
  return `
  <!DOCTYPE html>
  <html>
  ${BASE_HEAD}
  <body class="w-[1080px] h-[1920px] flex flex-col justify-between p-12 bg-[#020305] overflow-hidden select-none">
    
    <!-- Top System Header Bar -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800/80">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0f766e] to-[#2dd4bf] flex items-center justify-center font-black text-black text-xl shadow-[0_0_20px_rgba(45,212,191,0.6)]">G</div>
        <div>
          <span class="text-2xl font-black tracking-wider uppercase text-white">GAMES</span>
          <span class="ml-2 text-xs font-mono px-2 py-0.5 rounded-full bg-[#0f766e]/30 text-[#2dd4bf] border border-[#2dd4bf]/40">com.hemu.games</span>
        </div>
      </div>
      <span class="text-sm font-mono text-[#2dd4bf] font-bold">${badgeText || 'OFFICIAL LAUNCH ASSET'}</span>
    </div>

    <!-- Main Viewport Body -->
    <div class="relative flex-1 w-full my-6 rounded-[48px] bg-[#07090E] border-2 border-gray-800/80 overflow-hidden flex flex-col justify-between shadow-[0_0_80px_rgba(0,0,0,0.95)]">
      ${content}
    </div>

    <!-- Bottom Kinetic Subtitle Card -->
    ${subtitleText ? `
      <div class="p-6 rounded-3xl bg-[#080B10]/95 border-2 border-[#2dd4bf]/60 shadow-[0_10px_40px_rgba(0,0,0,0.9)] flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="w-3 h-3 rounded-full bg-[#2dd4bf] animate-pulse"></span>
          <p class="text-2xl font-black text-white tracking-wide font-sans">${subtitleText}</p>
        </div>
        <span class="text-xs font-mono text-[#2dd4bf] uppercase font-bold">1080x1920 · 60 FPS</span>
      </div>
    ` : '<div class="h-6"></div>'}
  </body>
  </html>
  `;
}

console.log('\n======================================================');
console.log('  GENERATING 20 MASTER SCREENSHOTS (1080x1920 PNG)   ');
console.log('======================================================\n');

// 1. SHOT_01_2048_Board.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between">
    <div class="flex items-center justify-between pb-6 border-b border-gray-800">
      <div>
        <h2 class="text-3xl font-black tracking-tight text-white">2048 Classic</h2>
        <p class="text-base text-gray-400 font-mono">Casual platform • High Score: 1024</p>
      </div>
      <div class="px-5 py-2.5 rounded-2xl bg-[#0f766e]/20 border border-[#2dd4bf]/40 text-[#2dd4bf] font-mono font-bold text-xl">SCORE: 752</div>
    </div>
    <div class="w-[600px] h-[600px] mx-auto p-6 rounded-[36px] bg-[#121620] border-2 border-gray-800 grid grid-cols-4 gap-4 shadow-2xl">
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">2</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">4</div>
      <div class="rounded-2xl bg-[#0f766e] flex items-center justify-center font-black text-3xl text-black shadow-lg">256</div>
      <div class="rounded-2xl bg-[#2dd4bf] flex items-center justify-center font-black text-3xl text-black shadow-xl">1024</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">16</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">32</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">64</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">2</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">4</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">8</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400">2</div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400"></div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400"></div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400"></div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400"></div>
      <div class="rounded-2xl bg-[#1E2534] flex items-center justify-center font-black text-3xl text-gray-400"></div>
    </div>
    <div class="text-center text-sm font-mono text-gray-500">Tap numbered tiles to slide</div>
  </div>
`, 'Just another 2048 game?', '0:00 • 2048 GAME'), path.join(SHOTS_DIR, 'SHOT_01_2048_Board.png'));

// 2. SHOT_02_Header_Glitch.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12 bg-black relative">
    <div class="w-32 h-32 rounded-3xl bg-[#0f766e]/40 border-4 border-[#2dd4bf] flex items-center justify-center shadow-[0_0_80px_rgba(45,212,191,0.9)] animate-pulse">
      <span class="text-6xl">⚡</span>
    </div>
    <h2 class="mt-8 text-7xl font-black tracking-widest text-[#2dd4bf] font-mono drop-shadow-2xl">WRONG.</h2>
    <p class="mt-4 text-xl font-mono text-gray-300">Secret Header Long-Press Detected</p>
  </div>
`, 'WRONG.', '0:01.00 • GLITCH'), path.join(SHOTS_DIR, 'SHOT_02_Header_Glitch.png'));

// 3. SHOT_03_Stealth_PIN_Sheet.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col justify-end p-10">
    <div class="p-10 rounded-[40px] bg-[#0E131C]/95 border-2 border-[#2dd4bf]/60 shadow-2xl flex flex-col gap-6">
      <div class="w-16 h-2 rounded-full bg-gray-600 self-center"></div>
      <div class="flex items-center justify-between">
        <h3 class="text-2xl font-bold text-white">Enter Vault Passcode</h3>
        <span class="text-sm font-mono text-[#2dd4bf] font-bold">🔒 AES-256 GCM</span>
      </div>
      <div class="flex justify-center gap-6 my-4">
        <span class="w-6 h-6 rounded-full bg-[#2dd4bf] shadow-[0_0_20px_rgba(45,212,191,0.9)]"></span>
        <span class="w-6 h-6 rounded-full bg-[#2dd4bf] shadow-[0_0_20px_rgba(45,212,191,0.9)]"></span>
        <span class="w-6 h-6 rounded-full bg-[#2dd4bf] shadow-[0_0_20px_rgba(45,212,191,0.9)]"></span>
        <span class="w-6 h-6 rounded-full bg-[#2dd4bf] shadow-[0_0_20px_rgba(45,212,191,0.9)]"></span>
      </div>
      <p class="text-center text-sm font-mono text-gray-400">Verifying biometric authentication...</p>
    </div>
  </div>
`, 'PRIVATE. FAST. HIDDEN.', '0:01.80 • PIN SHEET'), path.join(SHOTS_DIR, 'SHOT_03_Stealth_PIN_Sheet.png'));

// 4. SHOT_04_LockScreen_Notification.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col justify-between p-12 bg-[#05070B]">
    <div class="text-center mt-12">
      <h1 class="text-7xl font-black font-mono">12:18</h1>
      <p class="text-lg text-gray-400 font-mono mt-2">Sunday, September 27</p>
    </div>
    <div class="p-8 rounded-[36px] bg-[#111622]/95 border-2 border-[#2dd4bf]/60 shadow-2xl flex items-center gap-6">
      <div class="w-16 h-16 rounded-3xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center font-black text-white text-2xl shrink-0 shadow-lg">A</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between">
          <span class="text-xl font-bold text-white">Akshara</span>
          <span class="text-xs font-mono text-gray-400">now</span>
        </div>
        <p class="text-base text-gray-200 mt-1">Reached home ❤️</p>
      </div>
    </div>
    <div class="text-center pb-8">
      <div class="w-16 h-16 rounded-full border-2 border-[#2dd4bf] mx-auto flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(45,212,191,0.8)]">👆</div>
      <p class="text-xs font-mono text-gray-400 mt-3">Touch sensor to decrypt</p>
    </div>
  </div>
`, 'Reached home ❤️', '0:02.50 • NOTIFICATION'), path.join(SHOTS_DIR, 'SHOT_04_LockScreen_Notification.png'));

// 5. SHOT_05_Encrypted_Inbox.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between">
    <div class="flex items-center justify-between pb-6 border-b border-gray-800">
      <span class="text-2xl font-black tracking-wider text-white">ENCRYPTED INBOX</span>
      <span class="px-4 py-1.5 rounded-full bg-[#0f766e]/30 text-[#2dd4bf] font-mono font-bold text-xs">100% PRIVATE</span>
    </div>
    <div class="space-y-4 my-auto">
      <div class="p-6 rounded-3xl bg-[#0E131C] border border-[#2dd4bf]/40 flex items-center gap-5 shadow-xl">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center font-black text-white text-xl">A</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-white">Akshara ✨</span>
            <span class="text-xs font-mono text-[#2dd4bf]">Active Now</span>
          </div>
          <p class="text-sm text-gray-300 truncate mt-1">📸 Saved a new memory to Shared Vault</p>
        </div>
      </div>
      <div class="p-6 rounded-3xl bg-[#090C12] border border-gray-800 flex items-center gap-5">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-black text-white text-xl">R</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-white">Rohit</span>
            <span class="text-xs font-mono text-gray-500">2m ago</span>
          </div>
          <p class="text-sm text-gray-400 truncate mt-1">🎙️ Voice Note (0:18) • 2x ready</p>
        </div>
      </div>
    </div>
    <div class="flex justify-around text-center p-4 rounded-2xl bg-gray-900/80 border border-gray-800 font-mono text-xs text-gray-400">
      <span>PRIVATE</span> • <span>FAST</span> • <span>UNTRACEABLE</span>
    </div>
  </div>
`, 'PRIVATE. FAST. HIDDEN.', '0:04.00 • INBOX'), path.join(SHOTS_DIR, 'SHOT_05_Encrypted_Inbox.png'));

// 6. SHOT_06_Chat_Akshara.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-xl font-bold text-white flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-[#2dd4bf]"></span> Akshara ✨
      </span>
      <span class="text-xs font-mono text-[#2dd4bf]">E2EE VERIFIED</span>
    </div>
    <div class="space-y-4 my-auto">
      <div class="p-5 rounded-3xl bg-[#121824] border border-gray-800 max-w-[80%] ml-auto text-right">
        <p class="text-base text-white">Miss you ❤️</p>
        <span class="text-xs font-mono text-[#2dd4bf] mt-1 block">✓✓ Read</span>
      </div>
      <div class="p-5 rounded-3xl bg-[#0f766e]/30 border border-[#2dd4bf]/40 max-w-[85%] shadow-lg">
        <p class="text-base text-white">Look at this 😂</p>
        <div class="mt-2 h-44 rounded-2xl bg-gradient-to-tr from-[#0f766e]/40 to-black border border-white/10 flex items-center justify-center text-4xl">
          📸 Sunset.heic
        </div>
      </div>
    </div>
    <div class="p-4 rounded-2xl bg-[#111622] border border-gray-800 flex items-center justify-between text-gray-400 text-sm">
      <span>Type encrypted message...</span>
      <span class="text-[#2dd4bf] font-bold">➤</span>
    </div>
  </div>
`, 'Miss you ❤️ · Look at this 😂', '0:05.50 • CHAT'), path.join(SHOTS_DIR, 'SHOT_06_Chat_Akshara.png'));

// 7. SHOT_07_Emoji_Burst.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12 relative">
    <div class="p-8 rounded-[40px] bg-[#0E131C] border-2 border-[#2dd4bf]/60 shadow-2xl relative text-center">
      <span class="text-7xl">🔥 ❤️ ⚡</span>
      <h3 class="text-2xl font-black text-white mt-4">Reaction Confetti Burst</h3>
      <p class="text-sm font-mono text-[#2dd4bf] mt-1">Real-time spring physics</p>
    </div>
  </div>
`, 'Realtime Reactions', '0:07.00 • EMOJI BURST'), path.join(SHOTS_DIR, 'SHOT_07_Emoji_Burst.png'));

// 8. SHOT_08_Voice_Waveform_2x.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12">
    <div class="w-full p-8 rounded-[36px] bg-[#0E131C] border-2 border-[#2dd4bf]/50 shadow-2xl flex items-center gap-6">
      <span class="w-14 h-14 rounded-2xl bg-[#2dd4bf] text-black flex items-center justify-center font-black text-xl">▶</span>
      <div class="flex-1 flex items-center gap-2">
        <span class="w-2 h-6 bg-[#2dd4bf] rounded-full"></span>
        <span class="w-2 h-12 bg-[#2dd4bf] rounded-full"></span>
        <span class="w-2 h-8 bg-[#2dd4bf] rounded-full"></span>
        <span class="w-2 h-16 bg-[#2dd4bf] rounded-full"></span>
        <span class="w-2 h-10 bg-[#2dd4bf] rounded-full"></span>
        <span class="w-2 h-5 bg-gray-600 rounded-full"></span>
      </div>
      <span class="px-4 py-2 rounded-xl bg-[#0f766e]/30 text-[#2dd4bf] font-mono font-bold text-sm">2X SPEED</span>
    </div>
  </div>
`, '2X AUDIO WAVEFORMS', '0:09.50 • VOICE WAVE'), path.join(SHOTS_DIR, 'SHOT_08_Voice_Waveform_2x.png'));

// 9. SHOT_09_Birthday_Surprise_Note.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-xl font-bold text-[#2dd4bf]">CONFIDENTIAL NOTE</span>
      <span class="text-xs font-mono text-gray-400">PINNED</span>
    </div>
    <div class="p-8 rounded-[36px] bg-[#0E131C] border border-[#2dd4bf]/40 my-auto shadow-2xl">
      <span class="text-4xl">🎂</span>
      <h3 class="text-2xl font-black text-white mt-3">Birthday Surprise Plan</h3>
      <p class="text-sm text-gray-300 mt-2 leading-relaxed">Secret rooftop venue booked. Guestlist encrypted in Shared Vault.</p>
    </div>
    <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 text-center text-xs font-mono text-gray-400">Protected in Private Notes</div>
  </div>
`, 'Not everything belongs online.', '0:12.50 • PRIVATE NOTE'), path.join(SHOTS_DIR, 'SHOT_09_Birthday_Surprise_Note.png'));

// 10. SHOT_10_Travel_Tickets_Vault.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-xl font-bold text-[#2dd4bf]">TRAVEL VAULT</span>
      <span class="text-xs font-mono text-gray-400">2 ITEMS</span>
    </div>
    <div class="p-8 rounded-[36px] bg-[#0E131C] border border-gray-800 my-auto shadow-2xl">
      <span class="text-4xl">✈️</span>
      <h3 class="text-2xl font-black text-white mt-3">Ladakh Flight Tickets</h3>
      <p class="text-sm text-gray-400 font-mono mt-1">Flight AI-2048 • Boarding Pass Encrypted</p>
    </div>
    <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 text-center text-xs font-mono text-gray-400">Encrypted Document Storage</div>
  </div>
`, 'Personal Collections', '0:15.00 • TRAVEL VAULT'), path.join(SHOTS_DIR, 'SHOT_10_Travel_Tickets_Vault.png'));

// 11. SHOT_11_Fullscreen_Viewer.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between bg-black">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-xl font-bold text-[#2dd4bf]">FULLSCREEN VIEWER</span>
      <span class="text-xs font-mono text-gray-400">60 FPS</span>
    </div>
    <div class="aspect-square rounded-[36px] bg-gradient-to-tr from-[#0f766e]/50 via-gray-900 to-black border-2 border-[#2dd4bf]/50 flex items-center justify-center shadow-2xl">
      <div class="text-center">
        <span class="text-7xl">🏔️</span>
        <h3 class="text-xl font-bold text-white mt-3">Ladakh Sunset.heic</h3>
        <p class="text-xs font-mono text-gray-400">Zero-Loss Compression</p>
      </div>
    </div>
    <div class="text-center text-xs font-mono text-gray-500">Pinch to zoom • Swipe to navigate</div>
  </div>
`, 'BUILT DIFFERENTLY.', '0:18.00 • FULLSCREEN VIEWER'), path.join(SHOTS_DIR, 'SHOT_11_Fullscreen_Viewer.png'));

// 12. SHOT_12_ViewOnce_Countdown.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between bg-[#07090D]">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-lg font-mono text-purple-400 font-bold">👁️ VIEW ONCE</span>
      <span class="px-4 py-1.5 rounded-full bg-red-500/20 text-red-400 font-mono font-bold text-sm">03s COUNTDOWN</span>
    </div>
    <div class="aspect-square rounded-[36px] bg-gradient-to-tr from-purple-950/90 to-black border-2 border-purple-500/60 flex items-center justify-center shadow-2xl">
      <div class="text-center">
        <span class="text-7xl">🌌</span>
        <h3 class="text-xl font-bold text-white mt-3">Stargazing Memory</h3>
        <p class="text-xs font-mono text-gray-400">Vanishing in 3 seconds</p>
      </div>
    </div>
    <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 text-center text-xs font-mono text-gray-400">Protected by Native Screen Shield</div>
  </div>
`, 'VIEW ONCE: 3... 2... 1...', '0:23.00 • VIEW ONCE'), path.join(SHOTS_DIR, 'SHOT_12_ViewOnce_Countdown.png'));

// 13. SHOT_13_Ephemeral_Embers.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12 bg-[#040608]">
    <div class="w-24 h-24 rounded-3xl bg-red-500/20 border-2 border-red-500 flex items-center justify-center text-5xl text-red-400 shadow-[0_0_60px_rgba(239,68,68,0.9)] animate-pulse">
      🔥
    </div>
    <h3 class="text-2xl font-black text-red-400 uppercase font-mono mt-6">INCINERATED TO ASH</h3>
    <p class="text-sm font-mono text-gray-300 mt-2 text-center">0 residue in database or device storage.</p>
  </div>
`, 'VANISHED.', '0:27.00 • DISINTEGRATION'), path.join(SHOTS_DIR, 'SHOT_13_Ephemeral_Embers.png'));

// 14. SHOT_14_Vault_Billboard.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between bg-[#06080C]">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-2xl font-black tracking-wider text-white">THE SHARED VAULT</span>
      <span class="px-4 py-1.5 rounded-full bg-[#0f766e]/30 text-[#2dd4bf] font-mono font-bold text-xs">MAGAZINE FEED</span>
    </div>
    <div class="p-8 rounded-[36px] bg-gradient-to-r from-[#0f766e]/40 to-[#06080C] border-2 border-[#2dd4bf]/60 my-auto shadow-2xl">
      <span class="text-xs font-mono text-[#2dd4bf] font-bold uppercase">✨ FEATURED SPOTLIGHT</span>
      <h3 class="text-2xl font-black text-white mt-2">Golden Hour in Manali</h3>
      <p class="text-sm text-gray-300 mt-1">⭐ Starred by Rohit & Akshara</p>
    </div>
    <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 text-center text-xs font-mono text-gray-400">Curated memory showcase</div>
  </div>
`, 'Some things are worth keeping.', '0:30.50 • VAULT BILLBOARD'), path.join(SHOTS_DIR, 'SHOT_14_Vault_Billboard.png'));

// 15. SHOT_15_Themed_Albums.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-xl font-bold text-white">CURATED ALBUMS</span>
      <span class="text-xs font-mono text-[#2dd4bf]">3 COLLECTIONS</span>
    </div>
    <div class="space-y-4 my-auto">
      <div class="p-6 rounded-3xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white font-bold text-lg shadow-lg flex items-center justify-between">
        <span>🌅 Sunset Memories</span>
        <span class="text-xs font-mono">14 Photos</span>
      </div>
      <div class="p-6 rounded-3xl bg-gradient-to-tr from-[#0f766e] to-[#2dd4bf] text-black font-black text-lg shadow-xl flex items-center justify-between">
        <span>🌿 Emerald Forest</span>
        <span class="text-xs font-mono">8 Photos</span>
      </div>
      <div class="p-6 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-lg shadow-lg flex items-center justify-between">
        <span>🌌 Midnight Archive</span>
        <span class="text-xs font-mono">22 Files</span>
      </div>
    </div>
    <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 text-center text-xs font-mono text-gray-400">Custom Gradient Themes</div>
  </div>
`, 'CURATED ALBUMS', '0:34.00 • ALBUMS'), path.join(SHOTS_DIR, 'SHOT_15_Themed_Albums.png'));

// 16. SHOT_16_HalfPage_Inspector.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col justify-end p-10 bg-[#06080C]">
    <div class="p-8 rounded-[40px] bg-[#0E131C] border-t-4 border-[#2dd4bf] shadow-2xl flex flex-col gap-4">
      <div class="w-12 h-1.5 rounded-full bg-gray-600 self-center"></div>
      <div class="flex items-center justify-between">
        <h4 class="text-xl font-bold text-white">Sunset Peak.jpg</h4>
        <span class="text-xs font-mono text-[#2dd4bf] font-bold">⭐ Starred by Both</span>
      </div>
      <p class="text-xs text-gray-300 font-mono">Saved by Akshara • Ladakh Getaway Album</p>
      <div class="flex gap-4 mt-2">
        <button class="flex-1 py-3.5 rounded-2xl bg-[#2dd4bf] text-black font-black text-sm">Jump to Message</button>
        <button class="px-6 py-3.5 rounded-2xl bg-gray-800 text-white font-bold text-sm">Full Theater</button>
      </div>
    </div>
  </div>
`, '50% → 100% INSPECTOR', '0:38.50 • INSPECTOR'), path.join(SHOTS_DIR, 'SHOT_16_HalfPage_Inspector.png'));

// 17. SHOT_17_Full_Theater_Expanded.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col p-10 justify-between bg-black">
    <div class="flex items-center justify-between pb-4 border-b border-gray-800">
      <span class="text-xl font-bold text-white">FULL THEATER</span>
      <span class="text-xs font-mono text-[#2dd4bf]">100% EXPANDED</span>
    </div>
    <div class="aspect-square rounded-[36px] bg-[#0E131C] border border-gray-800 flex items-center justify-center text-6xl">
      📸
    </div>
    <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 text-center text-xs font-mono text-gray-400">Deep-linked to Chat History</div>
  </div>
`, 'FLUID GESTURES', '0:41.00 • FULL THEATER'), path.join(SHOTS_DIR, 'SHOT_17_Full_Theater_Expanded.png'));

// 18. SHOT_18_FLAG_SECURE_Shield.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12 bg-[#040609] text-center">
    <div class="w-24 h-24 rounded-3xl bg-red-500/20 border-2 border-red-500 flex items-center justify-center text-5xl text-red-400 shadow-[0_0_60px_rgba(239,68,68,0.9)] mb-6 animate-pulse">
      🛡️
    </div>
    <h3 class="text-2xl font-black text-red-400 uppercase font-mono">SCREENSHOT BLOCKED</h3>
    <p class="text-sm font-mono text-gray-300 mt-2">Android Window FLAG_SECURE Active</p>
    <div class="mt-6 px-5 py-2 rounded-full bg-red-950 border border-red-500/50 text-xs font-mono text-red-300">
      Hardware Capture Inhibited
    </div>
  </div>
`, 'HARDWARE SHIELD ACTIVE', '0:46.50 • FLAG_SECURE'), path.join(SHOTS_DIR, 'SHOT_18_FLAG_SECURE_Shield.png'));

// 19. SHOT_19_Biometric_Security.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12 bg-[#040609] text-center">
    <div class="w-24 h-24 rounded-3xl bg-[#0f766e]/30 border-2 border-[#2dd4bf] flex items-center justify-center text-5xl text-[#2dd4bf] shadow-[0_0_60px_rgba(45,212,191,0.8)] mb-6">
      👆
    </div>
    <h3 class="text-2xl font-black text-[#2dd4bf] uppercase font-mono">PROTECTED.</h3>
    <p class="text-sm text-gray-300 mt-2">Biometrics · PIN Shield · Cloud Passkey</p>
  </div>
`, 'PROTECTED BY MODERN SECURITY.', '0:49.00 • BIOMETRICS'), path.join(SHOTS_DIR, 'SHOT_19_Biometric_Security.png'));

// 20. SHOT_20_3D_Games_Logo.png
await renderHtmlToImage(wrapMobileDevice(`
  <div class="flex-1 flex flex-col items-center justify-center p-12 bg-gradient-to-b from-[#0B0F14] via-[#050608] to-black text-center">
    <div class="w-28 h-28 rounded-3xl bg-gradient-to-tr from-[#0f766e] to-[#2dd4bf] flex items-center justify-center shadow-[0_0_80px_rgba(45,212,191,0.9)] mb-6">
      <svg class="w-16 h-16 text-black font-black" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    </div>
    <h1 class="text-5xl font-black tracking-widest text-white uppercase font-sans">GAMES</h1>
    <p class="text-lg text-[#2dd4bf] font-mono font-bold mt-2">It was never just a game.</p>
    <p class="text-sm text-gray-400 font-sans mt-3">Some things are worth keeping private.</p>
  </div>
`, 'It was never just a game.', '0:58.50 • 3D LOGO'), path.join(SHOTS_DIR, 'SHOT_20_3D_Games_Logo.png'));

console.log('\n======================================================');
console.log('  GENERATING 9 SCREEN RECORDINGS (1080x1920 MP4)     ');
console.log('======================================================\n');

// REC-01: 2048 Glitch (2.5s)
await renderHtmlFramesToMp4((t) => {
  const isGlitch = t > 1.2;
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col p-10 justify-between ${isGlitch ? 'bg-black' : ''}">
      <div class="flex items-center justify-between pb-6 border-b border-gray-800">
        <span class="text-2xl font-bold text-white">2048 Classic</span>
        <span class="text-xl font-mono text-[#2dd4bf]">SCORE: 752</span>
      </div>
      <div class="w-[500px] h-[500px] mx-auto p-4 rounded-3xl bg-[#121620] grid grid-cols-4 gap-3 ${isGlitch ? 'border-4 border-[#2dd4bf] scale-105 animate-pulse' : 'border border-gray-800'}">
        <div class="rounded-xl bg-[#0f766e] flex items-center justify-center font-black text-2xl text-black">256</div>
        <div class="rounded-xl bg-[#2dd4bf] flex items-center justify-center font-black text-2xl text-black">1024</div>
        <div class="rounded-xl bg-[#1E2534] flex items-center justify-center font-bold text-xl text-gray-400">4</div>
        <div class="rounded-xl bg-[#1E2534] flex items-center justify-center font-bold text-xl text-gray-400">8</div>
      </div>
      ${isGlitch ? '<div class="text-center text-4xl font-mono font-black text-[#2dd4bf]">WRONG.</div>' : '<div class="text-center text-gray-500">Slide to merge</div>'}
    </div>
  `, isGlitch ? 'WRONG.' : 'Just another 2048 game?', 'REC-01 • GLITCH');
}, 2.5, 30, path.join(VIDEO_DIR, 'REC_01_2048_Glitch.mp4'));

// REC-02: Notification Unlock (3.5s)
await renderHtmlFramesToMp4((t) => {
  const isUnlocked = t > 1.8;
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col justify-between p-10">
      ${isUnlocked ? `
        <div class="space-y-4 my-auto">
          <div class="p-6 rounded-3xl bg-[#0E131C] border-2 border-[#2dd4bf]/60 shadow-xl">
            <span class="text-lg font-bold text-white">Akshara ✨</span>
            <p class="text-sm text-gray-200 mt-1">Reached home ❤️</p>
          </div>
        </div>
      ` : `
        <div class="p-6 rounded-3xl bg-[#111622] border border-[#2dd4bf]/40 my-auto animate-bounce">
          <span class="text-lg font-bold text-white">Akshara</span>
          <p class="text-sm text-gray-200">Reached home ❤️</p>
        </div>
      `}
      <div class="text-center text-xs font-mono text-gray-400">${isUnlocked ? 'DECRYPTED' : 'Touch to decrypt'}</div>
    </div>
  `, isUnlocked ? 'PRIVATE. FAST. HIDDEN.' : 'Reached home ❤️', 'REC-02 • NOTIFICATION');
}, 3.5, 30, path.join(VIDEO_DIR, 'REC_02_Notification_Unlock.mp4'));

// REC-03: Message Delivery (2.5s)
await renderHtmlFramesToMp4((t) => {
  const isRead = t > 1.2;
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col p-10 justify-between">
      <div class="space-y-4 my-auto">
        <div class="p-6 rounded-3xl bg-[#121824] border border-gray-800 max-w-[80%] ml-auto text-right">
          <p class="text-base text-white">Miss you ❤️</p>
          <span class="text-xs font-mono ${isRead ? 'text-[#2dd4bf]' : 'text-gray-500'} mt-1 block">${isRead ? '✓✓ Read' : '✓ Sent'}</span>
        </div>
      </div>
      <div class="p-4 rounded-2xl bg-[#111622] text-sm text-gray-400">Type a message...</div>
    </div>
  `, 'Instant Delivery & Read Receipts', 'REC-03 • DELIVERY');
}, 2.5, 30, path.join(VIDEO_DIR, 'REC_03_Message_Delivery.mp4'));

// REC-04: Audio Waveform (3.0s)
await renderHtmlFramesToMp4((t) => {
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col items-center justify-center p-10">
      <div class="w-full p-8 rounded-[36px] bg-[#0E131C] border-2 border-[#2dd4bf]/50 flex items-center gap-6 shadow-2xl">
        <span class="w-12 h-12 rounded-2xl bg-[#2dd4bf] text-black flex items-center justify-center font-bold text-lg">▶</span>
        <div class="flex-1 flex items-center gap-2">
          <span class="w-2 h-8 bg-[#2dd4bf] rounded-full animate-pulse"></span>
          <span class="w-2 h-14 bg-[#2dd4bf] rounded-full animate-pulse"></span>
          <span class="w-2 h-10 bg-[#2dd4bf] rounded-full animate-pulse"></span>
          <span class="w-2 h-16 bg-[#2dd4bf] rounded-full animate-pulse"></span>
        </div>
        <span class="px-4 py-2 rounded-xl bg-[#0f766e]/30 text-[#2dd4bf] font-mono font-bold text-sm">2X SPEED</span>
      </div>
    </div>
  `, '2X AUDIO WAVEFORMS', 'REC-04 • WAVEFORM');
}, 3.0, 30, path.join(VIDEO_DIR, 'REC_04_Audio_Waveform.mp4'));

// REC-05: Emoji Reaction (2.0s)
await renderHtmlFramesToMp4((t) => {
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col items-center justify-center p-10">
      <div class="p-8 rounded-[36px] bg-[#0E131C] border-2 border-[#2dd4bf] text-center shadow-2xl">
        <span class="text-6xl">🔥 ❤️ ⚡</span>
        <h3 class="text-xl font-bold text-white mt-3">Reaction Pop</h3>
      </div>
    </div>
  `, 'Floating Emoji Reactions', 'REC-05 • REACTION');
}, 2.0, 30, path.join(VIDEO_DIR, 'REC_05_Emoji_Reaction.mp4'));

// REC-06: ViewOnce Countdown (4.0s)
await renderHtmlFramesToMp4((t) => {
  const count = Math.max(1, Math.ceil(3 - (t * 0.8)));
  const isBurned = t > 3.0;
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col p-10 justify-between ${isBurned ? 'bg-black' : ''}">
      <div class="flex items-center justify-between pb-4 border-b border-gray-800">
        <span class="text-purple-400 font-mono font-bold">VIEW ONCE</span>
        <span class="px-4 py-1.5 rounded-full bg-red-500/20 text-red-400 font-mono font-bold">0${count}s</span>
      </div>
      ${isBurned ? `
        <div class="text-center my-auto">
          <span class="text-6xl">🔥</span>
          <h3 class="text-2xl font-black text-red-400 font-mono mt-4">INCINERATED</h3>
        </div>
      ` : `
        <div class="aspect-square rounded-3xl bg-purple-950/80 border-2 border-purple-500/50 flex items-center justify-center text-6xl shadow-2xl">
          🌌
        </div>
      `}
      <div class="text-center text-xs font-mono text-gray-500">Zero Local Trace</div>
    </div>
  `, isBurned ? 'VANISHED.' : `VIEW ONCE: 0${count}s COUNTDOWN`, 'REC-06 • VIEW ONCE');
}, 4.0, 30, path.join(VIDEO_DIR, 'REC_06_ViewOnce_Countdown.mp4'));

// REC-07: Vault Reveal (3.5s)
await renderHtmlFramesToMp4((t) => {
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col p-10 justify-between bg-[#06080C]">
      <div class="flex items-center justify-between pb-4 border-b border-gray-800">
        <span class="text-2xl font-black text-white">THE SHARED VAULT</span>
        <span class="text-xs font-mono text-[#2dd4bf]">MAGAZINE</span>
      </div>
      <div class="p-8 rounded-[36px] bg-gradient-to-r from-[#0f766e]/40 to-[#06080C] border-2 border-[#2dd4bf]/60 shadow-2xl my-auto">
        <span class="text-xs font-mono text-[#2dd4bf] font-bold uppercase">✨ FEATURED MEMORY</span>
        <h3 class="text-2xl font-black text-white mt-2">Golden Hour in Manali</h3>
        <p class="text-sm text-gray-300">⭐ Starred by Rohit & Akshara</p>
      </div>
      <div class="text-center text-xs font-mono text-gray-500">Curated Magazine Space</div>
    </div>
  `, 'Some things are worth keeping.', 'REC-07 • VAULT');
}, 3.5, 30, path.join(VIDEO_DIR, 'REC_07_Vault_Reveal.mp4'));

// REC-08: Inspector Drawer (3.0s)
await renderHtmlFramesToMp4((t) => {
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col justify-end p-10 bg-[#06080C]">
      <div class="p-8 rounded-[40px] bg-[#0E131C] border-t-4 border-[#2dd4bf] shadow-2xl flex flex-col gap-4">
        <div class="w-12 h-1.5 rounded-full bg-gray-600 self-center"></div>
        <div class="flex items-center justify-between">
          <span class="text-xl font-bold text-white">Sunset Peak.jpg</span>
          <span class="text-xs font-mono text-[#2dd4bf] font-bold">⭐ Starred by Both</span>
        </div>
        <button class="py-3.5 rounded-2xl bg-[#2dd4bf] text-black font-black text-sm">Jump to Message</button>
      </div>
    </div>
  `, '50% → 100% INSPECTOR', 'REC-08 • INSPECTOR');
}, 3.0, 30, path.join(VIDEO_DIR, 'REC_08_Inspector_Drawer.mp4'));

// REC-09: Panic Escape (2.0s)
await renderHtmlFramesToMp4((t) => {
  const isEscape = t > 1.0;
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col p-10 justify-between ${isEscape ? 'bg-[#090C10]' : 'bg-[#0E131C]'}">
      ${isEscape ? `
        <div class="w-[400px] h-[400px] mx-auto p-4 rounded-3xl bg-[#121620] border-2 border-gray-800 grid grid-cols-4 gap-2 my-auto shadow-2xl">
          <div class="rounded-xl bg-[#0f766e] flex items-center justify-center font-bold text-xl text-black">256</div>
          <div class="rounded-xl bg-[#2dd4bf] flex items-center justify-center font-bold text-xl text-black">1024</div>
        </div>
      ` : `
        <div class="p-8 rounded-[36px] bg-red-500/20 border-2 border-red-500 text-center my-auto">
          <span class="text-4xl">⚡</span>
          <h3 class="text-xl font-bold text-red-400 mt-2">Panic Triggered</h3>
        </div>
      `}
      <div class="text-center text-xs font-mono text-gray-500">${isEscape ? '1-Tap Decoy Active' : 'Exiting Vault...'}</div>
    </div>
  `, isEscape ? '1-Tap Decoy Revert Active' : 'PANIC ESCAPE TRIGGERED', 'REC-09 • PANIC');
}, 2.0, 30, path.join(VIDEO_DIR, 'REC_09_Panic_Escape.mp4'));

console.log('\n======================================================');
console.log('  GENERATING 5 VFX ASSETS (1080x1920 MP4)            ');
console.log('======================================================\n');

// VFX-01: Metallic Logo Reveal (3.0s)
await renderHtmlFramesToMp4((t) => {
  return wrapMobileDevice(`
    <div class="flex-1 flex flex-col items-center justify-center p-12 bg-black text-center">
      <div class="w-32 h-32 rounded-3xl bg-gradient-to-tr from-[#0f766e] to-[#2dd4bf] flex items-center justify-center shadow-[0_0_90px_rgba(45,212,191,0.95)] mb-6">
        <svg class="w-18 h-18 text-black font-black" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      </div>
      <h1 class="text-6xl font-black tracking-widest text-white uppercase font-sans">GAMES</h1>
      <p class="text-xl text-[#2dd4bf] font-mono font-bold mt-3">It was never just a game.</p>
    </div>
  `, 'It was never just a game.', 'VFX-01 • METALLIC LOGO');
}, 3.0, 30, path.join(VFX_DIR, 'VFX_01_Metallic_Logo_Reveal.mp4'));

// VFX-02: RGB Glitch Overlay (1.5s)
await renderHtmlFramesToMp4((t) => {
  return `
  <!DOCTYPE html><html><body class="w-[1080px] h-[1920px] bg-black flex items-center justify-center">
    <div class="text-center font-mono font-black text-7xl text-[#2dd4bf] tracking-widest" style="filter: drop-shadow(4px 0px red) drop-shadow(-4px 0px cyan);">
      GLITCH MATRIX
    </div>
  </body></html>
  `;
}, 1.5, 30, path.join(VFX_DIR, 'VFX_02_RGB_Glitch_Overlay.mp4'));

// VFX-03: Countdown Ring (3.0s)
await renderHtmlFramesToMp4((t) => {
  const num = Math.max(1, Math.ceil(3 - t));
  return `
  <!DOCTYPE html><html><body class="w-[1080px] h-[1920px] bg-black flex items-center justify-center text-white">
    <div class="w-64 h-64 rounded-full border-8 border-red-500 flex items-center justify-center text-8xl font-black font-mono shadow-[0_0_80px_rgba(239,68,68,0.9)]">
      0${num}
    </div>
  </body></html>
  `;
}, 3.0, 30, path.join(VFX_DIR, 'VFX_03_Countdown_Ring.mp4'));

// VFX-04: Particle Disintegration (2.0s)
await renderHtmlFramesToMp4((t) => {
  return `
  <!DOCTYPE html><html><body class="w-[1080px] h-[1920px] bg-black flex items-center justify-center text-white">
    <div class="text-center text-red-400 font-mono font-black text-5xl">
      <span class="text-8xl block mb-4">🔥</span>
      DISINTEGRATION EMBER SHADER
    </div>
  </body></html>
  `;
}, 2.0, 30, path.join(VFX_DIR, 'VFX_04_Particle_Disintegration.mp4'));

// VFX-05: Security Shield Animation (2.5s)
await renderHtmlFramesToMp4((t) => {
  return `
  <!DOCTYPE html><html><body class="w-[1080px] h-[1920px] bg-black flex items-center justify-center text-white">
    <div class="w-72 h-72 rounded-[48px] bg-red-500/20 border-4 border-red-500 flex items-center justify-center text-8xl shadow-[0_0_90px_rgba(239,68,68,0.9)]">
      🛡️
    </div>
  </body></html>
  `;
}, 2.5, 30, path.join(VFX_DIR, 'VFX_05_Security_Shield_Animation.mp4'));

// Cleanup
fs.rmSync(FRAMES_TMP, { recursive: true, force: true });
ws.close();
chromeProc.kill();

console.log('\n======================================================');
console.log('  🎉 ALL PRODUCTION ASSETS EXPORTED SUCCESSFULLY!    ');
console.log('======================================================\n');
process.exit(0);
