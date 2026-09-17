/**
 * Cartoon-style illustrations for the "what is an ARGO float?" story: a friendly float
 * character ("Bob") drawn with thick graphite outlines and flat Field-Notebook fills. Pure
 * inline SVG — no image files, crisp at any size, colours stay on-palette.
 */

const INK = "#1a1a1a";
const GOLD = "#f4c95d";
const PAPER = "#f3ede0";
const WATER = "#1b5e6b";
const DEEP = "#0b2f3a";
const CORAL = "#f0562f";
const COBALT = "#1d4ed8";
const SAND = "#d9c9a3";

/** The character: a capsule body with a little antenna, cheeks, and a happy face. */
function Bob({ x = 0, y = 0, scale = 1, mood = "happy" as "happy" | "focused" | "sleepy", tilt = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${tilt})`}>
      {/* antenna */}
      <line x1="0" y1="-78" x2="0" y2="-50" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle cx="0" cy="-80" r="5" fill={CORAL} stroke={INK} strokeWidth="3" />
      {/* body */}
      <rect x="-22" y="-52" width="44" height="100" rx="20" fill={GOLD} stroke={INK} strokeWidth="3" />
      {/* collar band */}
      <rect x="-22" y="-14" width="44" height="8" fill={PAPER} stroke={INK} strokeWidth="3" />
      {/* face */}
      {mood === "sleepy" ? (
        <>
          <path d="M-11 -30 q5 3 10 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M3 -30 q5 3 10 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="-8" cy="-30" r="3" fill={INK} />
          <circle cx="8" cy="-30" r="3" fill={INK} />
        </>
      )}
      {mood === "focused" ? (
        <line x1="-6" y1="-20" x2="6" y2="-20" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M-7 -22 q7 7 14 0" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
      <circle cx="-14" cy="-24" r="3.5" fill={CORAL} opacity="0.7" />
      <circle cx="14" cy="-24" r="3.5" fill={CORAL} opacity="0.7" />
      {/* sensor nub at the bottom */}
      <rect x="-8" y="48" width="16" height="10" rx="3" fill={INK} />
    </g>
  );
}

function Waves({ y, width, color = WATER, amp = 6 }: { y: number; width: number; color?: string; amp?: number }) {
  const step = 40;
  let d = `M0 ${y}`;
  for (let x = 0; x < width; x += step) d += ` q${step / 4} ${-amp} ${step / 2} 0 t${step / 2} 0`;
  return <path d={d} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />;
}

function Satellite({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-30" y="-6" width="24" height="12" fill={COBALT} stroke={INK} strokeWidth="2.5" />
      <rect x="6" y="-6" width="24" height="12" fill={COBALT} stroke={INK} strokeWidth="2.5" />
      <rect x="-7" y="-9" width="14" height="18" rx="3" fill={PAPER} stroke={INK} strokeWidth="2.5" />
      <path d="M0 9 l0 8 M-4 17 h8" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Signal({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${s} 1)`} fill="none" stroke={CORAL} strokeWidth="2.5" strokeLinecap="round">
      <path d="M0 0 a12 12 0 0 1 12 -12" />
      <path d="M0 8 a20 20 0 0 1 20 -20" />
      <path d="M0 16 a28 28 0 0 1 28 -28" />
    </g>
  );
}

