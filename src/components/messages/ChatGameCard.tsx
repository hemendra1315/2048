import React, { useCallback, useEffect, useState } from 'react';
import { Gamepad2, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';

interface GameRow {
  id: string;
  player_x: string;
  player_o: string;
  board: string;
  turn: string | null;
  status: 'active' | 'finished';
  winner: string | null;
  is_draw: boolean;
}

interface ChatGameCardProps {
  gameId: string;
  myUserId?: string;
  partnerName: string;
  /** Starts a new game in this chat. */
  onRematch: () => void;
}

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

/** Tic-Tac-Toe played inside the chat. Moves are checked on the server; both screens update live. */
export const ChatGameCard: React.FC<ChatGameCardProps> = ({ gameId, myUserId, partnerName, onRematch }) => {
  const [game, setGame] = useState<GameRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error: loadErr } = await supabase.from('chat_games').select('*').eq('id', gameId).maybeSingle();
    if (loadErr) {
      console.warn('[chat-game] could not load game', loadErr);
      setLoadError(true);
    } else if (data) {
      setGame(data as unknown as GameRow);
    } else {
      setMissing(true);
    }
  }, [gameId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(uniqueChannelName(`game:${gameId}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_games', filter: `id=eq.${gameId}` }, payload => {
        setGame(payload.new as unknown as GameRow);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, load]);

  if (loadError) {
    return (
      <div className="text-xs text-vault-400 p-2 flex items-center gap-2">
        Couldn't load game.
        <button onClick={() => void load()} className="text-cyan-400 underline">Retry</button>
      </div>
    );
  }
  if (missing) {
    return <div className="text-xs text-vault-400 p-2">Game not available</div>;
  }
  if (!game) {
    return <div className="w-[216px] h-[260px] rounded-xl bg-vault-900 animate-pulse" aria-label="Loading game" />;
  }

  const myMark = game.player_x === myUserId ? 'X' : game.player_o === myUserId ? 'O' : null;
  const myTurn = game.status === 'active' && game.turn === myUserId;
  const winLine = game.winner ? LINES.find(l => l.every(i => game.board[i] !== '.' && game.board[i] === game.board[l[0]])) : undefined;

  const status =
    game.status === 'finished'
      ? game.is_draw
        ? 'It’s a draw'
        : game.winner === myUserId
        ? 'You won! 🎉'
        : `${partnerName} won`
      : myTurn
      ? `Your turn (${myMark})`
      : `Waiting for ${partnerName}…`;

  const play = async (cell: number) => {
    if (!myTurn || busy || game.board[cell] !== '.') return;
    setBusy(true);
    setError(null);
    // Show the move straight away; the live update confirms it.
    setGame({ ...game, board: game.board.slice(0, cell) + myMark + game.board.slice(cell + 1), turn: null });
    const { error: moveError } = await supabase.rpc('play_chat_game_move', { p_game_id: game.id, p_cell: cell });
    if (moveError) {
      setError(moveError.message);
      await load();
    }
    setBusy(false);
  };

  return (
    <div className="w-[216px] rounded-2xl bg-vault-900 border border-vault-750 p-3 text-white">
      <div className="flex items-center gap-2 text-xs font-bold mb-2">
        <Gamepad2 className="w-4 h-4 text-emerald" aria-hidden /> Tic-Tac-Toe
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="grid" aria-label="Tic-Tac-Toe board">
        {[...game.board].map((cell, i) => {
          const inWin = winLine?.includes(i);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              onClick={() => void play(i)}
              disabled={!myTurn || cell !== '.'}
              className={`w-[60px] h-[60px] rounded-xl text-2xl font-black flex items-center justify-center border transition-colors ${
                inWin ? 'bg-emerald/25 border-emerald' : 'bg-vault-950 border-vault-800'
              } ${myTurn && cell === '.' ? 'hover:border-emerald cursor-pointer' : 'cursor-default'} ${
                cell === 'X' ? 'text-emerald' : 'text-sky-400'
              }`}
              aria-label={`Square ${i + 1}: ${cell === '.' ? 'empty' : cell}`}
            >
              {cell === '.' ? '' : cell}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-vault-300 min-h-[18px]" aria-live="polite">{status}</div>
      {error && <div className="text-xs text-rose-400 mt-1">{error}</div>}
      {game.status === 'finished' && myMark && (
        <button type="button" onClick={onRematch} className="btn btn-s btn-sm w-full mt-2 min-h-[36px]">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Rematch
        </button>
      )}
    </div>
  );
};
