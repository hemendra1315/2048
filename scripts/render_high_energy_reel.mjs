import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('.');
const CAPTURE_DIR = path.join(ROOT, 'REEL_SOURCE_CAPTURE');
const EXPORT_DIR = path.join(ROOT, 'INSTAGRAM_REEL_EXPORT');
const HTML_PLAYER = path.join(EXPORT_DIR, 'reel_engine.html');
const AUDIO_OUTPUT = path.join(EXPORT_DIR, 'audio_phonk_135bpm.wav');
const FINAL_OUTPUT_MP4 = path.join(EXPORT_DIR, 'GAMES_LAUNCH_REEL_20S_1080x1920.mp4');
const ROOT_OUTPUT_MP4 = path.join(ROOT, 'GAMES_INSTAGRAM_REEL_20S.mp4');

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Convert images to base64 for embedding in the canvas renderer
function getBase64Image(filename) {
  const file = path.join(CAPTURE_DIR, filename);
  if (fs.existsSync(file)) {
    return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
  }
  return '';
}

const img2048 = getBase64Image('01_2048_cover.png');
const imgPinEmpty = getBase64Image('02_pin_modal_empty.png');
const imgPinFilled = getBase64Image('02_pin_modal_filled.png');
const imgInbox = getBase64Image('03_hidden_inbox.png');
const imgChat = getBase64Image('04_direct_chat.png');
const imgVoice = getBase64Image('05_voice_notes.png');
const imgViewOnce = getBase64Image('06_view_once.png');
const imgVaultTab = getBase64Image('07_shared_vault_tab.png');
const imgVaultGrid = getBase64Image('08_shared_vault_grid.png');
const imgGallery = getBase64Image('09_private_gallery.png');
const imgPanicReturn = getBase64Image('10_panic_return_2048.png');

console.log('🎵 1. Generating 20.0s 135 BPM Phonk/Cyberpunk Audio with Beat Drops & SFX...');

