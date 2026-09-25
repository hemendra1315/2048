import React, { useState, useEffect, useCallback } from 'react';
import { X, Circle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ChatGameRow {
  id: string;
  player_x: string;
  player_o: string;
  board: string;
  turn: string | null;
  status: 'active' | 'finished';
  winner: string | null;
  is_draw: boolean;
}

interface TicTacToeGameProps {
  gameId: string;
  currentUserId?: string;
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({ gameId, currentUserId }) => {
  const [game, setGame] = useState<ChatGameRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGame = useCallback(async () => {
    const { data } = await supabase.from('chat_games').select('*').eq('id', gameId).maybeSingle();
    if (data) setGame(data as unknown as ChatGameRow);
  }, [gameId]);

  useEffect(() => {
    loadGame();
    const channel = supabase
      .channel(`chat_game:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_games', filter: `id=eq.${gameId}` },
        payload => setGame(payload.new as unknown as ChatGameRow)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, loadGame]);

  const handleMove = async (cell: number) => {
    setError(null);
    const { error: err } = await supabase.rpc('play_chat_game_move', { p_game_id: gameId, p_cell: cell });
    if (err) setError(err.message);
    else loadGame();
  };

  if (!game) {
    return <div className="w-48 h-48 flex items-center justify-center text-xs text-zinc-500">Loading game...</div>;
  }

  const isPlayer = currentUserId === game.player_x || currentUserId === game.player_o;
  const myMark = currentUserId === game.player_x ? 'X' : currentUserId === game.player_o ? 'O' : null;
  const isMyTurn = isPlayer && game.status === 'active' && game.turn === currentUserId;

  const statusText = game.status === 'finished'
    ? game.is_draw
      ? "It's a draw"
      : game.winner === currentUserId
        ? 'You won!'
        : game.winner
          ? 'They won'
          : 'Game over'
    : isMyTurn
      ? 'Your turn'
      : isPlayer
        ? "Opponent's turn"
        : 'Spectating';

  return (
    <div className="w-52 p-3 bg-[#0A0A0A] rounded-xl border border-[#262626]">
      <div className="text-center text-xs font-semibold text-zinc-300 mb-2">{statusText}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {game.board.split('').map((cell, i) => (
          <button
            key={i}
            type="button"
            disabled={!isMyTurn || cell !== '.'}
            onClick={() => handleMove(i)}
            className="aspect-square rounded-lg bg-[#171717] border border-[#262626] flex items-center justify-center disabled:cursor-default enabled:hover:border-[#10B981]/60 transition-colors"
          >
            {cell === 'X' && <X className="w-6 h-6 text-[#10B981]" strokeWidth={3} />}
            {cell === 'O' && <Circle className="w-5 h-5 text-amber-400" strokeWidth={3} />}
          </button>
        ))}
      </div>
      {myMark && <div className="text-center text-[10px] text-zinc-500 mt-2">You are {myMark}</div>}
      {error && <div className="text-center text-[10px] text-rose-400 mt-1">{error}</div>}
    </div>
  );
};
