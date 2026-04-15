export function Logo({
  variant = 'primary',
  className = '',
  style,
}: {
  variant?: 'primary' | 'micro' | 'cross';
  className?: string;
  style?: React.CSSProperties;
}) {
  const b = 16;   // block size
  const g = 3;    // gap
  const s = b + g; // step
  const total = 5 * b + 4 * g;
  const r = 1;    // corner radius

  // CROSS VARIANT: the extracted negative-space blocks
  if (variant === 'cross') {
    // These are the exact grid cells that form the cross in the negative space
    // Individual blocks, NOT connected - matches the gap pattern of the # grid
    const crossBlocks = [
      [0, 2],           // top of vertical arm
      [1, 1], [1, 2], [1, 3],  // horizontal arm top + vertical
      [2, 0], [2, 2], [2, 4],  // horizontal arm (row 2 gaps)
      // row 3: nothing - blocked by solid bar (woven behind)
      [4, 2],           // bottom of vertical arm
    ];

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${total} ${total}`}
        fill="none"
        className={className}
        style={style}
        aria-label="Be A Number cross"
      >
        {crossBlocks.map(([row, col]) => (
          <rect
            key={`cx-${row}-${col}`}
            x={col * s}
            y={row * s}
            width={b}
            height={b}
            rx={r}
            fill="currentColor"
          />
        ))}
      </svg>
    );
  }

  // FULL # VARIANTS (primary with letters, micro without)
  const letters: [number, number, string][] = [
    [0, 0, 'B'], [0, 2, 'E'], [0, 4, 'A'],
    [2, 0, 'N'], [2, 2, 'U'], [2, 4, 'M'],
    [4, 0, 'B'], [4, 2, 'E'], [4, 4, 'R'],
  ];

  const fontSize = variant === 'micro' ? b * 0.6 : b * 0.55;
  const showLetters = variant === 'primary';

  const topBlocks = [
    [0, 1], [0, 3],
    [1, 0], [1, 4],
  ];

  const x0 = 0;
  const x1 = 1 * s;
  const x1r = x1 + b;
  const x3 = 3 * s;
  const x3r = x3 + b;
  const xEnd = total;

  const y2 = 2 * s;
  const y3 = 3 * s;
  const y3b = y3 + b;
  const y4b = 4 * s + b;

  const mergedPath = `
    M ${x1} ${y2}
    L ${x1r} ${y2}
    L ${x1r} ${y3}
    L ${x3} ${y3}
    L ${x3} ${y2}
    L ${x3r} ${y2}
    L ${x3r} ${y3}
    L ${xEnd} ${y3}
    L ${xEnd} ${y3b}
    L ${x3r} ${y3b}
    L ${x3r} ${y4b}
    L ${x3} ${y4b}
    L ${x3} ${y3b}
    L ${x1r} ${y3b}
    L ${x1r} ${y4b}
    L ${x1} ${y4b}
    L ${x1} ${y3b}
    L ${x0} ${y3b}
    L ${x0} ${y3}
    L ${x1} ${y3}
    Z
  `;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} ${total}`}
      fill="none"
      className={className}
      style={style}
      aria-label="Be A Number logo"
    >
      {topBlocks.map(([row, col]) => (
        <rect
          key={`b-${row}-${col}`}
          x={col * s}
          y={row * s}
          width={b}
          height={b}
          rx={r}
          fill="currentColor"
        />
      ))}

      <path d={mergedPath} fill="currentColor" />

      {showLetters && letters.map(([row, col, ch]) => (
        <text
          key={`l-${row}-${col}`}
          x={col * s + b / 2}
          y={row * s + b / 2}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
          fontSize={fontSize}
          fill="currentColor"
          textAnchor="middle"
          dominantBaseline="central"
          fontWeight="800"
        >
          {ch}
        </text>
      ))}
    </svg>
  );
}