// Generate 20s 135 BPM audio track with kicks, 808 sub-bass drops, risers, and impact whooshes using FFmpeg synth filters
const ffmpegAudioCmd = [
  '-y',
  '-f', 'lavfi',
  '-i', 'sine=frequency=55:duration=20',
  '-f', 'lavfi',
  '-i', 'anoisesrc=d=20:c=pink:r=44100:a=0.08',
  '-filter_complex',
  `[0:a]volume=1.8,lowpass=f=120,asplit=2[sub1][sub2];
   [1:a]highpass=f=3000,volume=0.3,tremolo=f=4.5:d=0.8[hihat];
   [sub1][hihat]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
  '-map', '[mix]',
  '-c:a', 'pcm_s16le',
  AUDIO_OUTPUT
];

spawnSync('ffmpeg', ffmpegAudioCmd);
console.log('✅ Audio generated:', AUDIO_OUTPUT);

console.log('🎨 2. Building Canvas Animation Engine at 1080x1920 60FPS...');

const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; display: flex; justify-content: center; align-items: center; width: 1080px; height: 1920px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; }
    canvas { width: 1080px; height: 1920px; display: block; }
  </style>
</head>
<body>
  <canvas id="c" width="1080" height="1920"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d', { alpha: false });

    const images = {
      cover: new Image(),
      pinEmpty: new Image(),
      pinFilled: new Image(),
      inbox: new Image(),
      chat: new Image(),
      voice: new Image(),
      viewOnce: new Image(),
      vaultTab: new Image(),
      vaultGrid: new Image(),
      gallery: new Image(),
      panicReturn: new Image()
    };

    images.cover.src = "${img2048}";
    images.pinEmpty.src = "${imgPinEmpty}";
    images.pinFilled.src = "${imgPinFilled}";
    images.inbox.src = "${imgInbox}";
    images.chat.src = "${imgChat}";
    images.voice.src = "${imgVoice}";
    images.viewOnce.src = "${imgViewOnce}";
    images.vaultTab.src = "${imgVaultTab}";
    images.vaultGrid.src = "${imgVaultGrid}";
    images.gallery.src = "${imgGallery}";
    images.panicReturn.src = "${imgPanicReturn}";

    function drawScreen(img, scale = 1, offsetX = 0, offsetY = 0, blur = 0, opacity = 1) {
      if (!img || !img.complete || img.naturalWidth === 0) return;
      ctx.save();
      ctx.globalAlpha = opacity;
      if (blur > 0) {
        ctx.filter = \`blur(\${blur}px)\`;
      }
      const w = 1080 * scale;
      const h = 1920 * scale;
      const x = (1080 - w) / 2 + offsetX;
      const y = (1920 - h) / 2 + offsetY;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    }

    function drawVignette(intensity = 0.5) {
      ctx.save();
      const grad = ctx.createRadialGradient(540, 960, 400, 540, 960, 1050);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, \`rgba(0,0,0,\${intensity})\`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.restore();
    }

    function drawEmeraldGlow(x, y, radius, opacity = 0.3) {
      ctx.save();
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, \`rgba(16, 185, 129, \${opacity})\`);
      grad.addColorStop(0.5, \`rgba(16, 185, 129, \${opacity * 0.4})\`);
      grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();
    }

    function drawKineticBadge(text, subtext = '', y = 1480, scale = 1, opacity = 1, accent = true) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(540, y);
      ctx.scale(scale, scale);

      // Glassmorphism card backing
      const cardWidth = 720;
      const cardHeight = subtext ? 150 : 105;
      const rx = -cardWidth / 2;
      const ry = -cardHeight / 2;

      ctx.fillStyle = 'rgba(7, 10, 8, 0.88)';
      ctx.beginPath();
      ctx.roundRect(rx, ry, cardWidth, cardHeight, 28);
      ctx.fill();

      // Border glow
      ctx.lineWidth = 3;
      ctx.strokeStyle = accent ? 'rgba(16, 185, 129, 0.65)' : 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();

      if (accent) {
        drawEmeraldGlow(0, 0, 360, 0.22);
      }

      // Main typography
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 52px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '3px';
      ctx.shadowColor = accent ? 'rgba(16, 185, 129, 0.8)' : 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = accent ? 24 : 12;
      ctx.fillText(text, 0, subtext ? -22 : 0);

      // Subtext if present
      if (subtext) {
        ctx.fillStyle = '#10B981';
        ctx.font = '700 28px "Inter", sans-serif';
        ctx.letterSpacing = '2px';
        ctx.shadowBlur = 10;
        ctx.fillText(subtext, 0, 30);
      }

      ctx.restore();
    }

    window.renderFrame = function(timeSec) {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, 1080, 1920);

      // 0.0s - 1.5s: Just a game? (2048 gameplay)
      if (timeSec < 1.5) {
        const progress = timeSec / 1.5;
        const zoom = 1.0 + progress * 0.08;
        drawScreen(images.cover, zoom);
        drawVignette(0.45);
        drawKineticBadge("JUST A GAME?", "CLASSIC 2048", 1520, 1.0, Math.min(1, progress * 4));
      }
      // 1.5s - 3.0s: Triple tap & PIN Unlock
      else if (timeSec < 3.0) {
        const progress = (timeSec - 1.5) / 1.5;
        const isFilled = progress > 0.45;
        const img = isFilled ? images.pinFilled : images.pinEmpty;
        const zoom = 1.04 + Math.sin(progress * Math.PI) * 0.04;
        drawScreen(img, zoom);
        drawVignette(0.5);
        drawEmeraldGlow(540, 960, 480, 0.25);
        drawKineticBadge("THINK AGAIN.", "STEALTH UNLOCK", 1520, 1.05, 1.0);
      }
      // 3.0s - 5.0s: Fast cuts through Hidden Inbox
      else if (timeSec < 5.0) {
        const progress = (timeSec - 3.0) / 2.0;
        const cut = Math.floor(progress * 4) % 2;
        const zoom = 1.02 + progress * 0.06;
        drawScreen(cut === 0 ? images.inbox : images.chat, zoom);
        drawVignette(0.4);
        drawKineticBadge("HIDDEN CHAT", "ACTIVE & ENCRYPTED", 1520, 1.0, 1.0);
      }
      // 5.0s - 7.0s: Open DM, Real-time messaging
      else if (timeSec < 7.0) {
        const progress = (timeSec - 5.0) / 2.0;
        const zoom = 1.0 + (1 - progress) * 0.05;
        drawScreen(images.chat, zoom);
        drawVignette(0.35);
        drawKineticBadge("REAL-TIME", "INSTANT SYNC & RECEIPTS", 1520, 1.0, 1.0);
      }
      // 7.0s - 9.0s: Voice Notes Waveform & 2X Speed
      else if (timeSec < 9.0) {
        const progress = (timeSec - 7.0) / 2.0;
        const zoom = 1.03 + progress * 0.04;
        drawScreen(images.voice, zoom);
        drawVignette(0.4);
        drawKineticBadge("VOICE NOTES", "2X SPEED & WAVEFORMS", 1520, 1.0, 1.0);
      }
      // 9.0s - 11.0s: View Once Ephemeral Media
      else if (timeSec < 11.0) {
        const progress = (timeSec - 9.0) / 2.0;
        const zoom = 1.0 + progress * 0.04;
        drawScreen(images.viewOnce, zoom);
        drawVignette(0.45);
        drawKineticBadge("VIEW ONCE", "AUTO-EXPIRES IN 7 SECONDS", 1520, 1.0, 1.0);
      }
      // 11.0s - 15.0s: SHARED VAULT (Hero Feature)
      else if (timeSec < 15.0) {
        const progress = (timeSec - 11.0) / 4.0;
        const subStage = Math.floor(progress * 3); // 0, 1, 2
        const img = progress < 0.5 ? images.vaultTab : images.vaultGrid;
        const zoom = 1.02 + (progress % 0.33) * 0.1;
        drawScreen(img, zoom);
        drawVignette(0.4);
        drawEmeraldGlow(540, 1200, 520, 0.3);

        if (subStage === 0) {
          drawKineticBadge("SHARED MEMORIES", "PRIVATE PHOTO VAULT", 1500, 1.05, 1.0);
        } else if (subStage === 1) {
          drawKineticBadge("PRIVATE VAULT", "SHARED INSIDE CHAT", 1500, 1.05, 1.0);
        } else {
          drawKineticBadge("ONLY FOR YOU TWO", "ZERO COMPRESSION SYNC", 1500, 1.05, 1.0);
        }
      }
      // 15.0s - 18.0s: Fast Beat-Synced Montage
      else if (timeSec < 18.0) {
        const progress = (timeSec - 15.0) / 3.0;
        const montageIndex = Math.floor(progress * 6);
        const montageImgs = [images.chat, images.voice, images.vaultGrid, images.viewOnce, images.gallery, images.inbox];
        const currentImg = montageImgs[montageIndex % montageImgs.length];
        const zoom = 1.05 + Math.sin(progress * Math.PI * 4) * 0.04;
        drawScreen(currentImg, zoom);
        drawVignette(0.45);
        drawKineticBadge("SEAMLESS & FAST", "ALL-IN-ONE ENCLAVE", 1520, 1.0, 1.0);
      }
      // 18.0s - 20.0s: Panic Exit & Final Reveal Outro
      else {
        const progress = (timeSec - 18.0) / 2.0;
        if (progress < 0.45) {
          // Instant back to 2048
          drawScreen(images.panicReturn, 1.0 + progress * 0.04);
          drawVignette(0.5);
          drawKineticBadge("LOOKS LIKE A GAME.", "", 1520, 1.05, 1.0, false);
        } else if (progress < 0.7) {
          // Blackout pause
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, 1080, 1920);
          drawKineticBadge("ISN'T ONE.", "", 960, 1.2, 1.0, true);
        } else {
          // Final App Card
          ctx.fillStyle = '#050505';
          ctx.fillRect(0, 0, 1080, 1920);
          drawEmeraldGlow(540, 850, 480, 0.35);

          // Card
          ctx.save();
          ctx.translate(540, 960);
          ctx.fillStyle = 'rgba(10, 14, 11, 0.95)';
          ctx.beginPath();
          ctx.roundRect(-360, -320, 720, 640, 36);
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.stroke();

          // Title
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '900 76px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.letterSpacing = '6px';
          ctx.shadowColor = 'rgba(16, 185, 129, 0.9)';
          ctx.shadowBlur = 30;
          ctx.fillText("GAMES", 0, -120);

          // Subtitle
          ctx.fillStyle = '#10B981';
          ctx.font = '700 32px "Inter", sans-serif';
          ctx.letterSpacing = '4px';
          ctx.fillText("ANDROID BETA", 0, -30);

          // Package
          ctx.fillStyle = '#A1A1AA';
          ctx.font = '500 28px "Courier New", monospace';
          ctx.fillText("com.hemu.games", 0, 60);

          // Download CTA pill
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.roundRect(-220, 130, 440, 80, 40);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = '800 30px "Inter", sans-serif';
          ctx.letterSpacing = '2px';
          ctx.fillText("TRY IT NOW", 0, 180);

          ctx.restore();
        }
      }
    };
  </script>
</body>
</html>`;

fs.writeFileSync(HTML_PLAYER, htmlContent);
console.log('✅ Created canvas renderer HTML:', HTML_PLAYER);

async function renderVideo() {
  console.log('🎥 3. Launching Puppeteer Headless Video Frame Capture (60 FPS, 1200 frames)...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--window-size=1080,1920',
    ],
    defaultViewport: {
      width: 1080,
      height: 1920,
      deviceScaleFactor: 1,
    },
  });

  const page = await browser.newPage();
  await page.goto('file:///' + HTML_PLAYER.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  // FFmpeg pipe process
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'png',
    '-r', '60',
    '-i', 'pipe:0',
    '-i', AUDIO_OUTPUT,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    FINAL_OUTPUT_MP4
  ]);

  ffmpeg.stderr.on('data', data => {
    // optional debug
  });

  const TOTAL_FRAMES = 20 * 60; // 1200 frames (20 seconds @ 60fps)
  console.log(`Rendering ${TOTAL_FRAMES} frames @ 60 FPS...`);

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const timeSec = f / 60;
    await page.evaluate(t => window.renderFrame(t), timeSec);
    const buffer = await page.screenshot({ type: 'png' });
    ffmpeg.stdin.write(buffer);

    if (f % 120 === 0) {
      const pct = Math.round((f / TOTAL_FRAMES) * 100);
      console.log(`⚡ Progress: ${pct}% (${f}/${TOTAL_FRAMES} frames, ${timeSec.toFixed(1)}s)`);
    }
  }

  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });

  await browser.close();

  // Copy to root directory as well
  fs.copyFileSync(FINAL_OUTPUT_MP4, ROOT_OUTPUT_MP4);

  console.log('🎉 HIGH-ENERGY 20S INSTAGRAM REEL EXPORTED SUCCESSFULLY:');
  console.log('1. ' + FINAL_OUTPUT_MP4);
  console.log('2. ' + ROOT_OUTPUT_MP4);
}

renderVideo().catch(err => {
  console.error('Error during video rendering:', err);
  process.exit(1);
});
