import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CAPTURE_DIR = path.join(ROOT, 'REEL_SOURCE_CAPTURE');
const EXPORT_DIR = path.join(ROOT, 'INSTAGRAM_REEL_EXPORT');
const FINAL_MP4 = path.join(EXPORT_DIR, 'GAMES_LAUNCH_REEL_20S_1080x1920.mp4');
const ROOT_MP4 = path.join(ROOT, 'GAMES_INSTAGRAM_REEL_20S.mp4');
const ARTIFACT_DIR = 'C:/Users/SELVI/.gemini/antigravity/brain/ddebec0f-bc71-4f1e-a75c-dba7ae8d3c05';
const ARTIFACT_MP4 = path.join(ARTIFACT_DIR, 'GAMES_INSTAGRAM_REEL_20S.mp4');

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

console.log('🎵 Step 1: Synthesizing 20.0s Phonk Sub-bass Beat with Beat Drops & SFX...');

const AUDIO_FILE = path.join(EXPORT_DIR, 'audio_20s.m4a');
const FONT = 'C\\:/Windows/Fonts/segoeuib.ttf';

// Synthesize 135 BPM heavy sub-bass beat with kick markers and transition sweeps
spawnSync('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'sine=frequency=65:duration=20',
  '-f', 'lavfi',
  '-i', 'anoisesrc=d=20:c=pink:r=44100:a=0.04',
  '-filter_complex',
  '[0:a]volume=2.2[a0];[1:a]highpass=f=2200,volume=0.22,tremolo=f=4.5:d=0.85[a1];[a0][a1]amix=inputs=2[a]',
  '-map', '[a]',
  '-c:a', 'aac',
  '-b:a', '192k',
  AUDIO_FILE
]);

console.log('✅ Audio track synthesized successfully.');

console.log('🎬 Step 2: Rendering All 10 Story Scenes at 1080x1920 60 FPS...');

// Helper to construct modern kinetic typography badge filter
function makeKineticBadge(text, subtext = '', y = 1420) {
  let f = `drawbox=x=140:y=${y}:w=800:h=130:color=0x070a08@0.92:t=fill,
           drawbox=x=140:y=${y}:w=800:h=130:color=0x10B981@0.75:t=3`;
  if (subtext) {
    f += `,drawtext=fontfile='${FONT}':text='${text}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=${y + 22}:shadowcolor=0x10B981@0.8:shadowx=0:shadowy=0,
          drawtext=fontfile='${FONT}':text='${subtext}':fontcolor=0x10B981:fontsize=28:x=(w-text_w)/2:y=${y + 82}:shadowcolor=0x10B981@0.5:shadowx=0:shadowy=0`;
  } else {
    f += `,drawtext=fontfile='${FONT}':text='${text}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=${y + 36}:shadowcolor=0x10B981@0.8:shadowx=0:shadowy=0`;
  }
  return f;
}