/** Four-panel comic strip: the float's 10-day cycle. */
export function FloatCycleStrip() {
  const panels = [
    {
      title: "1 · Drift",
      caption: "Bob floats a kilometre down, carried by slow deep currents for about nine days.",
      scene: (
        <>
          <rect x="0" y="0" width="260" height="200" fill={WATER} />
          <rect x="0" y="0" width="260" height="30" fill="#5f8a90" />
          <Waves y={30} width={260} color={PAPER} />
          <Bob x={120} y={120} scale={0.7} mood="sleepy" tilt={-8} />
          <path d="M40 120 q20 -10 40 0 M180 140 q20 -10 40 0" stroke={PAPER} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
          <text x="14" y="188" fontFamily="var(--font-geist-mono)" fontSize="10" fill={PAPER} letterSpacing="1.5">
            ~1,000 M
          </text>
        </>
      ),
    },
    {
      title: "2 · Dive",
      caption: "It pumps oil into an outer bladder to shrink, sinking to 2,000 m — deeper than most fish ever go.",
      scene: (
        <>
          <rect x="0" y="0" width="260" height="200" fill={DEEP} />
          <rect x="0" y="0" width="260" height="30" fill={WATER} />
          <Waves y={30} width={260} color={PAPER} />
          <Bob x={130} y={140} scale={0.7} mood="focused" tilt={0} />
          <path d="M130 40 v40" stroke={PAPER} strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
          <path d="M124 76 l6 8 l6 -8" stroke={PAPER} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <text x="14" y="188" fontFamily="var(--font-geist-mono)" fontSize="10" fill={PAPER} letterSpacing="1.5">
            2,000 M
          </text>
        </>
      ),
    },
    {
      title: "3 · Rise & measure",
      caption: "Coming back up over six hours, it records temperature and saltiness every few metres — one 'profile'.",
      scene: (
        <>
          <rect x="0" y="0" width="260" height="200" fill={WATER} />
          <rect x="0" y="0" width="260" height="30" fill="#5f8a90" />
          <Waves y={30} width={260} color={PAPER} />
          <Bob x={100} y={110} scale={0.7} mood="happy" tilt={0} />
          <path d="M100 176 v-40" stroke={PAPER} strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} transform={`translate(170 ${60 + i * 26})`}>
              <rect x="0" y="-5" width={26 + i * 9} height="10" rx="3" fill={i < 2 ? CORAL : COBALT} stroke={INK} strokeWidth="2" />
            </g>
          ))}
          <text x="170" y="48" fontFamily="var(--font-geist-mono)" fontSize="9" fill={PAPER} letterSpacing="1.5">
            TEMP ↑
          </text>
        </>
      ),
    },
    {
      title: "4 · Phone home",
      caption: "At the surface it beams the numbers to a satellite, then sinks to do it all again. Nobody steers it.",
      scene: (
        <>
          <rect x="0" y="0" width="260" height="200" fill="#e8ebe2" />
          <rect x="0" y="120" width="260" height="80" fill={WATER} />
          <Waves y={120} width={260} color={PAPER} />
          <Satellite x={200} y={40} />
          <Signal x={82} y={70} />
          <Bob x={70} y={125} scale={0.7} mood="happy" tilt={4} />
          <circle cx="40" cy="40" r="14" fill={GOLD} stroke={INK} strokeWidth="2.5" />
        </>
      ),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {panels.map((panel) => (
        <div key={panel.title} className="card card-hover overflow-hidden">
          <svg viewBox="0 0 260 200" className="block w-full">
            {panel.scene}
          </svg>
          <div className="p-4">
            <p className="font-display text-[20px] leading-none">{panel.title}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--graphite-2)]">{panel.caption}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hero illustration: Bob waving at the surface with a satellite and a distant coast. */
export function FloatHero() {
  return (
    <svg viewBox="0 0 520 360" className="block w-full" role="img" aria-label="A cartoon ARGO float at the sea surface talking to a satellite">
      <rect width="520" height="360" fill="#e8ebe2" rx="18" />
      <circle cx="440" cy="70" r="30" fill={GOLD} stroke={INK} strokeWidth="3" />
      <path d="M0 250 q60 -20 120 -10 t140 0 t140 -6 t120 4 v130 h-520z" fill={SAND} stroke={INK} strokeWidth="0" opacity="0.5" />
      <rect x="0" y="230" width="520" height="130" fill={WATER} />
      <Waves y={230} width={520} color={PAPER} amp={8} />
      <Waves y={280} width={520} color="#2f7683" amp={5} />
      <Satellite x={380} y={130} />
      <Signal x={232} y={150} />
      <Bob x={200} y={236} scale={1.15} mood="happy" tilt={3} />
      {/* wave arm */}
      <path d="M232 200 q18 -18 30 -34" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="264" cy="164" r="6" fill={GOLD} stroke={INK} strokeWidth="3" />
      <text x="24" y="330" fontFamily="var(--font-display)" fontStyle="italic" fontSize="18" fill={PAPER}>
        “Two kilometres down and back, every ten days.”
      </text>
    </svg>
  );
}
