export type GameKey = 'chess' | 'connect4' | 'reversi' | 'tictactoe';

// where you were in Games: a refresh brings you back to the same game, mode and match instead of
// the arcade -- and the home screen's chess challenge sends you straight to the board
const ROOM_KEY = 'wyrd.gameRoom';
export type GameRoom = { game: GameKey; mode: 'wyrd' | 'pvp'; matchId?: number };
export const loadRoom = (): GameRoom | null => { try { return JSON.parse(sessionStorage.getItem(ROOM_KEY) ?? 'null') as GameRoom | null; } catch { return null; } };
export const saveRoom = (r: GameRoom | null) => { try { if (r) sessionStorage.setItem(ROOM_KEY, JSON.stringify(r)); else sessionStorage.removeItem(ROOM_KEY); } catch { /* fine */ } };
