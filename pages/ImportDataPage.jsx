// src/pages/ImportDataPage.jsx
// Admin tool for importing Google Sheets CSV export into Firestore
// Place this file in your pages/ folder

import React, { useState, useRef } from 'react';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ─── CSV Parsing Helpers ──────────────────────────────────────────────────────

const parseColorID = (colorString) => {
  if (!colorString || colorString.trim() === '') return ['C'];
  return colorString.split(',').map(c => c.trim()).filter(c => c);
};

const parseDate = (dateString) => {
  if (!dateString) return null;
  const [month, day, year] = dateString.split('/');
  if (!month || !day || !year) return null;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toISOString();
};

const parseLastTurn = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

const parseBracket = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.toLowerCase() === 'cedh') return 'cEDH';
  const num = parseFloat(value);
  if (!isNaN(num) && num >= 1 && num <= 4) return Math.round(num);
  return null;
};

const parseWinCondition = (value) => {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim() || null;
};

// Parse raw CSV text into array of row arrays
const parseCSV = (text) => {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
};

// Group flat rows by gameId and build structured game documents
const buildGameDocuments = (rows) => {
  const gameMap = new Map();

  rows.forEach(row => {
    const gameId = row[1];
    if (!gameId) return;

    const playerEntry = {
      player:       row[2] || '',
      commander:    row[3] || '',
      colorId:      parseColorID(row[4]),
      turnOrder:    parseInt(row[5]) || 0,
      result:       row[6] || '',
      isWin:        row[6] === 'Win',
      lastTurn:     parseLastTurn(row[7]),
      winCondition: parseWinCondition(row[8]),
    };

    if (gameMap.has(gameId)) {
      gameMap.get(gameId).players.push(playerEntry);
    } else {
      gameMap.set(gameId, {
        gameId,
        date:      parseDate(row[0]),
        dateString: row[0] || '',
        bracket:   parseBracket(row[9]),
        players:   [playerEntry],
        // Derived convenience fields
        winner:    null, // filled in below
        lastTurn:  parseLastTurn(row[7]),
      });
    }
  });

  // Post-process each game: resolve winner and canonical lastTurn
  gameMap.forEach(game => {
    const winnerEntry = game.players.find(p => p.isWin);
    game.winner      = winnerEntry?.player || null;
    game.lastTurn    = winnerEntry?.lastTurn ?? game.lastTurn;
    game.winCondition = winnerEntry?.winCondition ?? null;
    // Sort players by turn order
    game.players.sort((a, b) => a.turnOrder - b.turnOrder);
  });

  return Array.from(gameMap.values());
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportDataPage({ currentPlaygroup, currentUser }) {
  const [step, setStep] = useState('upload'); // upload | preview | importing | done | error
  const [csvText, setCsvText] = useState('');
  const [games, setGames] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [skipped, setSkipped] = useState([]);
  const [importMode, setImportMode] = useState('skip'); // skip | overwrite
  const fileInputRef = useRef(null);

  const spreadsheetId = currentPlaygroup?.spreadsheetId;

  // ── File upload handler
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      setErrorMsg('Please upload a .csv file exported from Google Sheets.');
      setStep('error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target.result);
      handleParse(ev.target.result);
    };
    reader.readAsText(file);
  };

  // ── Drag-and-drop
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target.result);
      handleParse(ev.target.result);
    };
    reader.readAsText(file);
  };

  // ── Parse CSV into preview
  const handleParse = (text) => {
    try {
      const rows = parseCSV(text);
      if (rows.length < 2) {
        setErrorMsg('CSV appears to be empty or only contains a header row.');
        setStep('error');
        return;
      }
      // Skip header row
      const dataRows = rows.slice(1).filter(r => r[0] && r[1]);
      const built = buildGameDocuments(dataRows);
      if (built.length === 0) {
        setErrorMsg('No valid game rows found. Make sure the CSV is exported from the Games tab.');
        setStep('error');
        return;
      }
      setGames(built);
      setStep('preview');
    } catch (err) {
      setErrorMsg(`Failed to parse CSV: ${err.message}`);
      setStep('error');
    }
  };

  // ── Write to Firestore
  const handleImport = async () => {
    if (!spreadsheetId) {
      setErrorMsg('No playgroup selected. Please select a playgroup before importing.');
      setStep('error');
      return;
    }

    setStep('importing');
    setProgress({ done: 0, total: games.length });
    const skippedGames = [];

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      try {
        const gameRef = doc(db, 'playgroups', spreadsheetId, 'games', game.gameId);

        if (importMode === 'skip') {
          const existing = await getDoc(gameRef);
          if (existing.exists()) {
            skippedGames.push(game.gameId);
            setProgress({ done: i + 1, total: games.length });
            continue;
          }
        }

        await setDoc(gameRef, {
          ...game,
          importedAt: new Date().toISOString(),
          importedBy: currentUser?.uid || 'unknown',
        });
      } catch (err) {
        console.error(`Error importing game ${game.gameId}:`, err);
        skippedGames.push(`${game.gameId} (error: ${err.message})`);
      }

      setProgress({ done: i + 1, total: games.length });
    }

    setSkipped(skippedGames);
    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setCsvText('');
    setGames([]);
    setProgress({ done: 0, total: 0 });
    setErrorMsg('');
    setSkipped([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Render helpers

  const resultBadge = (result) => {
    const isWin = result === 'Win';
    return (
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.05em',
        padding: '2px 6px',
        borderRadius: 4,
        background: isWin ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.12)',
        color: isWin ? '#4ade80' : '#f87171',
        border: `1px solid ${isWin ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.25)'}`,
      }}>
        {result || '—'}
      </span>
    );
  };

  const COLOR_MAP = { W: '#f9fafb', U: '#60a5fa', B: '#a78bfa', R: '#f87171', G: '#4ade80', C: '#9ca3af' };
  const colorPips = (colors) => colors.map((c, i) => (
    <span key={i} title={c} style={{
      display: 'inline-block',
      width: 10, height: 10,
      borderRadius: '50%',
      background: COLOR_MAP[c] || '#9ca3af',
      marginRight: 2,
      border: '1px solid rgba(255,255,255,0.15)',
    }} />
  ));

  // ─── Styles (matching app's dark navy theme)
  const s = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628 0%, #132742 100%)',
      color: '#fff',
      padding: '32px 20px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    container: { maxWidth: 860, margin: '0 auto' },
    heading: { fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#fff' },
    sub: { fontSize: 13, color: '#94a3b8', marginBottom: 28 },
    card: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: 24,
      marginBottom: 20,
    },
    label: { fontSize: 12, fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
    dropZone: {
      border: '2px dashed rgba(255,255,255,0.15)',
      borderRadius: 10,
      padding: '48px 24px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'border-color 0.2s',
    },
    btn: (variant = 'primary') => ({
      padding: '10px 22px',
      borderRadius: 8,
      border: 'none',
      fontWeight: 600,
      fontSize: 14,
      cursor: 'pointer',
      transition: 'opacity 0.15s',
      background: variant === 'primary' ? '#3b82f6'
               : variant === 'danger'   ? '#dc2626'
               : variant === 'ghost'    ? 'rgba(255,255,255,0.06)'
               : 'rgba(255,255,255,0.06)',
      color: '#fff',
    }),
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
    td: { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', color: '#e2e8f0' },
    progressBar: (pct) => ({
      height: 6,
      borderRadius: 3,
      background: `linear-gradient(90deg, #3b82f6 ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
      transition: 'background 0.3s',
    }),
    pill: { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)', marginRight: 4 },
  };

  // ─── Step: Upload
  if (step === 'upload') return (
    <div style={s.page}>
      <div style={s.container}>
        <button onClick={() => window.history.back()} style={{ ...s.btn('ghost'), marginBottom: 24, fontSize: 13 }}>← Back</button>
        <h1 style={s.heading}>Import Game Data</h1>
        <p style={s.sub}>
          Import your existing Google Sheets data into Firestore.
          Export your sheet as CSV (File → Download → Comma Separated Values) and upload it here.
        </p>

        {!spreadsheetId && (
          <div style={{ ...s.card, borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)', marginBottom: 20 }}>
            <p style={{ color: '#fbbf24', fontSize: 13, margin: 0 }}>
              ⚠ No playgroup selected. Please select a playgroup before importing.
            </p>
          </div>
        )}

        <div style={s.card}>
          <span style={s.label}>Upload CSV File</span>
          <div
            style={s.dropZone}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop your CSV here</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>or click to browse files</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </div>
        </div>

        <div style={s.card}>
          <span style={s.label}>How to export from Google Sheets</span>
          <ol style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
            <li>Open your Commander Tracker spreadsheet</li>
            <li>Make sure you're on the <strong style={{ color: '#e2e8f0' }}>Games</strong> tab</li>
            <li>Go to <strong style={{ color: '#e2e8f0' }}>File → Download → Comma Separated Values (.csv)</strong></li>
            <li>Upload that file here</li>
          </ol>
        </div>
      </div>
    </div>
  );

  // ─── Step: Preview
  if (step === 'preview') {
    const uniquePlayers = [...new Set(games.flatMap(g => g.players.map(p => p.player)))].filter(Boolean);
    const uniqueCommanders = [...new Set(games.flatMap(g => g.players.map(p => p.commander)))].filter(Boolean);

    return (
      <div style={s.page}>
        <div style={s.container}>
          <button onClick={reset} style={{ ...s.btn('ghost'), marginBottom: 24, fontSize: 13 }}>← Start over</button>
          <h1 style={s.heading}>Preview Import</h1>
          <p style={s.sub}>Review what will be written to Firestore before confirming.</p>

          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Games', value: games.length },
              { label: 'Player rows', value: games.reduce((n, g) => n + g.players.length, 0) },
              { label: 'Unique players', value: uniquePlayers.length },
              { label: 'Unique commanders', value: uniqueCommanders.length },
            ].map(({ label, value }) => (
              <div key={label} style={{ ...s.card, textAlign: 'center', padding: 16, marginBottom: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#60a5fa' }}>{value}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Import mode */}
          <div style={s.card}>
            <span style={s.label}>If a game already exists in Firestore</span>
            <div style={{ display: 'flex', gap: 10 }}>
              {['skip', 'overwrite'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setImportMode(mode)}
                  style={{
                    ...s.btn(importMode === mode ? 'primary' : 'ghost'),
                    opacity: 1,
                    border: importMode === mode ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {mode === 'skip' ? '⏭ Skip existing' : '♻ Overwrite existing'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 10, marginBottom: 0 }}>
              {importMode === 'skip'
                ? 'Games already in Firestore will be left unchanged. Safe for re-imports.'
                : 'Existing games will be overwritten with data from this CSV.'}
            </p>
          </div>

          {/* Game preview table */}
          <div style={s.card}>
            <span style={s.label}>Game documents to import</span>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Game ID</th>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Bracket</th>
                    <th style={s.th}>Players</th>
                  </tr>
                </thead>
                <tbody>
                  {games.slice(0, 50).map(game => (
                    <tr key={game.gameId}>
                      <td style={{ ...s.td, fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600 }}>{game.gameId}</td>
                      <td style={s.td}>{game.dateString}</td>
                      <td style={s.td}>{game.bracket ?? '—'}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {game.players.map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#94a3b8', fontSize: 11, minWidth: 14 }}>{p.turnOrder}.</span>
                              <span style={{ fontWeight: 500 }}>{p.player}</span>
                              <span style={{ color: '#64748b', fontSize: 12 }}>{p.commander}</span>
                              <span style={{ display: 'flex', alignItems: 'center' }}>{colorPips(p.colorId)}</span>
                              {resultBadge(p.result)}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {games.length > 50 && (
                <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
                  Showing first 50 of {games.length} games
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleImport} style={s.btn('primary')} disabled={!spreadsheetId}>
              Import {games.length} games →
            </button>
            <button onClick={reset} style={s.btn('ghost')}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Importing
  if (step === 'importing') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div style={s.page}>
        <div style={s.container}>
          <h1 style={s.heading}>Importing…</h1>
          <p style={s.sub}>Writing game documents to Firestore. Do not close this tab.</p>
          <div style={s.card}>
            <div style={{ marginBottom: 12, fontSize: 14 }}>
              {progress.done} of {progress.total} games written
            </div>
            <div style={s.progressBar(pct)} />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>{pct}%</div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Done
  if (step === 'done') {
    const imported = games.length - skipped.filter(s => !s.includes('error')).length;
    return (
      <div style={s.page}>
        <div style={s.container}>
          <h1 style={s.heading}>Import Complete</h1>
          <p style={s.sub}>Your game data is now in Firestore.</p>

          <div style={{ ...s.card, borderColor: 'rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.05)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#4ade80', marginBottom: 4 }}>
              {progress.done} games processed
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              {importMode === 'skip' && skipped.length > 0
                ? `${skipped.length} already existed and were skipped`
                : 'All games written successfully'}
            </div>
          </div>

          {skipped.length > 0 && (
            <div style={s.card}>
              <span style={s.label}>Skipped ({skipped.length})</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {skipped.map((id, i) => <span key={i} style={s.pill}>{id}</span>)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset} style={s.btn('ghost')}>Import another file</button>
            <button onClick={() => window.history.back()} style={s.btn('primary')}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Error
  if (step === 'error') return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.heading}>Import Failed</h1>
        <div style={{ ...s.card, borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.05)' }}>
          <div style={{ color: '#f87171', fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ color: '#fca5a5', fontSize: 13 }}>{errorMsg}</div>
        </div>
        <button onClick={reset} style={s.btn('primary')}>Try again</button>
      </div>
    </div>
  );

  return null;
}
