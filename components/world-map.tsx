"use client";
import { locations, type Status } from "@/lib/mock-data";
const shapes = [
  [
    [8, 22],
    [15, 16],
    [24, 16],
    [31, 22],
    [29, 31],
    [23, 40],
    [20, 46],
    [15, 39],
    [12, 29],
  ],
  [
    [23, 43],
    [29, 45],
    [33, 53],
    [40, 55],
    [41, 63],
    [36, 76],
    [31, 87],
    [29, 73],
    [27, 60],
  ],
  [
    [37, 9],
    [44, 8],
    [43, 20],
    [39, 25],
    [35, 18],
  ],
  [
    [44, 27],
    [49, 20],
    [54, 23],
    [58, 17],
    [72, 17],
    [82, 23],
    [93, 28],
    [94, 36],
    [86, 42],
    [79, 40],
    [78, 49],
    [71, 54],
    [65, 48],
    [61, 38],
    [55, 36],
    [51, 40],
    [44, 35],
  ],
  [
    [46, 39],
    [54, 39],
    [60, 48],
    [58, 59],
    [53, 74],
    [49, 68],
    [47, 55],
    [42, 46],
  ],
  [
    [77, 66],
    [88, 63],
    [94, 74],
    [88, 81],
    [78, 79],
  ],
  [
    [73, 55],
    [78, 57],
    [84, 60],
    [88, 60],
    [84, 64],
    [79, 63],
  ],
  [
    [59, 65],
    [61, 65],
    [60, 73],
    [58, 74],
  ],
];
function inside(x: number, y: number, poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (
      poly[i][1] > y !== poly[j][1] > y &&
      x <
        ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) /
          (poly[j][1] - poly[i][1]) +
          poly[i][0]
    )
      c = !c;
  }
  return c;
}
const dots = Array.from({ length: 55 * 30 }, (_, i) => ({
  x: (i % 55) * 1.8 + 1,
  y: Math.floor(i / 55) * 2.8 + 5,
})).filter((p) => shapes.some((s) => inside(p.x, p.y, s)));
export function WorldMap({
  hero = false,
  selected = "jp",
  ids = locations.map((l) => l.id),
  statuses,
  onSelect,
}: {
  hero?: boolean;
  selected?: string;
  ids?: string[];
  statuses?: Record<string, Status>;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className={`world-map ${hero ? "hero-map" : ""}`}>
      <svg
        viewBox="0 0 700 390"
        role="img"
        aria-label="World map showing global browser test locations"
      >
        <defs>
          <radialGradient id={hero ? "halo-hero" : "halo"}>
            <stop stopColor="#5552da" stopOpacity=".19" />
            <stop offset="1" stopColor="#5552da" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <ellipse
          cx="350"
          cy="190"
          rx="330"
          ry="185"
          fill={`url(#${hero ? "halo-hero" : "halo"})`}
        />
        {[80, 140, 200, 260, 320].map((y) => (
          <path
            key={y}
            d={`M 25 ${y} Q 350 ${y + 30} 675 ${y}`}
            stroke="#8186b4"
            strokeOpacity=".07"
            fill="none"
          />
        ))}
        {dots.map((p, i) => (
          <circle
            key={i}
            cx={p.x * 7}
            cy={p.y * 3.9}
            r={hero ? 1.65 : 1.5}
            fill={hero ? "#4b5279" : "#384363"}
          />
        ))}
        {hero &&
          [
            locations[0],
            locations[3],
            locations[6],
            locations[7],
            locations[10],
          ].map((l) => (
            <path
              key={l.id}
              d={`M 350 135 Q ${(l.x * 7 + 350) / 2} ${l.y * 3.9 - 70} ${l.x * 7} ${l.y * 3.9}`}
              fill="none"
              stroke="#7c77f0"
              strokeWidth="1"
              strokeOpacity=".45"
              strokeDasharray="3 5"
            />
          ))}
        {locations
          .filter((l) => ids.includes(l.id))
          .map((l) => ({ ...l, status: statuses?.[l.id] ?? l.status }))
          .map((l) => (
            <g
              key={l.id}
              className={onSelect ? "map-pin interactive" : "map-pin"}
              onClick={() => onSelect?.(l.id)}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? "button" : undefined}
              aria-label={`${l.name}: ${l.status}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelect?.(l.id);
              }}
            >
              <circle
                cx={l.x * 7}
                cy={l.y * 3.9}
                r={selected === l.id ? 15 : 10}
                fill={
                  l.status === "pass"
                    ? "#36d7aa"
                    : l.status === "warning"
                      ? "#eab75c"
                      : "#f36c84"
                }
                opacity=".1"
              />
              <circle
                cx={l.x * 7}
                cy={l.y * 3.9}
                r="4"
                fill={
                  l.status === "pass"
                    ? "#36d7aa"
                    : l.status === "warning"
                      ? "#eab75c"
                      : "#f36c84"
                }
              />
              <circle
                cx={l.x * 7}
                cy={l.y * 3.9}
                r="7"
                fill="none"
                stroke={
                  l.status === "pass"
                    ? "#36d7aa"
                    : l.status === "warning"
                      ? "#eab75c"
                      : "#f36c84"
                }
                opacity=".3"
              />
            </g>
          ))}
      </svg>
    </div>
  );
}
