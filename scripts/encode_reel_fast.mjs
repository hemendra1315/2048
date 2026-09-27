import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const CAPTURE_DIR = path.resolve('REEL_SOURCE_CAPTURE');
const OUTPUT_MP4 = path.resolve('GAMES_INSTAGRAM_REEL_24S.mp4');

const scenes = [
  { img: 'SCENE_01_2048_Gameplay.png', dur: 2.0, name: 'clip_01.mp4' },
  { img: 'SCENE_02_Stealth_PIN_Unlock.png', dur: 2.5, name: 'clip_02.mp4' },
  { img: 'SCENE_03_Hidden_Inbox.png', dur: 3.0, name: 'clip_03.mp4' },
  { img: 'SCENE_04_Direct_Messages.png', dur: 3.5, name: 'clip_04.mp4' },
  { img: 'SCENE_05_Voice_Notes.png', dur: 3.5, name: 'clip_05.mp4' },
  { img: 'SCENE_06_View_Once.png', dur: 3.0, name: 'clip_06.mp4' },
  { img: 'SCENE_07_Private_Gallery.png', dur: 3.0, name: 'clip_07.mp4' },
  { img: 'SCENE_08_Panic_Exit_2048.png', dur: 3.5, name: 'clip_08.mp4' },
];

const clips = [];

for (const s of scenes) {
  const inPath = path.join(CAPTURE_DIR, s.img);
  const outPath = path.join(CAPTURE_DIR, s.name);
  clips.push(outPath);

  console.log(`Encoding ${s.name} (${s.dur}s)...`);
  const res = spawnSync('ffmpeg', [
    '-y',
    '-framerate', '60',
    '-loop', '1',
    '-t', String(s.dur),
    '-i', inPath,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-r', '60',
    outPath
  ]);

  if (res.status !== 0) {
    console.error(`Failed ${s.name}:`, res.stderr?.toString());
  }
}

// Concat list
const listTxt = path.join(CAPTURE_DIR, 'concat_list.txt');
fs.writeFileSync(listTxt, clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n'));

console.log('Stitching into final 24s MP4 Reel...');
const concatRes = spawnSync('ffmpeg', [
  '-y',
  '-f', 'concat',
  '-safe', '0',
  '-i', listTxt,
  '-c', 'copy',
  OUTPUT_MP4
]);

if (concatRes.status === 0) {
  const stats = fs.statSync(OUTPUT_MP4);
  console.log(`\n🎉 Final Reel Rendered: ${OUTPUT_MP4} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
} else {
  console.error('Concat error:', concatRes.stderr?.toString());
}
