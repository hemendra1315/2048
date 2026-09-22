import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Play, Pause, Award, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../context/GameContext';

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
interface Point {
  x: number;
  y: number;
}

const GRID_SIZE = 18;

export const GameSnake: React.FC = () => {
  const { getHighScore, saveHighScore } = useGame();
  const [snake, setSnake] = useState<Point[]>([
    { x: 9, y: 9 },
    { x: 9, y: 10 },
    { x: 9, y: 11 },
  ]);
  const [food, setFood] = useState<Point>({ x: 5, y: 5 });
  const [dir, setDir] = useState<Direction>('UP');
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);

  const highScore = getHighScore('snake');
  const dirRef = useRef<Direction>(dir);
  dirRef.current = dir;

  const generateFood = (currentSnake: Point[]): Point => {
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
  };

  const restartGame = useCallback(() => {
    const initialSnake: Point[] = [
      { x: 9, y: 9 },
      { x: 9, y: 10 },
      { x: 9, y: 11 },
    ];
    setSnake(initialSnake);
    setFood(generateFood(initialSnake));
    setDir('UP');
    setIsGameOver(false);
    setIsPaused(false);
    setScore(0);
  }, []);

  const changeDirection = useCallback((newDir: Direction) => {
    const current = dirRef.current;
    if (newDir === 'UP' && current !== 'DOWN') setDir('UP');
    if (newDir === 'DOWN' && current !== 'UP') setDir('DOWN');
    if (newDir === 'LEFT' && current !== 'RIGHT') setDir('LEFT');
    if (newDir === 'RIGHT' && current !== 'LEFT') setDir('RIGHT');
  }, []);

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
        changeDirection('UP');
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        changeDirection('DOWN');
      } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
        e.preventDefault();
        changeDirection('LEFT');
      } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        changeDirection('RIGHT');
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeDirection]);

  // Main Game Loop
  useEffect(() => {
    if (isGameOver || isPaused) return;

    const interval = setInterval(() => {
      setSnake(prevSnake => {
        const head = { ...prevSnake[0] };
        const currentDir = dirRef.current;

        if (currentDir === 'UP') head.y -= 1;
        if (currentDir === 'DOWN') head.y += 1;
        if (currentDir === 'LEFT') head.x -= 1;
        if (currentDir === 'RIGHT') head.x += 1;

        // Collision with walls
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
          setIsGameOver(true);
          return prevSnake;
        }

        // Collision with self
        if (prevSnake.some(seg => seg.x === head.x && seg.y === head.y)) {
          setIsGameOver(true);
          return prevSnake;
        }

        const newSnake = [head, ...prevSnake];

        // Eat Food
        if (head.x === food.x && head.y === food.y) {
          const newScore = score + 10;
          setScore(newScore);
          if (newScore > highScore) {
            saveHighScore('snake', newScore);
          }
          setFood(generateFood(newSnake));
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    }, 115);

    return () => clearInterval(interval);
  }, [isGameOver, isPaused, food, score, highScore, saveHighScore]);

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <div className="flex gap-2">
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <div className="text-[10px] font-semibold text-vault-400 uppercase tracking-wider">SCORE</div>
            <div className="text-base font-bold text-white leading-tight">{score}</div>
          </div>
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1">
              <Award className="w-3 h-3" /> BEST
            </div>
            <div className="text-base font-bold text-emerald-400 leading-tight">{Math.max(highScore, score)}</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setIsPaused(p => !p)}
            className="p-2 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-200 rounded-xl border border-vault-700"
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={restartGame}
            className="p-2 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-200 rounded-xl border border-vault-700"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Snake Game Grid */}
      <div className="relative w-full aspect-square bg-vault-950 border-2 border-emerald-500/30 rounded-2xl p-2 shadow-2xl shadow-black/50 overflow-hidden">
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

        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="absolute inset-0 bg-vault-950/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20 animate-fade-in p-4 text-center">
            <h3 className="text-2xl font-bold text-rose-500 mb-1">Snake Terminated</h3>
            <p className="text-xs text-vault-400 mb-4">Final Score: {score}</p>
            <button
              onClick={restartGame}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Play Again
            </button>
          </div>
        )}
      </div>

      {/* Touch D-Pad */}
      <div className="grid grid-cols-3 gap-2 mt-4 w-44">
        <div></div>
        <button
          onClick={() => changeDirection('UP')}
          className="p-3 bg-vault-800/90 active:bg-emerald-600 active:text-white rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
        <div></div>
        <button
          onClick={() => changeDirection('LEFT')}
          className="p-3 bg-vault-800/90 active:bg-emerald-600 active:text-white rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={() => changeDirection('DOWN')}
          className="p-3 bg-vault-800/90 active:bg-emerald-600 active:text-white rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
        <button
          onClick={() => changeDirection('RIGHT')}
          className="p-3 bg-vault-800/90 active:bg-emerald-600 active:text-white rounded-xl flex items-center justify-center border border-vault-700 text-vault-200 transition-colors shadow-sm"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
