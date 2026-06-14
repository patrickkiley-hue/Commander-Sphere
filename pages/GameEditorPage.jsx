// src/pages/GameEditorPage.jsx
// Admin tool for viewing and editing game records in Firestore.
// Place in your pages/ folder and add a route + link in AdministratorPage.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllGames, updateGame, deleteGame } from '../services/gameService';
import { getDisplayName } from '../utils/deckNameUtils';
import ColorMana from '../components/ColorMana';

const WIN_CONDITIONS = ['', 'Combo', 'Commander Damage', 'Mill', 'Poison', 'Alternate Win-Con'];
const BRACKETS = ['', 1, 2, 3, 4, 'cEDH'];

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #132742 100%)',
    color: '#fff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '0 0 40px 0',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    position: 'sticky',
    top: 0,
    background: 'rgba(10,22,40,0.95)',
    backdropFilter: 'blur(8px)',
    zIndex: 10,
  },
  backBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    cursor: 'pointer',
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: 700, margin: 0 },
  container: { maxWidth: 860, margin: '0 auto', padding: '20px 16px' },
  searchBar: {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    marginBottom: 16,
    boxSizing: 'border-box',
  },
  gameCard: (isOpen) => ({
    background: isOpen ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${isOpen ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  }),
  gameHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  gameId: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 700,
    color: '#60a5fa',
    marginRight: 10,
  },
  gameMeta: { fontSize: 13, color: '#94a3b8' },
  winnerBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'rgba(74,222,128,0.15)',
    color: '#4ade80',
    border: '1px solid rgba(74,222,128,0.3)',
    marginLeft: 8,
  },
  chevron: (isOpen) => ({
    fontSize: 12,
    color: '#64748b',
    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s',
  }),
  editorBody: {
    padding: '0 16px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  fieldRow: {
    display: 'flex',
    gap: 12,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
    minWidth: 120,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '7px 10px',
    color: '#fff',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: 'rgba(30,41,59,0.8)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '7px 10px',
    color: '#fff',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
  },
  playerSection: {
    marginTop: 14,
    padding: 12,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  seatBadge: {
    background: 'rgba(59,130,246,0.2)',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: 4,
    padding: '2px 7px',
    fontSize: 11,
    fontWeight: 700,
    color: '#60a5fa',
  },
  playerName: { fontSize: 14, fontWeight: 600 },
  winnerToggle: (isWin) => ({
    marginLeft: 'auto',
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    background: isWin ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)',
    color: isWin ? '#4ade80' : '#64748b',
    border: `1px solid ${isWin ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`,
  }),
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '14px 0',
  },
  saveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  saveBtn: (saving) => ({
    padding: '9px 22px',
    background: saving ? 'rgba(59,130,246,0.4)' : '#3b82f6',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: saving ? 'default' : 'pointer',
  }),
  discardBtn: {
    padding: '9px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '9px 16px',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    color: '#f87171',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  saveMsg: (ok) => ({
    fontSize: 13,
    color: ok ? '#4ade80' : '#f87171',
    fontWeight: 500,
  }),
  emptyState: {
    textAlign: 'center',
    color: '#64748b',
    padding: '40px 0',
    fontSize: 14,
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '14px 0 6px',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function GameEditorPage({ currentPlaygroup }) {
  const navigate = useNavigate();
  const [allGames, setAllGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openGameId, setOpenGameId] = useState(null);

  // Per-game edit state: { [gameId]: { ...editedFields } }
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [saveMsg, setSaveMsg] = useState({});

  const spreadsheetId = currentPlaygroup?.spreadsheetId;

  useEffect(() => {
    if (!spreadsheetId) { setIsLoading(false); return; }
    getAllGames(spreadsheetId)
      .then(games => setAllGames(games))
      .catch(err => console.error('Error loading games:', err))
      .finally(() => setIsLoading(false));
  }, [spreadsheetId]);

  // ── Filtering & grouping ──────────────────────────────────────────────────

  const parseDate = (str) => {
    if (!str) return 0;
    const [m, d, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const filteredGames = allGames
    .filter(g => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        g.gameId?.toLowerCase().includes(q) ||
        g.dateString?.includes(q) ||
        g.players?.some(p =>
          p.player?.toLowerCase().includes(q) ||
          p.commander?.toLowerCase().includes(q)
        )
      );
    })
    .sort((a, b) => parseDate(b.dateString) - parseDate(a.dateString));

  // Group by session prefix (e.g. "001-M")
  const grouped = {};
  filteredGames.forEach(g => {
    const parts = g.gameId?.split('-');
    const prefix = parts?.length === 2 ? `${parts[0]}-${parts[1].charAt(0)}` : 'Unknown';
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(g);
  });

  // ── Edit helpers ──────────────────────────────────────────────────────────

  const getEdit = (gameId) => edits[gameId] || null;

  const initEdit = (game) => {
    if (edits[game.gameId]) return; // already initialized
    setEdits(prev => ({
      ...prev,
      [game.gameId]: {
        dateString: game.dateString || '',
        bracket: game.bracket ?? '',
        players: (game.players || []).map(p => ({ ...p })),
      }
    }));
  };

  const updateField = (gameId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [gameId]: { ...prev[gameId], [field]: value }
    }));
  };

  const updatePlayer = (gameId, playerIndex, field, value) => {
    setEdits(prev => {
      const players = [...prev[gameId].players];
      players[playerIndex] = { ...players[playerIndex], [field]: value };

      // If marking as winner, clear other winners; if unmarking, that's fine
      if (field === 'isWin' && value === true) {
        players.forEach((p, i) => {
          if (i !== playerIndex) {
            players[i] = { ...players[i], isWin: false, result: 'Loss' };
          }
        });
        players[playerIndex] = { ...players[playerIndex], isWin: true, result: 'Win' };
      } else if (field === 'isWin' && value === false) {
        players[playerIndex] = { ...players[playerIndex], isWin: false, result: 'Loss' };
      }

      return { ...prev, [gameId]: { ...prev[gameId], players } };
    });
  };

  const handleToggleOpen = (game) => {
    if (openGameId === game.gameId) {
      setOpenGameId(null);
    } else {
      initEdit(game);
      setOpenGameId(game.gameId);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async (gameId) => {
    const edit = edits[gameId];
    if (!edit) return;

    setSaving(prev => ({ ...prev, [gameId]: true }));
    setSaveMsg(prev => ({ ...prev, [gameId]: null }));

    try {
      const winner = edit.players.find(p => p.isWin);

      const updates = {
        dateString: edit.dateString,
        bracket: edit.bracket === '' ? null : edit.bracket,
        winner: winner?.player || null,
        lastTurn: winner?.lastTurn ?? null,
        winCondition: winner?.winCondition ?? null,
      };

      await updateGame(spreadsheetId, gameId, updates, edit.players);

      // Update local allGames state so the list reflects the save immediately
      setAllGames(prev => prev.map(g => {
        if (g.gameId !== gameId) return g;
        return { ...g, ...updates, players: edit.players };
      }));

      setSaveMsg(prev => ({ ...prev, [gameId]: { ok: true, text: 'Saved' } }));
      setTimeout(() => setSaveMsg(prev => ({ ...prev, [gameId]: null })), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveMsg(prev => ({ ...prev, [gameId]: { ok: false, text: 'Failed: ' + err.message } }));
    }

    setSaving(prev => ({ ...prev, [gameId]: false }));
  };

  const handleDiscardEdits = (gameId) => {
    setEdits(prev => { const next = { ...prev }; delete next[gameId]; return next; });
    setSaveMsg(prev => { const next = { ...prev }; delete next[gameId]; return next; });
    setOpenGameId(null);
  };

  const [confirmDelete, setConfirmDelete] = useState(null); // gameId pending delete

  const handleDeleteGame = async (gameId) => {
    try {
      await deleteGame(spreadsheetId, gameId);
      setAllGames(prev => prev.filter(g => g.gameId !== gameId));
      setOpenGameId(null);
      setConfirmDelete(null);
      setEdits(prev => { const next = { ...prev }; delete next[gameId]; return next; });
    } catch (err) {
      console.error('Delete error:', err);
      setSaveMsg(prev => ({ ...prev, [gameId]: { ok: false, text: 'Delete failed: ' + err.message } }));
      setConfirmDelete(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!spreadsheetId) return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/administrator')}>← Back</button>
        <h1 style={s.title}>Game Editor</h1>
      </div>
      <div style={{ ...s.container, ...s.emptyState }}>No playgroup selected.</div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/administrator')}>← Back</button>
        <h1 style={s.title}>Game Editor</h1>
        <span style={{ fontSize: 13, color: '#64748b', marginLeft: 'auto' }}>
          {allGames.length} games
        </span>
      </div>

      <div style={s.container}>
        <input
          style={s.searchBar}
          placeholder="Search by game ID, date, player, or commander…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {isLoading ? (
          <div style={s.emptyState}>Loading games…</div>
        ) : filteredGames.length === 0 ? (
          <div style={s.emptyState}>No games found.</div>
        ) : (
          Object.entries(grouped).map(([prefix, games]) => (
            <div key={prefix}>
              <div style={s.sessionLabel}>{games[0]?.dateString || prefix}</div>
              {games.map(game => {
                const isOpen = openGameId === game.gameId;
                const edit = getEdit(game.gameId);
                const isSaving = saving[game.gameId];
                const msg = saveMsg[game.gameId];
                const winner = game.players?.find(p => p.isWin);

                return (
                  <div key={game.gameId} style={s.gameCard(isOpen)}>
                    {/* Game header — click to expand */}
                    <div style={s.gameHeader} onClick={() => handleToggleOpen(game)}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={s.gameId}>
                          Game {parseInt(game.gameId?.split('-')[1]?.replace(/[A-Z]/g, '') || '1')}
                        </span>
                        {winner && (
                          <span style={s.winnerBadge}>⭐ {winner.player}</span>
                        )}
                        {!game.winner && (
                          <span style={{ ...s.winnerBadge, background: 'rgba(248,113,113,0.12)', color: '#f87171', borderColor: 'rgba(248,113,113,0.25)' }}>
                            incomplete
                          </span>
                        )}
                        {winner && (
                          <span style={{ ...s.gameMeta, marginLeft: 16 }}>
                            {getDisplayName(winner.commander)}
                          </span>
                        )}
                      </div>
                      <span style={s.chevron(isOpen)}>▼</span>
                    </div>

                    {/* Editor body */}
                    {isOpen && edit && (
                      <div style={s.editorBody}>

                        {/* Game-level fields */}
                        <div style={s.fieldRow}>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Date (MM/DD/YYYY)</label>
                            <input
                              style={s.input}
                              value={edit.dateString}
                              onChange={e => updateField(game.gameId, 'dateString', e.target.value)}
                            />
                          </div>
                          <div style={{ ...s.fieldGroup, maxWidth: 120 }}>
                            <label style={s.label}>Bracket</label>
                            <select
                              style={s.select}
                              value={edit.bracket ?? ''}
                              onChange={e => {
                                const v = e.target.value;
                                updateField(game.gameId, 'bracket', v === '' ? null : (v === 'cEDH' ? 'cEDH' : parseInt(v)));
                              }}
                            >
                              {BRACKETS.map(b => (
                                <option key={b} value={b}>{b === '' ? '—' : b}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={s.divider} />

                        {/* Player entries */}
                        {edit.players.map((p, pi) => (
                          <div key={pi} style={{ ...s.playerSection, marginTop: pi > 0 ? 10 : 14 }}>
                            <div style={s.playerHeader}>
                              <span style={s.seatBadge}>{p.turnOrder || pi + 1}</span>
                              <span style={s.playerName}>{p.player}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                                <ColorMana colors={p.colorId || []} size="small" />
                                <button
                                  style={s.winnerToggle(p.isWin)}
                                  onClick={() => updatePlayer(game.gameId, pi, 'isWin', !p.isWin)}
                                >
                                  {p.isWin ? '⭐ Winner' : 'Mark Winner'}
                                </button>
                              </div>
                            </div>

                            <div style={s.fieldRow}>
                              <div style={s.fieldGroup}>
                                <label style={s.label}>Commander</label>
                                <input
                                  style={s.input}
                                  value={p.commander || ''}
                                  onChange={e => updatePlayer(game.gameId, pi, 'commander', e.target.value)}
                                />
                              </div>
                            </div>

                            {p.isWin && (
                              <div style={s.fieldRow}>
                                <div style={{ ...s.fieldGroup, maxWidth: 100 }}>
                                  <label style={s.label}>Last Turn</label>
                                  <input
                                    style={s.input}
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={p.lastTurn ?? ''}
                                    onChange={e => updatePlayer(game.gameId, pi, 'lastTurn', e.target.value ? parseInt(e.target.value) : null)}
                                  />
                                </div>
                                <div style={s.fieldGroup}>
                                  <label style={s.label}>Win Condition</label>
                                  <select
                                    style={s.select}
                                    value={p.winCondition || ''}
                                    onChange={e => updatePlayer(game.gameId, pi, 'winCondition', e.target.value || null)}
                                  >
                                    {WIN_CONDITIONS.map(wc => (
                                      <option key={wc} value={wc}>{wc || '—'}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Save row */}
                        <div style={s.saveRow}>
                          <button
                            style={s.saveBtn(isSaving)}
                            onClick={() => handleSave(game.gameId)}
                            disabled={isSaving}
                          >
                            {isSaving ? 'Saving…' : 'Save Changes'}
                          </button>
                          <button
                            style={s.discardBtn}
                            onClick={() => handleDiscardEdits(game.gameId)}
                          >
                            Discard
                          </button>
                          {msg && <span style={s.saveMsg(msg.ok)}>{msg.text}</span>}
                          {confirmDelete === game.gameId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                              <span style={{ fontSize: 13, color: '#f87171' }}>Delete this game?</span>
                              <button
                                style={{ ...s.deleteBtn, marginLeft: 0 }}
                                onClick={() => handleDeleteGame(game.gameId)}
                              >
                                Confirm
                              </button>
                              <button
                                style={{ ...s.discardBtn }}
                                onClick={() => setConfirmDelete(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              style={s.deleteBtn}
                              onClick={() => setConfirmDelete(game.gameId)}
                            >
                              Delete Game
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
