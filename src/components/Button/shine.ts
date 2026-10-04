export type ShineType = "dark" | "light";

type RGB = { r: number; g: number; b: number };

const CYAN: RGB = { r: 161, g: 228, b: 238 };
const PEACH: RGB = { r: 255, g: 220, b: 172 };
const PINK: RGB = { r: 255, g: 196, b: 223 };

const THEMES: Record<ShineType, { edge: RGB; fill: RGB }> = {
  dark: {
    edge: { r: 255, g: 255, b: 255 },
    fill: { r: 0, g: 0, b: 0 },
  },
  light: {
    edge: { r: 0, g: 0, b: 0 },
    fill: { r: 255, g: 255, b: 255 },
  },
};

type Hit = { t: number; d2: number };

type Feature = {
  start: number;
  length: number;
  colorAt: (t: number) => RGB;
  closest: (x: number, y: number) => Hit;
};

export type Outline = {
  total: number;
  distanceAt: (x: number, y: number) => number;
  colorAt: (distance: number) => RGB;
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function solid(color: RGB): (t: number) => RGB {
  return () => color;
}

function ramp(from: RGB, to: RGB): (t: number) => RGB {
  return (t: number) => lerp(from, to, t);
}

function ramp3(from: RGB, mid: RGB, to: RGB): (t: number) => RGB {
  return (t: number) => (t <= 0.5 ? lerp(from, mid, t * 2) : lerp(mid, to, (t - 0.5) * 2));
}

function segmentClosest(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Hit {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((x - x0) * vx + (y - y0) * vy) / len2;
  t = clamp01(t);
  const px = x0 + vx * t;
  const py = y0 + vy * t;
  const dx = x - px;
  const dy = y - py;
  return { t, d2: dx * dx + dy * dy };
}

function arcClosest(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
  a0: number,
  a1: number,
): Hit {
  const tau = Math.PI * 2;
  let ang = Math.atan2(y - cy, x - cx);
  while (ang < a0) ang += tau;
  while (ang >= a0 + tau) ang -= tau;
  const clamped = Math.min(Math.max(ang, a0), a1);
  const px = cx + Math.cos(clamped) * radius;
  const py = cy + Math.sin(clamped) * radius;
  const dx = x - px;
  const dy = y - py;
  const span = a1 - a0 || 1;
  return { t: (clamped - a0) / span, d2: dx * dx + dy * dy };
}

/** 顺时针描边：上边青、桃、粉，右边粉，下边视觉上粉、桃、青，左边青。 */
export function createOutline(width: number, height: number, radius: number): Outline {
  const rr = Math.min(Math.max(radius, 0), width / 2, height / 2);
  const features: Feature[] = [];
  let cursor = 0;

  const add = (
    length: number,
    colorAt: (t: number) => RGB,
    closest: (x: number, y: number) => Hit,
  ) => {
    if (length <= 0.0001) return;
    features.push({ start: cursor, length, colorAt, closest });
    cursor += length;
  };

  add(Math.max(0, width - 2 * rr), ramp3(CYAN, PEACH, PINK), (x, y) =>
    segmentClosest(x, y, rr, 0, width - rr, 0),
  );
  add((Math.PI * rr) / 2, solid(PINK), (x, y) =>
    arcClosest(x, y, width - rr, rr, rr, -Math.PI / 2, 0),
  );
  add(Math.max(0, height - 2 * rr), solid(PINK), (x, y) =>
    segmentClosest(x, y, width, rr, width, height - rr),
  );
  add((Math.PI * rr) / 2, ramp(PINK, CYAN), (x, y) =>
    arcClosest(x, y, width - rr, height - rr, rr, 0, Math.PI / 2),
  );
  add(Math.max(0, width - 2 * rr), ramp3(CYAN, PEACH, PINK), (x, y) =>
    segmentClosest(x, y, width - rr, height, rr, height),
  );
  add((Math.PI * rr) / 2, ramp(PINK, CYAN), (x, y) =>
    arcClosest(x, y, rr, height - rr, rr, Math.PI / 2, Math.PI),
  );
  add(Math.max(0, height - 2 * rr), solid(CYAN), (x, y) =>
    segmentClosest(x, y, 0, height - rr, 0, rr),
  );
  add((Math.PI * rr) / 2, solid(CYAN), (x, y) =>
    arcClosest(x, y, rr, rr, rr, Math.PI, Math.PI * 1.5),
  );

  const total = cursor;

  return {
    total,
    distanceAt(x, y) {
      let bestD2 = Infinity;
      let best = 0;
      for (const feature of features) {
        const hit = feature.closest(x, y);
        if (hit.d2 < bestD2) {
          bestD2 = hit.d2;
          best = feature.start + hit.t * feature.length;
        }
      }
      return best;
    },
    colorAt(distance) {
      if (features.length === 0) return CYAN;
      let d = distance % total;
      if (d < 0) d += total;
      for (const feature of features) {
        if (d <= feature.start + feature.length) {
          return feature.colorAt(clamp01((d - feature.start) / feature.length));
        }
      }
      return features[features.length - 1].colorAt(1);
    },
  };
}

/** 负值在形状外，0 在外缘，向内为正。 */
export function signedDistance(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const rr = Math.min(Math.max(radius, 0), width / 2, height / 2);
  const qx = Math.abs(x - width / 2) - (width / 2 - rr);
  const qy = Math.abs(y - height / 2) - (height / 2 - rr);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rr;
}

const EDGE_WIDTH = 1;
const GLOW_WIDTH = 9;

export type ShineCache = {
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  total: number;
  sdf: Float32Array;
  dist: Float32Array;
  lut: Uint8ClampedArray;
  lutSize: number;
  image: ImageData;
};

const LUT_SIZE = 2048;

export function buildShineCache(
  cssWidth: number,
  cssHeight: number,
  radius: number,
  dpr: number,
): ShineCache | null {
  if (cssWidth < 1 || cssHeight < 1) return null;

  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  const outline = createOutline(cssWidth, cssHeight, radius);
  const count = pixelWidth * pixelHeight;
  const sdf = new Float32Array(count);
  const dist = new Float32Array(count);
  const reach = EDGE_WIDTH + GLOW_WIDTH + 1;

  for (let y = 0; y < pixelHeight; y += 1) {
    const cy = (y + 0.5) / dpr;
    for (let x = 0; x < pixelWidth; x += 1) {
      const cx = (x + 0.5) / dpr;
      const i = y * pixelWidth + x;
      const distance = signedDistance(cx, cy, cssWidth, cssHeight, radius);
      sdf[i] = distance;
      const inward = -distance;
      if (inward > -1 && inward < reach) {
        dist[i] = outline.distanceAt(cx, cy);
      }
    }
  }

  const lut = new Uint8ClampedArray(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const color = outline.colorAt(((i + 0.5) / LUT_SIZE) * outline.total);
    lut[i * 3] = Math.round(color.r);
    lut[i * 3 + 1] = Math.round(color.g);
    lut[i * 3 + 2] = Math.round(color.b);
  }

  return {
    pixelWidth,
    pixelHeight,
    dpr,
    total: outline.total,
    sdf,
    dist,
    lut,
    lutSize: LUT_SIZE,
    image: new ImageData(pixelWidth, pixelHeight),
  };
}

/** 为 false 时只画最外层基础边框。 */
const SHOW_INWARD_GLOW = true;

/** 0 是青/粉，1 是纯黑。指数小于 1 时先快速变黑，再缓慢变黑。 */
function darkenEase(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped ** 0.4;
}

export function paintShine(
  ctx: CanvasRenderingContext2D,
  cache: ShineCache,
  offset: number,
  type: ShineType,
): void {
  const { edge, fill } = THEMES[type];
  const { data } = cache.image;
  const { sdf, dist, lut, lutSize, dpr, total, pixelWidth, pixelHeight } = cache;
  const count = pixelWidth * pixelHeight;
  const reach = EDGE_WIDTH + GLOW_WIDTH;

  for (let i = 0; i < count; i += 1) {
    const coverage = Math.min(1, Math.max(0, 0.5 - sdf[i] * dpr));
    const p = i * 4;
    if (coverage <= 0) {
      data[p + 3] = 0;
      continue;
    }

    const inward = -sdf[i];
    let r = fill.r;
    let g = fill.g;
    let b = fill.b;

    const glowReach = SHOW_INWARD_GLOW ? reach : EDGE_WIDTH;
    if (inward < glowReach) {
      if (inward <= EDGE_WIDTH) {
        r = edge.r;
        g = edge.g;
        b = edge.b;
      } else if (SHOW_INWARD_GLOW) {
        const u = (((dist[i] - offset) / total) % 1 + 1) % 1;
        const x = u * lutSize;
        const i0 = Math.floor(x) % lutSize;
        const i1 = (i0 + 1) % lutSize;
        const t = x - Math.floor(x);
        const ar = lut[i0 * 3] + (lut[i1 * 3] - lut[i0 * 3]) * t;
        const ag = lut[i0 * 3 + 1] + (lut[i1 * 3 + 1] - lut[i0 * 3 + 1]) * t;
        const ab = lut[i0 * 3 + 2] + (lut[i1 * 3 + 2] - lut[i0 * 3 + 2]) * t;
        const mix = darkenEase((inward - EDGE_WIDTH) / GLOW_WIDTH);
        r = ar + (fill.r - ar) * mix;
        g = ag + (fill.g - ag) * mix;
        b = ab + (fill.b - ab) * mix;
      }
    }

    data[p] = Math.round(r);
    data[p + 1] = Math.round(g);
    data[p + 2] = Math.round(b);
    data[p + 3] = Math.round(coverage * 255);
  }

  ctx.putImageData(cache.image, 0, 0);
}
