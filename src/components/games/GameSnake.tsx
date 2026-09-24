import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Play, Pause, Award, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../context/GameContext';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Point {
  x: number;
  y: number;
}

const GRID_SIZE = 18;
const INITIAL_SPEED_MS = 130;

const OPPOSITE_DIRECTIONS: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

export const GameSnake: React.FC = () => {
  const { getHighScore, saveHighScore } = useGame();
  const [snake, setSnake] = useState<Point[]>([
    { x: 9, y: 9 },
    { x: 9, y: 10 },
    { x: 9, y: 11 },
  ]);
  const [food, setFood] = useState<Point>({ x: 5, y: 5 });
  const [hasStarted, setHasStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);

  const highScore = getHighScore('snake');

  // FIFO direction buffer queue to prevent self-collision on fast key presses
  const dirQueueRef = useRef<Direction[]>([]);
  const lastMovedDirRef = useRef<Direction>('UP');
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const generateFood = useCallback((currentSnake: Point[]): Point => {
    let newFood: Point;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      if (!currentSnake.some(s => s.x === newFood.x && s.y === newFood.y)) {
        break;
      }
    }
    return newFood;
  }, []);

  const restartGame = useCallback(() => {
    const initialSnake: Point[] = [
      { x: 9, y: 9 },
      { x: 9, y: 10 },
      { x: 9, y: 11 },
    ];
    setSnake(initialSnake);
    setFood(generateFood(initialSnake));
    dirQueueRef.current = [];
    lastMovedDirRef.current = 'UP';
    setHasStarted(false);
    setIsGameOver(false);
    setIsPaused(false);
    setScore(0);
  }, [generateFood]);

  const queueDirection = useCallback((newDir: Direction) => {
    if (!hasStarted) {
      setHasStarted(true);
    }
    if (isGameOver) return;

    const queue = dirQueueRef.current;
    const referenceDir = queue.length > 0 ? queue[queue.length - 1] : lastMovedDirRef.current;

    // Prevent immediate 180° reverse into self
    if (newDir !== referenceDir && newDir !== OPPOSITE_DIRECTIONS[referenceDir]) {
      if (queue.length < 3) {
        queue.push(newDir);
      }
    }
  }, [hasStarted, isGameOver]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (['ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        queueDirection('UP');
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        queueDirection('DOWN');
      } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
        e.preventDefault();
        queueDirection('LEFT');
      } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        queueDirection('RIGHT');
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!hasStarted) setHasStarted(true);
        else setIsPaused(p => !p);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [queueDirection, hasStarted]);

  // Latest game state for the tick loop. The loop reads and writes these refs and then
  // calls the setters with plain values, so nothing with side effects runs inside a
  // state-updater function (StrictMode runs updaters twice in development).
  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const scoreRef = useRef(score);
  useEffect(() => { snakeRef.current = snake; }, [snake]);
  useEffect(() => { foodRef.current = food; }, [food]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  // Main Game Tick Loop
  useEffect(() => {
    if (!hasStarted || isGameOver || isPaused) return;

    const tick = () => {
      // Take at most one queued turn per tick; ignore a turn straight back into the neck.
      let currentDir = lastMovedDirRef.current;
      const next = dirQueueRef.current.shift();
      if (next && next !== OPPOSITE_DIRECTIONS[currentDir]) currentDir = next;
      lastMovedDirRef.current = currentDir;

      const prevSnake = snakeRef.current;
      const head = { ...prevSnake[0] };
      if (currentDir === 'UP') head.y -= 1;
      if (currentDir === 'DOWN') head.y += 1;
      if (currentDir === 'LEFT') head.x -= 1;
      if (currentDir === 'RIGHT') head.x += 1;

      // Wall collision
      if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        setIsGameOver(true);
        return;
      }

      const food = foodRef.current;
      const eats = head.x === food.x && head.y === food.y;

      // Self collision. The tail tip moves away this tick unless the snake is eating.
      const bodyToCheck = eats ? prevSnake : prevSnake.slice(0, -1);
      if (bodyToCheck.some(seg => seg.x === head.x && seg.y === head.y)) {
        setIsGameOver(true);
        return;
      }

      const newSnake = [head, ...prevSnake];
      if (eats) {
        const newScore = scoreRef.current + 10;
        scoreRef.current = newScore;
        setScore(newScore);
        if (newScore > highScore) saveHighScore('snake', newScore);
        const newFood = generateFood(newSnake);
        foodRef.current = newFood;
        setFood(newFood);
      } else {
        newSnake.pop();
      }
      snakeRef.current = newSnake;
      setSnake(newSnake);
    };

    const interval = setInterval(tick, INITIAL_SPEED_MS);
    return () => clearInterval(interval);
  }, [hasStarted, isGameOver, isPaused, highScore, saveHighScore, generateFood]);

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const minSwipeDist = 24;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > minSwipeDist) {
        queueDirection(dx > 0 ? 'RIGHT' : 'LEFT');
      }
    } else {
      if (Math.abs(dy) > minSwipeDist) {
        queueDirection(dy > 0 ? 'DOWN' : 'UP');
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <div className="flex gap-2">
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[76px]">
            <div className="text-[12px] font-semibold text-vault-400 uppercase tracking-wider">SCORE</div>
            <div className="text-base font-bold text-white leading-tight font-mono">{score}</div>
          </div>
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[76px]">
            <div className="text-[12px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1">
              <Award className="w-3.5 h-3.5" /> BEST
            </div>
            <div className="text-base font-bold text-emerald-400 leading-tight font-mono">{Math.max(highScore, score)}</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setIsPaused(p => !p)}
            aria-label={isPaused ? 'Resume game' : 'Pause game'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-200 rounded-xl border border-vault-700 cursor-pointer"
          >
            {isPaused ? <Play className="w-5 h-5 text-emerald-400 fill-current" /> : <Pause className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={restartGame}
            aria-label="Restart game"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-200 rounded-xl border border-vault-700 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Snake Game Grid with Touch Gestures */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full aspect-square bg-vault-950 border-2 border-emerald-500/30 rounded-2xl p-2 shadow-2xl shadow-black/50 overflow-hidden touch-none"
      >
        <div
          className="w-full h-full grid gap-0.5 rounded-xl bg-vault-900/40 p-1"
          style={{
            gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, idx) => {
            const x = idx % GRID_SIZE;
            const y = Math.floor(idx / GRID_SIZE);

            const isHead = snake[0].x === x && snake[0].y === y;
            const isBody = snake.slice(1).some(seg => seg.x === x && seg.y === y);
            const isFood = food.x === x && food.y === y;

            return (
              <div
                key={idx}
                className={`rounded-[2px] transition-colors duration-75 ${
                  isHead
                    ? 'bg-emerald-400 shadow-md shadow-emerald-400/80 scale-105 z-10'
                    : isBody
                    ? 'bg-emerald-600 shadow-sm shadow-emerald-600/50'
                    : isFood
                    ? 'bg-rose-500 rounded-full scale-90 animate-pulse shadow-md shadow-rose-500/80'
                    : 'bg-vault-900/20'
                }`}
              />
            );
          })}
        </div>

        {/* Start Game Overlay */}
        {!hasStarted && !isGameOver && (
          <button
            type="button"
            onClick={() => setHasStarted(true)}
            className="absolute inset-0 bg-vault-950/80 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center z-20 animate-fade-in p-4 text-center cursor-pointer border-0 w-full"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald/20 border border-emerald/50 flex items-center justify-center text-emerald mb-2 shadow-lg">
              <Play className="w-7 h-7 fill-current ml-0.5" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Tap to Start</h3>
            <p className="text-xs text-vault-400 m-0">Swipe or tap D-pad below to steer</p>
          </button>
        )}

        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="absolute inset-0 bg-vault-950/90 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20 animate-fade-in p-4 text-center">
            <h3 className="text-2xl font-bold text-rose-500 mb-1">Game Over</h3>
            <p className="text-xs text-vault-400 mb-4 font-mono">Final Score: {score}</p>
            <button
              type="button"
              onClick={restartGame}
              className="min-h-[44px] min-w-[140px] bg-emerald hover:bg-emerald-400 text-black text-xs font-bold px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald/30 cursor-pointer transition-transform active:scale-95"
            >
              <RotateCcw className="w-4 h-4" /> Play Again
            </button>
          </div>
        )}
      </div>

      {/* Touch D-Pad (Minimum 44x44px touch targets) */}
      <div className="grid grid-cols-3 gap-2 mt-4 w-48">
        <div></div>
        <button
          type="button"
          onClick={() => queueDirection('UP')}
          aria-label="Steer up"
          className="min-h-[44px] min-w-[44px] p-3 bg-vault-800/90 active:bg-emerald active:text-black rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm cursor-pointer"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
        <div></div>
        <button
          type="button"
          onClick={() => queueDirection('LEFT')}
          aria-label="Steer left"
          className="min-h-[44px] min-w-[44px] p-3 bg-vault-800/90 active:bg-emerald active:text-black rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm cursor-pointer"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => queueDirection('DOWN')}
          aria-label="Steer down"
          className="min-h-[44px] min-w-[44px] p-3 bg-vault-800/90 active:bg-emerald active:text-black rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm cursor-pointer"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => queueDirection('RIGHT')}
          aria-label="Steer right"
          className="min-h-[44px] min-w-[44px] p-3 bg-vault-800/90 active:bg-emerald active:text-black rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm cursor-pointer"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
