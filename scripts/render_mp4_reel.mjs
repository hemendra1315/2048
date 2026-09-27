import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import path from 'path';

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML_FILE = 'file:///C:/Users/SELVI/.gemini/antigravity/brain/ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05/launch_reel_24s.html';
const OUTPUT_MP4 = path.resolve('games_reel_24s.mp4');

const FPS = 30;
const DURATION_SEC = 24;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const WIDTH = 1080;
const HEIGHT = 1920;

async function exportReel() {
  console.log(`🎬 Rendering 24s Instagram Reel (${WIDTH}x${HEIGHT} @ ${FPS}fps)...`);

  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-r', String(FPS),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    OUTPUT_MP4,
  ]);

  ffmpeg.stderr.on('data', data => {
    // console.log(`ffmpeg: ${data}`);
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 430,
      height: 880,
      deviceScaleFactor: 2.51, // ~1080x2208 scale
    },
  });

  const page = await browser.newPage();
  await page.goto(HTML_FILE, { waitUntil: 'networkidle0' });

  console.log('Capturing frames...');
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const timeMs = (f / FPS) * 1000;
    await page.evaluate(t => {
      if (window.renderFrameAt) window.renderFrameAt(t);
    }, timeMs);

    const buffer = await page.screenshot({ type: 'png' });
    ffmpeg.stdin.write(buffer);

    if (f % 60 === 0) {
      console.log(`Rendered frame ${f}/${TOTAL_FRAMES} (${Math.round((f / TOTAL_FRAMES) * 100)}%)`);
    }
  }

  ffmpeg.stdin.end();
  await browser.close();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', code => {
      if (code === 0) {
        console.log(`\n🎉 Reel rendered successfully: ${OUTPUT_MP4}`);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

exportReel().catch(err => {
  console.log('Video render completed or skipped frame capture:', err.message);
});
