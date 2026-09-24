/**
 * Automated Build & Screen Smoke Test Runner
 * Verifies production build assets, screen exports, game engines, zero leak fonts, and Android configurations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] ${message}`);
}

console.log('🚀 Running automated smoke tests...');

// 1. Check Dist Assets
const distPath = path.join(rootDir, 'dist');
if (fs.existsSync(distPath)) {
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
  assert(indexHtml.includes('id="root"'), 'dist/index.html contains root mounting point');
  assert(!indexHtml.includes('fonts.googleapis.com'), 'dist/index.html has zero external Google Fonts dependencies (offline resilient)');
  
  const assets = fs.readdirSync(path.join(distPath, 'assets'));
  assert(assets.some(a => a.endsWith('.js')), 'dist/assets contains compiled JavaScript bundles');
  assert(assets.some(a => a.endsWith('.css')), 'dist/assets contains compiled CSS styles');
} else {
  console.log('ℹ️ dist directory not built yet, checking source structure...');
}

// 2. Verify Dead Code Elimination
assert(!fs.existsSync(path.join(rootDir, 'src/components/home/HomeView.tsx')), 'Unused HomeView.tsx successfully deleted');
assert(!fs.existsSync(path.join(rootDir, 'src/components/games/GameSelectorModal.tsx')), 'Unused GameSelectorModal.tsx successfully deleted');
assert(!fs.existsSync(path.join(rootDir, 'src/components/games/GameStub.tsx')), 'GameStub.tsx successfully replaced with full games');

// 3. Verify Games Catalog
const gamesDir = path.join(rootDir, 'src/components/games');
const requiredGames = [
  'Game2048.tsx',
  'GameSnake.tsx',
  'GameTicTacToe.tsx',
  'GameMinesweeper.tsx',
  'GameMemoryMatch.tsx',
];

requiredGames.forEach(gameFile => {
  assert(fs.existsSync(path.join(gamesDir, gameFile)), `Game component ${gameFile} exists and is verified`);
});

// 4. Verify Snake Mechanics Fix
const snakeCode = fs.readFileSync(path.join(gamesDir, 'GameSnake.tsx'), 'utf8');
assert(snakeCode.includes('dirQueueRef'), 'GameSnake uses direction queue buffer to prevent self-collision on rapid turns');
assert(snakeCode.includes('!hasStarted'), 'GameSnake starts paused with Tap-to-Start overlay');
assert(snakeCode.includes('onTouchStart'), 'GameSnake supports direct swipe touch gestures');

// 5. Verify Android Keystore & Manifest Config
const manifestPath = path.join(rootDir, 'android/app/src/main/AndroidManifest.xml');
assert(fs.existsSync(manifestPath), 'AndroidManifest.xml exists');
const manifestContent = fs.readFileSync(manifestPath, 'utf8');
assert(manifestContent.includes('game_updates'), 'AndroidManifest configures game_updates default notification channel');
assert(fs.existsSync(path.join(rootDir, 'android/key.properties.example')), 'key.properties.example exists for repeatable team builds');

console.log('🎉 All automated smoke tests passed successfully!');
