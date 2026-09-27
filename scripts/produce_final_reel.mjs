import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CAPTURE_DIR = path.resolve('REEL_SOURCE_CAPTURE');
const OUTPUT_MP4 = path.resolve('GAMES_INSTAGRAM_REEL_24S.mp4');

if (!fs.existsSync(CAPTURE_DIR)) {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function produceReel() {
  console.log('🚀 Step 1: Launching Chrome to interactively capture all 8 real scenes from Games...');

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
      deviceScaleFactor: 2.62, // 1080x2397 high DPI mobile
      isMobile: true,
      hasTouch: true,
    },
  });

  const page = await browser.newPage();
  const captureReport = [];

  // Scene 1: 2048 Gameplay
  console.log('Capturing Scene 1: Real 2048 Game...');
  await page.goto('http://localhost:5173/?demo=1', { waitUntil: 'networkidle0' });
  await delay(800);
  const shot1 = path.join(CAPTURE_DIR, 'SCENE_01_2048_Gameplay.png');
  await page.screenshot({ path: shot1 });
  captureReport.push({ scene: 1, title: '2048 Game Board', path: shot1, time: '0s-2s', text: 'Just another 2048 game?' });

  // Scene 2: Stealth PIN Sheet Opening
  console.log('Capturing Scene 2: Stealth PIN Unlock Sheet...');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('vault:open-unlock'));
  });
  await delay(600);
  const shot2 = path.join(CAPTURE_DIR, 'SCENE_02_Stealth_PIN_Unlock.png');
  await page.screenshot({ path: shot2 });
  captureReport.push({ scene: 2, title: 'Stealth PIN Unlock', path: shot2, time: '2s-4.5s', text: 'Look closer.' });

  // Perform Unlock
  console.log('Unlocking vault into private inbox...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const alex = btns.find(b => b.textContent && b.textContent.includes('Alex'));
    if (alex) alex.click();
  });
  await delay(1000);

  // Scene 3: Inbox
  console.log('Capturing Scene 3: Hidden Inbox...');
  const shot3 = path.join(CAPTURE_DIR, 'SCENE_03_Hidden_Inbox.png');
  await page.screenshot({ path: shot3 });
  captureReport.push({ scene: 3, title: 'Hidden Inbox', path: shot3, time: '4.5s-7.5s', text: 'Hidden Inbox' });

  // Scene 4: Direct Messaging Room
  console.log('Capturing Scene 4: Direct Messaging & Chat...');
  const firstChat = await page.$('div.cursor-pointer, [data-conversation-id], div[role="listitem"]');
  if (firstChat) {
    await firstChat.click();
    await delay(800);
  }
  const shot4 = path.join(CAPTURE_DIR, 'SCENE_04_Direct_Messages.png');
  await page.screenshot({ path: shot4 });
  captureReport.push({ scene: 4, title: 'Private Messages', path: shot4, time: '7.5s-11s', text: 'Private Messages' });

  // Scene 5: Voice Notes
  console.log('Capturing Scene 5: Voice Note Waveform Player...');
  const shot5 = path.join(CAPTURE_DIR, 'SCENE_05_Voice_Notes.png');
  await page.screenshot({ path: shot5 });
  captureReport.push({ scene: 5, title: 'Voice Notes Waveform', path: shot5, time: '11s-14.5s', text: 'Voice Notes' });

  // Scene 6: View Once Media Bubble
  console.log('Capturing Scene 6: View Once Media...');
  const shot6 = path.join(CAPTURE_DIR, 'SCENE_06_View_Once.png');
  await page.screenshot({ path: shot6 });
  captureReport.push({ scene: 6, title: 'View Once Media', path: shot6, time: '14.5s-17.5s', text: 'View Once' });

  // Scene 7: Private Gallery
  console.log('Capturing Scene 7: Private Gallery...');
  const backBtn = await page.$('button[aria-label*="Back" i]');
  if (backBtn) await backBtn.click();
  await delay(400);

  const galleryTab = await page.$('nav button:nth-child(2), button[aria-label*="Gallery" i]');
  if (galleryTab) {
    await galleryTab.click();
    await delay(800);
  }
  const shot7 = path.join(CAPTURE_DIR, 'SCENE_07_Private_Gallery.png');
  await page.screenshot({ path: shot7 });
  captureReport.push({ scene: 7, title: 'Private Gallery', path: shot7, time: '17.5s-20.5s', text: 'Private Gallery' });

  // Scene 8: Panic Exit back to 2048
  console.log('Capturing Scene 8: Panic Exit...');
  const lockBtn = await page.$('button[aria-label*="Lock" i]');
  if (lockBtn) {
    await lockBtn.click();
  } else {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vault:panic-lock')));
  }
  await delay(800);
  const shot8 = path.join(CAPTURE_DIR, 'SCENE_08_Panic_Exit_2048.png');
  await page.screenshot({ path: shot8 });
  captureReport.push({ scene: 8, title: 'Panic Exit to 2048', path: shot8, time: '20.5s-24s', text: 'Looks like a game. Isn\'t one.' });

  await browser.close();

  // Save Capture Report
  fs.writeFileSync(
    path.join(CAPTURE_DIR, 'capture_manifest.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), captureReport }, null, 2)
  );

  console.log('\n🎉 Step 2: Assembling 24-second 1080x1920 60fps MP4 Reel using ffmpeg...');

  // Use ffmpeg complex filter to build 8-scene sequence with text overlays, zoom, and transitions
  const filterScript = [
    // Inputs: 8 screenshots
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.06)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Just another 2048 game?':fontcolor=white:fontsize=52:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v0]`,
    `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0012,1.1)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Look closer.':fontcolor=white:fontsize=58:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v1]`,
    `[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0006,1.05)':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Hidden Inbox':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v2]`,
    `[3:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.06)':d=210:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Private Messages':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v3]`,
    `[4:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.001,1.08)':d=210:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Voice Notes':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v4]`,
    `[5:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.06)':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='View Once':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v5]`,
    `[6:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0008,1.06)':d=180:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Private Gallery':fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=280:font='sans-serif'[v6]`,
    `[7:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0004,1.03)':d=210:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,drawtext=text='Looks like a game.\\nIsn\\'t one.':fontcolor=white:fontsize=58:box=1:boxcolor=black@0.7:boxborderw=24:x=(w-text_w)/2:y=280:font='sans-serif'[v7]`,
    // Concatenate all 8 scenes (total 1440 frames @ 60fps = 24.0s)
    `[v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0[outv]`
  ].join(';');

  const ffmpegArgs = [
    '-y',
    '-loop', '1', '-t', '2.0', '-i', shot1,
    '-loop', '1', '-t', '2.5', '-i', shot2,
    '-loop', '1', '-t', '3.0', '-i', shot3,
    '-loop', '1', '-t', '3.5', '-i', shot4,
    '-loop', '1', '-t', '3.5', '-i', shot5,
    '-loop', '1', '-t', '3.0', '-i', shot6,
    '-loop', '1', '-t', '3.0', '-i', shot7,
    '-loop', '1', '-t', '3.5', '-i', shot8,
    '-filter_complex', filterScript,
    '-map', '[outv]',
    '-r', '60',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '19',
    OUTPUT_MP4
  ];

  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ffmpegArgs);
    ff.stderr.on('data', data => {
      // ffmpeg log
    });
    ff.on('close', code => {
      if (code === 0) {
        console.log(`\n🎉 Final 24s Instagram Reel exported successfully: ${OUTPUT_MP4}`);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

produceReel().catch(err => {
  console.error('Reel production error:', err);
});
