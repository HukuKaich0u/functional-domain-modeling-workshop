/**
 * 内側ページの帯に敷く静止した星空。トップページのキャンバスと同じ配色で、
 * ビルド時に決定的な乱数で SVG を組み立てる（JS 不要、レイアウトも揺れない）。
 */
const cool = ["#e4e8f2", "#d9e2ff", "#eef0f5"] as const;
const warm = ["#efd9a0", "#e9c38a", "#e2a96b"] as const;
const red = ["#d98d6c", "#c9755e"] as const;

// mulberry32。seed が同じなら毎回同じ空になる
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T,>(list: readonly T[], value: number): T => list[Math.floor(value * list.length)]!;

const round = (value: number) => Math.round(value * 100) / 100;

export type SkyOptions = Readonly<{
  seed: number;
  width: number;
  height: number;
  /** 1000×1000 あたりの星の数 */
  density?: number;
  /** 回折の十字を持つ明るい星の数 */
  bright?: number;
  /** 傾いた楕円の銀河の数 */
  galaxies?: number;
}>;

/** `<svg>` の中身だけを返す。呼び出し側が viewBox と preserveAspectRatio を決める */
export const skyStarsMarkup = ({ seed, width, height, density = 900, bright = 2, galaxies = 6 }: SkyOptions): string => {
  const next = random(seed);
  const parts: string[] = [];
  const count = Math.round((density * width * height) / 1_000_000);

  for (let i = 0; i < galaxies; i += 1) {
    const rx = 1.6 + next() * 2.6;
    const ry = rx * (0.35 + next() * 0.5);
    const color = next() < 0.55 ? pick(warm, next()) : pick(cool, next());
    parts.push(
      `<ellipse cx="${round(next() * width)}" cy="${round(next() * height)}" rx="${round(rx)}" ry="${round(ry)}" transform="rotate(${Math.round(next() * 180)} ${0} ${0})" fill="${color}" opacity="${round(0.22 + next() * 0.2)}" style="transform-box: fill-box; transform-origin: center"/>`,
    );
  }

  for (let i = 0; i < count; i += 1) {
    const t = next();
    const color = t < 0.06 ? pick(red, next()) : t < 0.34 ? pick(warm, next()) : pick(cool, next());
    const r = 0.35 + next() ** 2 * 1.1;
    parts.push(
      `<circle cx="${round(next() * width)}" cy="${round(next() * height)}" r="${round(r)}" fill="${color}" opacity="${round(0.25 + next() * 0.6)}"/>`,
    );
  }

  for (let i = 0; i < bright; i += 1) {
    const x = round(width * (0.1 + next() * 0.8));
    const y = round(height * (0.15 + next() * 0.7));
    const spike = round(6 + next() * 6);
    const color = next() < 0.4 ? "#efd9a0" : "#e9eef8";
    parts.push(
      `<circle cx="${x}" cy="${y}" r="4.5" fill="${color}" opacity="0.14"/>`,
      `<path d="M${round(x - spike)} ${y}H${round(x + spike)}M${x} ${round(y - spike)}V${round(y + spike)}" stroke="${color}" stroke-width="0.7" opacity="0.6"/>`,
      `<circle cx="${x}" cy="${y}" r="1.4" fill="${color}" opacity="0.95"/>`,
    );
  }

  return parts.join("");
};
