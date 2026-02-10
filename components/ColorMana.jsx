import React from 'react';
import './ColorMana.css';

// MTG color order: White, Blue, Black, Red, Green (WUBRG)
const COLOR_MAP = {
  W: { name: 'White', gradient: 'linear-gradient(to bottom right, #fef3c7, #fcd34d)' },
  U: { name: 'Blue', gradient: 'linear-gradient(to bottom right, #60a5fa, #2563eb)' },
  B: { name: 'Black', gradient: 'linear-gradient(to bottom right, #374151, #111827)' },
  R: { name: 'Red', gradient: 'linear-gradient(to bottom right, #f87171, #dc2626)' },
  G: { name: 'Green', gradient: 'linear-gradient(to bottom right, #4ade80, #16a34a)' },
  C: { name: 'Colorless', gradient: 'linear-gradient(to bottom right, #d1d5db, #6b7280)' },
};

function ColorMana({ colors, size = 'medium' }) {
  // Sort colors in WUBRG order
  const colorOrder = ['W', 'U', 'B', 'R', 'G', 'C'];
  const sortedColors = colors.sort((a, b) => {
    return colorOrder.indexOf(a) - colorOrder.indexOf(b);
  });

  return (
    <div className={`color-mana ${size}`}>
      {sortedColors.map((color, index) => (
        <div
          key={index}
          className="mana-marble"
          style={{
            background: COLOR_MAP[color].gradient,
          }}
          title={COLOR_MAP[color].name}
        >
          <div className="marble-highlight" />
        </div>
      ))}
    </div>
  );
}

export default ColorMana;
