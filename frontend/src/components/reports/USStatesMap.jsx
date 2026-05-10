import { useState } from 'react';

// Tile-cartogram layout: each state is a 40px square positioned on a grid.
// [row, col, abbr, name]
const STATES_LAYOUT = [
  [0, 10, 'ME', 'Maine'],
  [1, 9, 'VT', 'Vermont'],
  [1, 10, 'NH', 'New Hampshire'],
  [2, 1, 'WA', 'Washington'],
  [2, 2, 'MT', 'Montana'],
  [2, 3, 'ND', 'North Dakota'],
  [2, 4, 'MN', 'Minnesota'],
  [2, 6, 'WI', 'Wisconsin'],
  [2, 7, 'MI', 'Michigan'],
  [2, 9, 'NY', 'New York'],
  [2, 10, 'MA', 'Massachusetts'],
  [3, 1, 'OR', 'Oregon'],
  [3, 2, 'ID', 'Idaho'],
  [3, 3, 'WY', 'Wyoming'],
  [3, 4, 'SD', 'South Dakota'],
  [3, 5, 'IA', 'Iowa'],
  [3, 6, 'IL', 'Illinois'],
  [3, 7, 'IN', 'Indiana'],
  [3, 8, 'OH', 'Ohio'],
  [3, 9, 'PA', 'Pennsylvania'],
  [3, 10, 'NJ', 'New Jersey'],
  [3, 11, 'CT', 'Connecticut'],
  [4, 1, 'CA', 'California'],
  [4, 2, 'NV', 'Nevada'],
  [4, 3, 'UT', 'Utah'],
  [4, 4, 'CO', 'Colorado'],
  [4, 5, 'NE', 'Nebraska'],
  [4, 6, 'MO', 'Missouri'],
  [4, 7, 'KY', 'Kentucky'],
  [4, 8, 'WV', 'West Virginia'],
  [4, 9, 'VA', 'Virginia'],
  [4, 10, 'MD', 'Maryland'],
  [4, 11, 'DE', 'Delaware'],
  [5, 2, 'AZ', 'Arizona'],
  [5, 3, 'NM', 'New Mexico'],
  [5, 4, 'KS', 'Kansas'],
  [5, 5, 'AR', 'Arkansas'],
  [5, 6, 'TN', 'Tennessee'],
  [5, 7, 'NC', 'North Carolina'],
  [5, 8, 'SC', 'South Carolina'],
  [5, 11, 'RI', 'Rhode Island'],
  [6, 4, 'OK', 'Oklahoma'],
  [6, 5, 'LA', 'Louisiana'],
  [6, 6, 'MS', 'Mississippi'],
  [6, 7, 'AL', 'Alabama'],
  [6, 8, 'GA', 'Georgia'],
  [7, 4, 'TX', 'Texas'],
  [7, 8, 'FL', 'Florida'],
  [7, 0, 'AK', 'Alaska'],
  [7, 1, 'HI', 'Hawaii'],
];

export const ALL_STATE_ABBRS = STATES_LAYOUT.map(s => s[2]);
export const STATE_NAMES = STATES_LAYOUT.reduce((acc, [, , abbr, name]) => {
  acc[abbr] = name;
  return acc;
}, {});

function getStateBucket(count) {
  if (count >= 50) return { bg: '#15803d', text: '#fff', label: '50+' };
  if (count >= 20) return { bg: '#3b82f6', text: '#fff', label: '20-49' };
  if (count >= 1) return { bg: '#fb923c', text: '#fff', label: '1-19' };
  return { bg: '#ffffff', text: '#374151', label: '0' };
}

export default function USStatesMap({ ordersByState = {}, onStateClick }) {
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  return (
    <div className="relative">
      <div
        className="grid gap-1 mx-auto"
        style={{
          gridTemplateColumns: 'repeat(12, 36px)',
          gridTemplateRows: 'repeat(8, 36px)',
          width: 'fit-content',
        }}
      >
        {STATES_LAYOUT.map(([row, col, abbr, name]) => {
          const count = ordersByState[abbr] || 0;
          const bucket = getStateBucket(count);
          const isHovered = hovered?.abbr === abbr;
          return (
            <div
              key={abbr}
              role="button"
              tabIndex={0}
              className="flex items-center justify-center text-[10px] font-bold rounded border border-gray-300 dark:border-gray-600 cursor-pointer transition-all hover:ring-2 hover:ring-blue-500 hover:z-10"
              style={{
                gridRow: row + 1,
                gridColumn: col + 1,
                backgroundColor: bucket.bg,
                color: bucket.text,
                transform: isHovered ? 'scale(1.15)' : 'scale(1)',
              }}
              onMouseEnter={(e) => {
                setHovered({ abbr, name, count });
                setMousePos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onStateClick && onStateClick(abbr)}
            >
              {abbr}
            </div>
          );
        })}
      </div>

      {hovered && (
        <div
          className="fixed bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl pointer-events-none z-50"
          style={{ left: mousePos.x + 12, top: mousePos.y + 12 }}
        >
          <p className="font-semibold">{hovered.name}</p>
          <p className="text-gray-300">
            {hovered.count} {hovered.count === 1 ? 'order' : 'orders'}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs justify-center">
        <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
          <span className="w-4 h-4 rounded inline-block" style={{ backgroundColor: '#15803d' }} />
          50+ sales
        </span>
        <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
          <span className="w-4 h-4 rounded inline-block" style={{ backgroundColor: '#3b82f6' }} />
          20-49 sales
        </span>
        <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
          <span className="w-4 h-4 rounded inline-block" style={{ backgroundColor: '#fb923c' }} />
          1-19 sales
        </span>
        <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
          <span className="w-4 h-4 rounded inline-block border border-gray-300" style={{ backgroundColor: '#ffffff' }} />
          No sales
        </span>
      </div>
    </div>
  );
}