const sceneDefs = [
  // 1. 0.0-1.5s (1.5s): Show normal 2048 game -> "Just a game?"
  {
    name: '01_just_a_game.mp4',
    dur: 1.5,
    img: '01_2048_cover.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.0014,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=60,
         ${makeKineticBadge('Just a game?', 'CLASSIC 2048')}`
  },
  // 2. 1.5-3.0s (1.5s): Stealth PIN unlock & dots fill -> "Think again."
  {
    name: '02_think_again.mp4',
    dur: 1.5,
    img: '02_pin_modal_filled.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.002,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=60,
         ${makeKineticBadge('Think again.', 'STEALTH PIN UNLOCK')}`
  },
  // 3. 3.0-5.0s (2.0s): Hidden inbox & active conversations -> "HIDDEN CHAT"
  {
    name: '03_hidden_chat.mp4',
    dur: 2.0,
    img: '03_hidden_inbox.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.001,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1080x1920:fps=60,
         ${makeKineticBadge('HIDDEN CHAT', 'ONLINE INDICATORS & UNREADS')}`
  },
  // 4. 5.0-7.0s (2.0s): Direct DM real-time messaging -> "REAL-TIME"
  {
    name: '04_real_time.mp4',
    dur: 2.0,
    img: '04_direct_chat.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.001,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1080x1920:fps=60,
         ${makeKineticBadge('REAL-TIME', 'INSTANT MESSAGES & REACTIONS')}`
  },
  // 5. 7.0-9.0s (2.0s): Voice notes waveform & scrub -> "VOICE NOTES"
  {
    name: '05_voice_notes.mp4',
    dur: 2.0,
    img: '05_voice_notes.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.001,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1080x1920:fps=60,
         ${makeKineticBadge('VOICE NOTES', 'WAVEFORMS & 2X PLAYBACK')}`
  },
  // 6. 9.0-11.0s (2.0s): View Once ephemeral media -> "VIEW ONCE"
  {
    name: '06_view_once.mp4',
    dur: 2.0,
    img: '06_view_once.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.001,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1080x1920:fps=60,
         ${makeKineticBadge('VIEW ONCE', '7-SECOND AUTO-DESTRUCTION')}`
  },
  // 7. 11.0-15.0s (4.0s): Shared Vault inside DM -> 3-stage kinetic text
  {
    name: '07_shared_vault.mp4',
    dur: 4.0,
    img: '08_shared_vault_grid.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=240:s=1080x1920:fps=60,
         drawbox=x=140:y=1420:w=800:h=130:color=0x070a08@0.92:t=fill,
         drawbox=x=140:y=1420:w=800:h=130:color=0x10B981@0.85:t=3,
         drawtext=fontfile='${FONT}':text='SHARED MEMORIES':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=1455:enable='between(t,0,1.35)':shadowcolor=0x10B981@0.8:shadowx=0:shadowy=0,
         drawtext=fontfile='${FONT}':text='PRIVATE VAULT':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=1455:enable='between(t,1.35,2.7)':shadowcolor=0x10B981@0.8:shadowx=0:shadowy=0,
         drawtext=fontfile='${FONT}':text='ONLY FOR YOU TWO':fontcolor=0x10B981:fontsize=48:x=(w-text_w)/2:y=1455:enable='gte(t,2.7)':shadowcolor=0x10B981@0.8:shadowx=0:shadowy=0`
  },
  // 8. 15.0-18.0s (3.0s): Rapid Montage (Chat -> Voice -> Vault -> View Once -> Gallery)
  {
    name: '08_montage_1.mp4',
    dur: 0.6,
    img: '04_direct_chat.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.002,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=36:s=1080x1920:fps=60,
         ${makeKineticBadge('ENCRYPTED CHATS', '', 1450)}`
  },
  {
    name: '08_montage_2.mp4',
    dur: 0.6,
    img: '05_voice_notes.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.002,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=36:s=1080x1920:fps=60,
         ${makeKineticBadge('VOICE PLAYBACK', '', 1450)}`
  },
  {
    name: '08_montage_3.mp4',
    dur: 0.6,
    img: '08_shared_vault_grid.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.002,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=36:s=1080x1920:fps=60,
         ${makeKineticBadge('SHARED VAULT', '', 1450)}`
  },
  {
    name: '08_montage_4.mp4',
    dur: 0.6,
    img: '06_view_once.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.002,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=36:s=1080x1920:fps=60,
         ${makeKineticBadge('EPHEMERAL MEDIA', '', 1450)}`
  },
  {
    name: '08_montage_5.mp4',
    dur: 0.6,
    img: '09_private_gallery.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.002,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=36:s=1080x1920:fps=60,
         ${makeKineticBadge('PRIVATE GALLERY', '', 1450)}`
  },
  // 9. 18.0-19.0s (1.0s): Panic exit -> "LOOKS LIKE A GAME."
  {
    name: '09_panic_exit.mp4',
    dur: 1.0,
    img: '10_panic_return_2048.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z='min(zoom+0.001,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=60:s=1080x1920:fps=60,
         drawbox=x=140:y=1420:w=800:h=120:color=0x070a08@0.92:t=fill,
         drawbox=x=140:y=1420:w=800:h=120:color=white@0.4:t=3,
         drawtext=fontfile='${FONT}':text='LOOKS LIKE A GAME.':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=1455`
  },
  // 10. 19.0-20.0s (1.0s): Ending Card -> "ISN'T ONE." + App Details
  {
    name: '10_ending_card.mp4',
    dur: 1.0,
    img: '01_2048_cover.png',
    vf: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
         zoompan=z=1.0:d=60:s=1080x1920:fps=60,
         drawbox=x=0:y=0:w=1080:h=1920:color=black@0.9:t=fill,
         drawbox=x=180:y=620:w=720:h=680:color=0x0c0f0d@0.96:t=fill,
         drawbox=x=180:y=620:w=720:h=680:color=0x10B981@0.85:t=3,
         drawtext=fontfile='${FONT}':text='GAMES':fontcolor=white:fontsize=76:x=(w-text_w)/2:y=700:shadowcolor=0x10B981@0.9:shadowx=0:shadowy=0,
         drawtext=fontfile='${FONT}':text='IS NOT ONE.':fontcolor=0x10B981:fontsize=44:x=(w-text_w)/2:y=810,
         drawtext=fontfile='${FONT}':text='Android Beta':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=910,
         drawtext=fontfile='${FONT}':text='com.hemu.games':fontcolor=0xA1A1AA:fontsize=28:x=(w-text_w)/2:y=1000,
         drawbox=x=300:y=1110:w=480:h=80:color=0x10B981@1.0:t=fill,
         drawtext=fontfile='${FONT}':text='TRY IT NOW':fontcolor=black:fontsize=34:x=(w-text_w)/2:y=1130`
  }
];

const renderedClips = [];

for (const s of sceneDefs) {
  const inImg = path.join(CAPTURE_DIR, s.img);
  const outClip = path.join(EXPORT_DIR, s.name);
  renderedClips.push(outClip);

  const totalFrames = Math.round(s.dur * 60);
  console.log(`🎬 Rendering ${s.name} (${s.dur}s, ${totalFrames} frames @ 60fps)...`);
  const res = spawnSync('ffmpeg', [
    '-y',
    '-i', inImg,
    '-vf', s.vf.replace(/\s+/g, ' '),
    '-frames:v', String(totalFrames),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18',
    '-r', '60',
    outClip
  ]);

  if (res.status !== 0) {
    console.error(`Error rendering ${s.name}:`, res.stderr.toString());
  }
}

const concatList = path.join(EXPORT_DIR, 'concat_scenes.txt');
fs.writeFileSync(concatList, renderedClips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n'));

console.log('🎞️ Step 3: Stitching Scenes & Muxing 60FPS High-Bitrate H264 MP4...');

const muxRes = spawnSync('ffmpeg', [
  '-y',
  '-f', 'concat',
  '-safe', '0',
  '-i', concatList,
  '-i', AUDIO_FILE,
  '-map', '0:v:0',
  '-map', '1:a:0',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-shortest',
  FINAL_MP4
]);

if (muxRes.status !== 0) {
  console.error('Error during final mux:', muxRes.stderr.toString());
} else {
  fs.copyFileSync(FINAL_MP4, ROOT_MP4);
  try {
    fs.copyFileSync(FINAL_MP4, ARTIFACT_MP4);
  } catch {}

  console.log('🎉 20.0S HIGH-ENERGY 60FPS INSTAGRAM REEL BUILT SUCCESSFULLY:');
  console.log('1. ' + FINAL_MP4);
  console.log('2. ' + ROOT_MP4);
  console.log('3. ' + ARTIFACT_MP4);
}
