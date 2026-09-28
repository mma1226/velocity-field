const canvas = document.querySelector("#field");
const ctx = canvas.getContext("2d", { alpha: false });

const controls = {
  intensity: document.querySelector("#intensity"),
  density: document.querySelector("#density"),
  colorRange: document.querySelector("#colorRange"),
  speed: document.querySelector("#speed"),
  flicker: document.querySelector("#flicker"),
};

const modalGreen = [127, 238, 100];
const colorSystem = {
  base: [0, 0, 0],
  core: [
    { color: [249, 250, 247], weight: 16, group: "chrome" },
    { color: [224, 226, 219], weight: 13, group: "chrome" },
    { color: [181, 187, 181], weight: 10, group: "chrome" },
    { color: [112, 119, 116], weight: 6, group: "chrome" },
    { color: [10, 11, 10], weight: 9, group: "dark" },
    { color: [27, 29, 27], weight: 7, group: "dark" },
    { color: [127, 238, 100], weight: 19, group: "modal" },
    { color: [183, 255, 158], weight: 12, group: "modal" },
    { color: [219, 255, 205], weight: 8, group: "modal" },
    { color: [89, 185, 76], weight: 7, group: "modal" },
    { color: [43, 83, 45], weight: 5, group: "modal" },
    { color: [205, 226, 74], weight: 4, group: "modal" },
  ],
  moods: [
    {
      name: "violet chrome",
      entries: [
        { color: [34, 34, 76], weight: 5, group: "secondary" },
        { color: [84, 75, 145], weight: 4, group: "secondary" },
        { color: [141, 137, 224], weight: 2.4, group: "secondary" },
      ],
    },
    {
      name: "blue glass",
      entries: [
        { color: [0, 85, 165], weight: 4.4, group: "secondary" },
        { color: [45, 156, 216], weight: 3.4, group: "secondary" },
        { color: [180, 232, 247], weight: 2.8, group: "secondary" },
      ],
    },
    {
      name: "magenta voltage",
      entries: [
        { color: [94, 28, 68], weight: 3.8, group: "secondary" },
        { color: [198, 44, 116], weight: 3.2, group: "secondary" },
        { color: [226, 111, 164], weight: 1.8, group: "secondary" },
      ],
    },
    {
      name: "acid graphite",
      entries: [
        { color: [169, 213, 28], weight: 4.4, group: "secondary" },
        { color: [225, 238, 91], weight: 2.8, group: "secondary" },
        { color: [72, 91, 75], weight: 3.2, group: "secondary" },
      ],
    },
    {
      name: "warm oxide",
      entries: [
        { color: [124, 88, 62], weight: 2.4, group: "secondary" },
        { color: [220, 196, 168], weight: 2.6, group: "secondary" },
        { color: [151, 134, 109], weight: 3.2, group: "secondary" },
      ],
    },
  ],
};

const fieldPalette = createFieldPalette(mulberry32(1));
let generatedPalette = fieldPalette;

let width = 0;
let height = 0;
let dpr = 1;
let seed = Math.floor(Math.random() * 999999) + 1;
let bands = [];
let motes = [];
let passingStreaks = [];
let running = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let animationId = 0;
let frozenTime = 0;
let startTime = performance.now();
let evolutionRandom = null;
let fieldRevealStartedAt = 0;

// Small deterministic generator so every seed always rebuilds the same field.
function mulberry32(value) {
  return function random() {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(min, max, value) {
  const normalized = clamp((value - min) / (max - min));
  return normalized * normalized * (3 - 2 * normalized);
}

function easeOutCubic(value) {
  return 1 - (1 - clamp(value)) ** 3;
}

function easeOutQuart(value) {
  return 1 - (1 - clamp(value)) ** 4;
}

function fract(value) {
  return value - Math.floor(value);
}

function hashNoise(value) {
  return fract(Math.sin(value * 12.9898 + 78.233) * 43758.5453);
}

// Smooth value noise keeps motion organic without returning to a fixed animation loop.
function smoothNoise(time, noiseSeed) {
  const whole = Math.floor(time);
  const fraction = smoothstep(0, 1, time - whole);
  return mix(hashNoise(whole + noiseSeed), hashNoise(whole + noiseSeed + 1), fraction);
}

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function tint(color, amount) {
  return color.map((channel) => Math.round(mix(channel, 255, amount)));
}

function blendColor(colorA, colorB, amount) {
  return colorA.map((channel, index) => Math.round(mix(channel, colorB[index], amount)));
}

function parseColorString(value) {
  const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(value);
  if (!match) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function svgNum(value) {
  return Math.round(value * 100) / 100;
}

// Records the same draw calls the canvas 2D context accepts (fillRect, path building,
// fill/stroke, linear gradients, save/restore, screen blending, shadow blur) and emits
// static SVG markup instead of pixels — so `render()` can target either backend unchanged.
class SVGRecorder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.isVector = true;
    this.defs = [];
    this.body = [];
    this.gradientId = 0;
    this.filterId = 0;
    this.currentPath = null;
    this.state = {
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      globalCompositeOperation: "source-over",
      shadowBlur: 0,
      shadowColor: "rgba(0,0,0,0)",
    };
    this.stack = [];
  }

  // Canvas API surface used by the drawing code below.
  setTransform() {}

  save() {
    this.stack.push({ ...this.state });
  }

  restore() {
    this.state = this.stack.pop() || this.state;
  }

  get fillStyle() { return this.state.fillStyle; }
  set fillStyle(value) { this.state.fillStyle = value; }
  get strokeStyle() { return this.state.strokeStyle; }
  set strokeStyle(value) { this.state.strokeStyle = value; }
  get lineWidth() { return this.state.lineWidth; }
  set lineWidth(value) { this.state.lineWidth = value; }
  get globalCompositeOperation() { return this.state.globalCompositeOperation; }
  set globalCompositeOperation(value) { this.state.globalCompositeOperation = value; }
  get shadowBlur() { return this.state.shadowBlur; }
  set shadowBlur(value) { this.state.shadowBlur = value; }
  get shadowColor() { return this.state.shadowColor; }
  set shadowColor(value) { this.state.shadowColor = value; }

  // A tiled pattern stands in for the per-scanline fillRect loop the canvas backend uses —
  // same visual texture, without hundreds of individual hairline rects in the markup.
  createScanlinePattern(whiteAlpha, blackAlpha) {
    return { isPattern: true, whiteAlpha, blackAlpha };
  }

  createLinearGradient(x0, y0, x1, y1) {
    const stops = [];
    return {
      isGradient: true,
      x0, y0, x1, y1,
      stops,
      addColorStop(offset, color) {
        stops.push({ offset, color });
      },
    };
  }

  registerPaint(paint) {
    if (typeof paint === "string") return paint;
    if (paint && paint.isPattern) {
      const id = `pat${this.gradientId++}`;
      this.defs.push(
        `<pattern id="${id}" width="1" height="4" patternUnits="userSpaceOnUse">` +
          `<rect x="0" y="0" width="1" height="0.45" fill="rgba(255,255,255,${paint.whiteAlpha})" />` +
          `<rect x="0" y="2" width="1" height="0.65" fill="rgba(0,0,0,${paint.blackAlpha})" />` +
          `</pattern>`
      );
      return `url(#${id})`;
    }
    if (paint && paint.isGradient) {
      const id = `grad${this.gradientId++}`;
      const stopMarkup = paint.stops
        .map(({ offset, color }) => {
          const { r, g, b, a } = parseColorString(color);
          return `<stop offset="${svgNum(offset)}" stop-color="rgb(${r},${g},${b})" stop-opacity="${a}" />`;
        })
        .join("");
      this.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${svgNum(paint.x0)}" y1="${svgNum(paint.y0)}" x2="${svgNum(paint.x1)}" y2="${svgNum(paint.y1)}">${stopMarkup}</linearGradient>`
      );
      return `url(#${id})`;
    }
    return "none";
  }

  // Approximates canvas shadowBlur (a soft blurred copy behind the shape) by blurring
  // the shape itself — a close match here since these shapes are already low-alpha glows.
  registerBlurFilter() {
    const id = `blur${this.filterId++}`;
    const deviation = svgNum(this.state.shadowBlur * 0.5);
    this.defs.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${deviation}" /></filter>`
    );
    return id;
  }

  elementStyle() {
    return this.state.globalCompositeOperation === "screen" ? ' style="mix-blend-mode:screen"' : "";
  }

  beginPath() {
    this.currentPath = [];
  }

  moveTo(x, y) {
    this.currentPath?.push(["M", x, y]);
  }

  lineTo(x, y) {
    this.currentPath?.push(["L", x, y]);
  }

  closePath() {
    this.currentPath?.push(["Z"]);
  }

  pathData() {
    return this.currentPath
      .map((segment) => (segment[0] === "Z" ? "Z" : `${segment[0]}${svgNum(segment[1])},${svgNum(segment[2])}`))
      .join(" ");
  }

  fill() {
    if (!this.currentPath || !this.currentPath.length) return;
    const fill = this.registerPaint(this.state.fillStyle);
    const filterAttr = this.state.shadowBlur > 0 ? ` filter="url(#${this.registerBlurFilter()})"` : "";
    this.body.push(`<path d="${this.pathData()}" fill="${fill}"${filterAttr}${this.elementStyle()} />`);
  }

  stroke() {
    if (!this.currentPath || !this.currentPath.length) return;
    const stroke = this.registerPaint(this.state.strokeStyle);
    this.body.push(
      `<path d="${this.pathData()}" fill="none" stroke="${stroke}" stroke-width="${svgNum(this.state.lineWidth)}" stroke-linecap="round"${this.elementStyle()} />`
    );
  }

  fillRect(x, y, w, h) {
    const fill = this.registerPaint(this.state.fillStyle);
    this.body.push(`<rect x="${svgNum(x)}" y="${svgNum(y)}" width="${svgNum(w)}" height="${svgNum(h)}" fill="${fill}"${this.elementStyle()} />`);
  }

  toSVG() {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgNum(this.width)} ${svgNum(this.height)}" width="${svgNum(this.width)}" height="${svgNum(this.height)}">`,
      `<defs>${this.defs.join("")}</defs>`,
      this.body.join("\n"),
      `</svg>`,
    ].join("\n");
  }
}

function colorRangeLevel() {
  return Number(controls.colorRange?.value ?? 72) / 100;
}

function createFieldPalette(random) {
  const colorRange = colorRangeLevel();
  const mood = colorSystem.moods[Math.floor(random() * colorSystem.moods.length)];
  const secondaryMood = random() < mix(0.12, 0.62, colorRange)
    ? colorSystem.moods[Math.floor(random() * colorSystem.moods.length)]
    : null;
  const moodStrength = mix(0.55, 2.65, colorRange) * mix(0.92, 1.28, random());
  const secondaryStrength = secondaryMood && secondaryMood !== mood
    ? mix(0.12, 0.95, colorRange) * mix(0.86, 1.22, random())
    : 0;
  const entries = colorSystem.core.map((entry) => ({ ...entry }));

  for (const entry of mood.entries) {
    entries.push({ ...entry, weight: entry.weight * moodStrength });
  }

  if (secondaryStrength) {
    for (const entry of secondaryMood.entries) {
      entries.push({ ...entry, weight: entry.weight * secondaryStrength });
    }
  }

  const groups = entries.reduce((accumulator, entry, index) => {
    if (!accumulator[entry.group]) accumulator[entry.group] = [];
    accumulator[entry.group].push(index);
    return accumulator;
  }, {});

  return {
    base: colorSystem.base,
    colors: entries.map((entry) => entry.color),
    weights: entries.map((entry) => entry.weight),
    groups,
    colorRange,
    moodName: secondaryStrength ? `${mood.name} / ${secondaryMood.name}` : mood.name,
    accent: modalGreen,
    accentChance: mix(0.1, 0.17, colorRange),
    accentBlend: mix(0.3, 0.44, colorRange),
  };
}

function activePalette() {
  return generatedPalette || fieldPalette;
}

function paletteColor(palette, colorIndex) {
  return palette.colors[colorIndex % palette.colors.length];
}

function pickPaletteIndex(palette, random) {
  const total = palette.weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (let index = 0; index < palette.weights.length; index += 1) {
    target -= palette.weights[index];
    if (target <= 0) return index;
  }
  return palette.weights.length - 1;
}

function pickGroupIndex(palette, groupName, random) {
  const indices = palette.groups?.[groupName] ?? [];
  if (!indices.length) return pickPaletteIndex(palette, random);
  const total = indices.reduce((sum, index) => sum + palette.weights[index], 0);
  let target = random() * total;
  for (const index of indices) {
    target -= palette.weights[index];
    if (target <= 0) return index;
  }
  return indices[indices.length - 1];
}

function pickCompanionIndex(palette, random) {
  const colorRange = palette.colorRange ?? 0.72;
  const modalChance = mix(0.43, 0.3, colorRange);
  const chromeChance = mix(0.32, 0.22, colorRange);
  const secondaryChance = mix(0.13, 0.4, colorRange);
  const roll = random();
  if (roll < modalChance) return pickGroupIndex(palette, "modal", random);
  if (roll < modalChance + chromeChance) return pickGroupIndex(palette, "chrome", random);
  if (roll < modalChance + chromeChance + secondaryChance) return pickGroupIndex(palette, "secondary", random);
  return pickGroupIndex(palette, "dark", random);
}

function pickDetailIndex(palette, random) {
  const colorRange = palette.colorRange ?? 0.72;
  const secondaryChance = mix(0.12, 0.38, colorRange);
  const modalChance = mix(0.34, 0.28, colorRange);
  const chromeChance = mix(0.34, 0.25, colorRange);
  const roll = random();
  if (roll < secondaryChance) return pickGroupIndex(palette, "secondary", random);
  if (roll < secondaryChance + modalChance) return pickGroupIndex(palette, "modal", random);
  if (roll < secondaryChance + modalChance + chromeChance) return pickGroupIndex(palette, "chrome", random);
  if (roll < 0.94) return pickGroupIndex(palette, "dark", random);
  return pickPaletteIndex(palette, random);
}

function hashedGroupColor(palette, groupName, value) {
  const indices = palette.groups?.[groupName] ?? [];
  if (!indices.length) return paletteColor(palette, Math.floor(hashNoise(value) * palette.colors.length));
  return paletteColor(palette, indices[Math.floor(hashNoise(value) * indices.length)]);
}

function detailColor(palette, band, colorIndex) {
  const baseColor = paletteColor(palette, colorIndex);
  if (!band.accent) return baseColor;
  return baseColor.map((channel, index) => Math.round(mix(channel, palette.accent[index], palette.accentBlend)));
}

function buildField() {
  const random = mulberry32(seed);
  evolutionRandom = mulberry32(seed ^ 0x9e3779b9);
  const palette = createFieldPalette(random);
  generatedPalette = palette;
  const density = Number(controls.density.value) / 100;
  const count = Math.round(12 + density * 34);
  const jumboIndex = Math.floor(random() * count);
  const anchorRoles = ["modal", "chrome", "dark", "modal", "chrome", "secondary", "modal", "secondary", "chrome"];
  bands = [];

  for (let index = 0; index < count; index += 1) {
    const roll = random();
    const isJumbo = index === jumboIndex || roll > 0.985;
    const size = isJumbo
      ? mix(0.13, 0.24, random())
      : roll > 0.84
        ? mix(0.04, 0.09, random())
        : roll > 0.43
          ? mix(0.012, 0.038, random())
          : mix(0.0018, 0.011, random() ** 2);
    const bright = isJumbo
      ? mix(0.38, 0.68, random())
      : roll > 0.84
        ? mix(0.62, 1, random())
        : mix(0.22, 0.72, random() ** 1.5);
    const detailCount = Math.max(3, Math.round((5 + size * 480) * mix(0.9, 1.6, density)));
    const lineDetails = [];
    const patches = [];

    for (let line = 0; line < detailCount; line += 1) {
      lineDetails.push({
        y: random(),
        thickness: mix(0.22, 1.5, random() ** 2),
        alpha: mix(0.08, 0.62, random() ** 1.3),
        colorIndex: pickDetailIndex(palette, random),
        segment: random() > 0.52,
        x: random(),
        span: mix(0.16, 0.9, random()),
        drift: mix(0.35, 1, random()),
        phase: random() * Math.PI * 2,
      });
    }

    const patchCount = 2 + Math.floor(random() * 4);
    for (let patch = 0; patch < patchCount; patch += 1) {
      patches.push({
        x: random(),
        width: mix(0.055, 0.28, random()),
        y: random(),
        height: mix(0.16, 0.8, random()),
        phase: random() * Math.PI * 2,
        frequency: mix(0.16, 0.55, random()),
        strength: mix(0.5, 1.25, random()),
        noiseSeed: random() * 10000,
      });
    }

    const anchoredRole = index < anchorRoles.length ? anchorRoles[index] : null;
    const colorIndex = anchoredRole ? pickGroupIndex(palette, anchoredRole, random) : pickPaletteIndex(palette, random);
    const companionIndex = pickCompanionIndex(palette, random);
    const isTransient = roll <= 0.9 && random() < 0.54;

    bands.push({
      // Stratified placement avoids accidental large black voids while preserving irregular spacing.
      y: (index + random()) / count,
      size,
      bright,
      colorIndex,
      companionIndex,
      anchorRole: anchoredRole,
      colorBlend: mix(0.1, roll > 0.84 ? 0.46 : 0.32, random() ** 1.35) * mix(0.85, 1.25, palette.colorRange),
      accent: random() < palette.accentChance,
      phase: random() * Math.PI * 2,
      frequency: mix(0.18, 0.8, random()),
      motion: mix(0.35, 1.35, random()),
      drift: mix(0.2, 1, random()),
      noiseSeed: random() * 10000,
      // Macro beams anchor the composition; smaller streaks handle arrivals and exits.
      transient: isTransient,
      lifeOffset: mix(0, 0.16, random() ** 2),
      birthTime: null,
      lifeRate: isTransient ? mix(0.05, 0.115, random()) : mix(0.032, 0.062, random()),
      travelDirection: 1,
      travelSpan: isTransient ? mix(0.72, 1.62, random()) : mix(1.4, 3.1, random()),
      flare: mix(0.3, 1, random()),
      revealDelay: mix(0, 0.1, random() ** 2.6),
      revealDuration: mix(0.16, 0.4, random()),
      revealDirection: 1,
      lineDetails,
      patches,
    });
  }

  bands.sort((a, b) => a.y - b.y);
  passingStreaks = Array.from({ length: Math.round(8 + density * 18) }, (_, index) => {
    const isFlash = random() > 0.76;
    const colorIndex = random() < mix(0.18, 0.46, palette.colorRange)
      ? pickGroupIndex(palette, "secondary", random)
      : pickCompanionIndex(palette, random);
    return {
      y: random(),
      thickness: isFlash ? mix(0.008, 0.026, random() ** 1.2) : mix(0.0016, 0.009, random() ** 1.6),
      length: isFlash ? mix(0.32, 0.86, random()) : mix(0.14, 0.48, random() ** 0.85),
      alpha: isFlash ? mix(0.16, 0.42, random()) : mix(0.07, 0.24, random()),
      rate: isFlash ? mix(0.035, 0.065, random()) : mix(0.045, 0.105, random()),
      phase: (index / (8 + density * 18) + random() * 0.12) % 1,
      colorIndex,
      companionIndex: pickCompanionIndex(palette, random),
      colorBlend: mix(0.12, 0.44, random()) * mix(0.8, 1.2, palette.colorRange),
      motion: mix(0.45, 1.2, random()),
      flare: isFlash ? mix(0.72, 1.35, random()) : mix(0.32, 0.9, random()),
      noiseSeed: random() * 10000,
      edge: mix(0.22, 0.42, random()),
    };
  });
  motes = Array.from({ length: Math.round(18 + density * 30) }, () => ({
    y: random(),
    x: random(),
    width: mix(0.08, 0.48, random() ** 1.2),
    alpha: mix(0.035, 0.19, random()),
    phase: random() * Math.PI * 2,
    noiseSeed: random() * 10000,
    speed: mix(0.45, 1.35, random()),
    colorIndex: random() < mix(0.12, 0.36, palette.colorRange) ? pickGroupIndex(palette, "secondary", random) : pickPaletteIndex(palette, random),
  }));

  document.querySelector("#seedValue").textContent = String(seed).padStart(6, "0");
  fieldRevealStartedAt = currentTime();
  render(currentTime());
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(currentTime());
}

function currentTime() {
  return running ? performance.now() - startTime : frozenTime;
}

// Perspective compresses bands around a vanishing region on the left and opens
// their spacing and thickness toward the viewer on the right.
function projectBandPoint(band, baseY, x, perspective, time) {
  const angle = 0;
  const rawDepth = (x + width * 0.18) / (width * 1.18);
  const depth = smoothstep(0, 1, rawDepth);
  const depthCurve = depth ** 1.55;
  const horizon = height * 0.47;
  const spread = mix(1 - perspective * 0.68, 1 + perspective * 0.28, depthCurve);
  const angleSlope = Math.tan((angle * Math.PI) / 180) * mix(0.11, 0.31, depth);
  const motion = band.motion ?? band.speed ?? 1;
  const livingBend = (smoothNoise(time * 0.065 * motion + depth * 0.7, band.noiseSeed + 31) * 2 - 1)
    * perspective * motion * 3.2;
  const projectedY = horizon + (baseY - horizon) * spread + angleSlope * (x - width * 0.5) + livingBend;
  const thicknessScale = mix(1 - perspective * 0.5, 1 + perspective * 0.62, depth ** 1.2);
  return { y: projectedY, thicknessScale };
}

function traceRibbon(c, band, baseY, thickness, xStart, xEnd, perspective, time) {
  const span = Math.max(1, xEnd - xStart);
  const steps = Math.max(6, Math.ceil(span / 72));
  const top = [];
  const bottom = [];

  for (let step = 0; step <= steps; step += 1) {
    const x = mix(xStart, xEnd, step / steps);
    const point = projectBandPoint(band, baseY, x, perspective, time);
    const half = thickness * point.thicknessScale * 0.5;
    top.push([x, point.y - half]);
    bottom.push([x, point.y + half]);
  }

  c.beginPath();
  c.moveTo(top[0][0], top[0][1]);
  for (let index = 1; index < top.length; index += 1) c.lineTo(top[index][0], top[index][1]);
  for (let index = bottom.length - 1; index >= 0; index -= 1) c.lineTo(bottom[index][0], bottom[index][1]);
  c.closePath();
}

function strokeCurvedLine(c, band, baseY, xStart, xEnd, perspective, time, thickness, style) {
  if (xEnd - xStart < 1) return;
  const steps = Math.max(4, Math.ceil((xEnd - xStart) / 68));
  c.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const x = mix(xStart, xEnd, step / steps);
    const point = projectBandPoint(band, baseY, x, perspective, time);
    if (step === 0) c.moveTo(x, point.y);
    else c.lineTo(x, point.y);
  }
  const midPoint = projectBandPoint(band, baseY, (xStart + xEnd) * 0.5, perspective, time);
  c.lineWidth = Math.max(0.35, thickness * midPoint.thicknessScale);
  c.strokeStyle = style;
  c.stroke();
}

function beamFill(c, color, alpha, window, transient) {
  const fillsViewport = window.xStart <= 0 && window.xEnd >= width;
  if (!window.isRevealing && fillsViewport) return rgba(color, alpha);

  const fadeStart = window.isRevealing ? window.xStart : window.fadeStart;
  const fadeEnd = window.isRevealing ? window.xEnd : window.fadeEnd;
  const settledEdgeAlpha = window.isRevealing
    ? alpha * smoothstep(0.82, 1, window.revealProgress)
    : 0;
  const fadeStop = window.isRevealing ? 0.4 : 0.28;
  const gradient = c.createLinearGradient(fadeStart, 0, fadeEnd, 0);
  gradient.addColorStop(0, rgba(color, settledEdgeAlpha));
  gradient.addColorStop(fadeStop, rgba(color, alpha));
  gradient.addColorStop(1 - fadeStop, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, settledEdgeAlpha));
  return gradient;
}

function evolveBand(band) {
  const random = evolutionRandom;
  const palette = activePalette();
  band.y = clamp(mix(band.y, random(), 0.62), 0.02, 0.98);
  band.size = clamp(band.size * mix(0.72, 1.32, random()), 0.0018, 0.085);
  band.bright = clamp(band.bright * mix(0.82, 1.24, random()), 0.2, 1);
  band.colorIndex = band.anchorRole && random() < 0.82
    ? pickGroupIndex(palette, band.anchorRole, random)
    : pickPaletteIndex(palette, random);
  band.companionIndex = pickCompanionIndex(palette, random);
  band.colorBlend = mix(0.1, band.size > 0.04 ? 0.46 : 0.32, random() ** 1.35) * mix(0.85, 1.25, palette.colorRange);
  band.accent = random() < palette.accentChance;
  band.phase = random() * Math.PI * 2;
  band.frequency = mix(0.18, 0.92, random());
  band.motion = mix(0.35, 1.45, random());
  band.noiseSeed = random() * 10000;
  band.lifeRate = band.transient ? mix(0.05, 0.115, random()) : mix(0.032, 0.062, random());
  band.travelDirection = 1;
  band.travelSpan = band.transient ? mix(0.72, 1.62, random()) : mix(1.4, 3.1, random());
  band.flare = mix(0.3, 1, random());

  for (const line of band.lineDetails) {
    line.x = random();
    line.y = random();
    line.drift = mix(0.35, 1, random());
    line.phase = random() * Math.PI * 2;
    line.alpha = mix(0.08, 0.64, random() ** 1.25);
    line.colorIndex = pickDetailIndex(palette, random);
    line.segment = random() > 0.5;
  }

  for (const patch of band.patches) {
    patch.x = random();
    patch.y = random();
    patch.phase = random() * Math.PI * 2;
    patch.frequency = mix(0.16, 0.55, random());
    patch.strength = mix(0.5, 1.25, random());
    patch.noiseSeed = random() * 10000;
  }
}

function bandWindow(band, time) {
  const overscan = width * 0.2;
  if (!band.transient) {
    return {
      xStart: -overscan,
      xEnd: width + overscan,
      fadeStart: 0,
      fadeEnd: width,
      visibility: 1,
      tip: width + overscan,
      cycle: 0,
    };
  }

  const duration = 1 / band.lifeRate;
  if (band.birthTime === null) band.birthTime = -band.lifeOffset * duration;
  let elapsed = time - band.birthTime;
  if (elapsed >= duration) {
    evolveBand(band);
    band.birthTime = time;
    elapsed = 0;
  }
  const cycle = clamp(elapsed * band.lifeRate);
  const motion = smoothstep(0, 1, cycle);
  const visibility = smoothstep(0.015, 0.08, cycle) * (1 - smoothstep(0.88, 0.995, cycle));
  const length = width * band.travelSpan;
  const head = band.travelDirection > 0
    ? mix(-width * 0.16, width * 3, motion)
    : mix(width * 1.16, -width * 2, motion);
  const start = band.travelDirection > 0 ? head - length : head;
  const end = band.travelDirection > 0 ? head : head + length;
  return {
    xStart: Math.max(-overscan, start),
    xEnd: Math.min(width + overscan, end),
    fadeStart: start,
    fadeEnd: end,
    visibility,
    tip: head,
    cycle,
  };
}

// Render one curved beam, then populate it with high-frequency sub-lines and local flare patches.
function drawBand(c, band, time, palette, intensity, speed, flicker, perspective) {
  const t = time * 0.001 * speed;
  const fieldAge = Math.max(0, (time - fieldRevealStartedAt) * 0.001);
  const entryStability = smoothstep(0.3, 1.3, fieldAge);
  const verticalTime = time * 0.001 * mix(0.42, 0.82, entryStability);
  const rawEvolutionScale = mix(0.82, 1.18, smoothNoise(verticalTime * 0.026, band.noiseSeed + 503));
  const evolutionScale = mix(1, rawEvolutionScale, mix(0.08, 0.72, entryStability));
  const h = Math.max(0.75, band.size * height * evolutionScale);
  const organicDrift = smoothNoise(verticalTime * 0.105 * band.motion, band.noiseSeed) * 2 - 1;
  const slowEvolution = (smoothNoise(verticalTime * 0.017, band.noiseSeed + 887) * 2 - 1) * height * 0.018;
  const yDrift = (organicDrift * Math.min(6.5, h * 0.1) + slowEvolution) * mix(0.12, 1, entryStability);
  const y = band.y * height + yDrift;
  const color = band.accent ? palette.accent : paletteColor(palette, band.colorIndex);
  const companionColor = paletteColor(palette, band.companionIndex ?? band.colorIndex);
  const undertone = blendColor(color, companionColor, band.colorBlend ?? 0.16);
  const window = bandWindow(band, t);
  const rawReveal = smoothstep(band.revealDelay, band.revealDelay + band.revealDuration, fieldAge);
  const reveal = easeOutQuart(rawReveal);
  if (reveal <= 0.001) return;

  let activeTip = window.tip;
  let activeDirection = band.travelDirection;
  if (reveal < 0.999) {
    const overshoot = width * 0.24;
    const revealHead = band.revealDirection > 0
      ? mix(-overshoot, width + overshoot, reveal)
      : mix(width + overshoot, -overshoot, reveal);
    if (band.revealDirection > 0) {
      window.xStart = Math.max(window.xStart, 0);
      window.xEnd = Math.min(window.xEnd, revealHead);
    } else {
      window.xStart = Math.max(window.xStart, revealHead);
      window.xEnd = Math.min(window.xEnd, width);
    }
    window.isRevealing = true;
    window.revealProgress = reveal;
    window.visibility *= smoothstep(0, 0.11, rawReveal);
    activeTip = revealHead;
    activeDirection = band.revealDirection;
  }
  if (window.visibility < 0.004 || window.xEnd <= window.xStart) return;

  const entryFlare = Math.exp(-(((window.cycle - 0.13) / 0.065) ** 2)) * band.flare;
  const brightnessNoise = smoothNoise(t * band.frequency * 0.42, band.noiseSeed + 79) * 2 - 1;
  const ignition = smoothstep(0.01, 0.1, fieldAge) * (1 - smoothstep(0.4, 1.3, fieldAge));
  const flickerSettle = mix(0.18, 1, smoothstep(0.45, 1.3, fieldAge));
  const localPulse = 1 + brightnessNoise * 0.035 * flicker * flickerSettle;
  const alpha = Math.min(0.98, band.bright * intensity * window.visibility * localPulse * (1 + entryFlare * 0.45 + ignition * (0.35 + band.flare * 0.9)));

  c.save();
  c.fillStyle = beamFill(c, color, alpha * 0.5, window, band.transient);
  traceRibbon(c, band, y, h, window.xStart, window.xEnd, perspective, t);
  c.fill();

  c.fillStyle = beamFill(c, undertone, alpha * 0.18, window, band.transient);
  traceRibbon(c, band, y - h * 0.18, h * 0.48, window.xStart, window.xEnd, perspective, t);
  c.fill();

  c.fillStyle = beamFill(c, tint(color, 0.16), alpha * 0.24, window, band.transient);
  traceRibbon(c, band, y + h * 0.11, h * 0.62, window.xStart, window.xEnd, perspective, t);
  c.fill();

  c.fillStyle = beamFill(c, tint(color, band.bright > 0.72 ? 0.55 : 0.3), alpha * 0.38, window, band.transient);
  traceRibbon(c, band, y + h * 0.2, Math.max(0.7, h * 0.105), window.xStart, window.xEnd, perspective, t);
  c.fill();

  if (h > 14 && band.bright > 0.52) {
    c.save();
    c.globalCompositeOperation = "screen";
    c.shadowBlur = Math.min(20, h * 0.3);
    c.shadowColor = rgba(color, alpha * 0.5);
    c.fillStyle = beamFill(c, tint(color, 0.6), alpha * 0.15, window, band.transient);
    traceRibbon(c, band, y + h * 0.16, h * 0.12, window.xStart, window.xEnd, perspective, t);
    c.fill();
    c.restore();
  }

  for (const line of band.lineDetails) {
    const lineY = y - h / 2 + line.y * h;
    const lineColor = detailColor(palette, band, line.colorIndex);
    const shimmer = mix(0.88, 1.08, smoothNoise(t * 0.16, band.noiseSeed + line.phase * 100));
    const lineAlpha = line.alpha * alpha * shimmer;
    const lineHeight = Math.max(0.35, Math.min(1.8, line.thickness * (0.72 + h / 85)));
    let lineStart = window.xStart;
    let lineEnd = window.xEnd;
    let style = beamFill(c, lineColor, lineAlpha, window, band.transient);

    if (line.segment && (!window.isRevealing || reveal > 0.82)) {
      const segmentWidth = line.span * width;
      const drift = t * line.drift * 150 * band.motion;
      const segmentX = ((line.x * width + drift + width * 1.6) % (width * 1.6)) - width * 0.3;
      lineStart = Math.max(lineStart, segmentX);
      lineEnd = Math.min(lineEnd, segmentX + segmentWidth);
      if (lineEnd <= lineStart) continue;
      const segmentGradient = c.createLinearGradient(lineStart, 0, lineEnd, 0);
      segmentGradient.addColorStop(0, rgba(lineColor, 0));
      segmentGradient.addColorStop(0.3, rgba(lineColor, lineAlpha));
      segmentGradient.addColorStop(0.7, rgba(lineColor, lineAlpha * 0.85));
      segmentGradient.addColorStop(1, rgba(lineColor, 0));
      style = segmentGradient;
    }

    strokeCurvedLine(c, band, lineY, lineStart, lineEnd, perspective, t, lineHeight, style);
  }

  if ((band.transient || reveal < 0.999) && activeTip > -width * 0.1 && activeTip < width * 1.1) {
    const tipLength = width * mix(0.32, 0.78, ignition);
    const tipStart = activeDirection > 0 ? activeTip - tipLength : activeTip;
    const tipEnd = activeDirection > 0 ? activeTip : activeTip + tipLength;
    const tipGradient = c.createLinearGradient(tipStart, 0, tipEnd, 0);
    tipGradient.addColorStop(0, rgba(tint(color, 0.75), 0));
    tipGradient.addColorStop(activeDirection > 0 ? 0.74 : 0.26, rgba(tint(color, 0.85), alpha * mix(0.9, 1.35, ignition)));
    tipGradient.addColorStop(1, rgba(tint(color, 0.75), 0));
    c.save();
    c.globalCompositeOperation = "screen";
    strokeCurvedLine(c, band, y + h * 0.12, tipStart, tipEnd, perspective, t, Math.max(0.8, h * 0.075), tipGradient);
    c.restore();
  }

  if (flicker > 0) {
    c.save();
    c.globalCompositeOperation = "screen";
    for (const patch of band.patches) {
      const wave = smoothNoise(t * patch.frequency * 0.18, patch.noiseSeed);
      const harmonic = smoothNoise(t * patch.frequency * 0.42, patch.noiseSeed + 113);
      const sparkNoise = smoothNoise(t * patch.frequency * 0.7, patch.noiseSeed + 271);
      const pulse = smoothstep(0.34, 0.9, wave * 0.68 + harmonic * 0.32)
        + smoothstep(0.78, 0.98, sparkNoise) ** 3 * 0.85;
      const patchAlpha = Math.min(0.32, pulse * patch.strength * flicker * alpha * 0.16);
      if (patchAlpha < 0.008) continue;
      const patchWidth = patch.width * width;
      const drift = Math.sin(t * 0.38 * band.motion + patch.phase) * width * 0.052;
      const patchX = patch.x * width - patchWidth / 2 + drift;
      const patchStart = Math.max(window.xStart, patchX);
      const patchEnd = Math.min(window.xEnd, patchX + patchWidth);
      if (patchEnd <= patchStart) continue;
      const patchY = y - h / 2 + patch.y * h;
      const patchHeight = Math.max(0.8, patch.height * h * 0.32);
      const glow = c.createLinearGradient(patchStart, 0, patchEnd, 0);
      glow.addColorStop(0, rgba(color, 0));
      glow.addColorStop(0.3, rgba(tint(color, 0.65), patchAlpha));
      glow.addColorStop(0.7, rgba(tint(color, 0.25), patchAlpha * 0.82));
      glow.addColorStop(1, rgba(color, 0));
      strokeCurvedLine(c, band, patchY, patchStart, patchEnd, perspective, t, patchHeight, glow);
    }
    c.restore();
  }
  c.restore();
}

function drawPassingStreaks(c, time, palette, intensity, speed, perspective, fieldAge) {
  const reveal = smoothstep(0.12, 0.6, fieldAge);
  if (reveal <= 0.002 || !passingStreaks.length) return;

  const t = time * 0.001 * speed;
  c.save();
  c.globalCompositeOperation = "screen";

  for (const streak of passingStreaks) {
    const rawCycle = streak.phase + t * streak.rate;
    const lap = Math.floor(rawCycle);
    const cycle = fract(rawCycle);
    const visibility = smoothstep(0.015, 0.12, cycle) * (1 - smoothstep(0.76, 0.985, cycle)) * reveal;
    if (visibility <= 0.004) continue;

    const length = width * streak.length;
    const head = mix(-width * 0.18, width * 1.24 + length, cycle);
    const start = head - length;
    const end = head;
    if (end < -width * 0.08 || start > width * 1.08) continue;

    const yShift = hashNoise(streak.noiseSeed + lap * 19.19) * 0.54 - 0.27;
    const y = clamp(streak.y + yShift, 0.025, 0.975) * height
      + (smoothNoise(t * 0.045 * streak.motion, streak.noiseSeed + lap * 31.7) * 2 - 1) * height * 0.0035;
    const thickness = Math.max(0.45, streak.thickness * height * mix(0.82, 1.22, hashNoise(streak.noiseSeed + lap * 7.7)));
    const baseColor = paletteColor(palette, streak.colorIndex);
    const companionColor = paletteColor(palette, streak.companionIndex);
    const color = blendColor(baseColor, companionColor, streak.colorBlend);
    const pulse = mix(0.82, 1.28, smoothNoise(t * 0.24 * streak.motion, streak.noiseSeed + lap * 13.9));
    const alpha = Math.min(0.76, streak.alpha * intensity * visibility * pulse * streak.flare);
    const edge = streak.edge;

    const glow = c.createLinearGradient(start, 0, end, 0);
    glow.addColorStop(0, rgba(color, 0));
    glow.addColorStop(edge, rgba(tint(color, 0.45), alpha * 0.48));
    glow.addColorStop(0.68, rgba(tint(color, 0.12), alpha * 0.38));
    glow.addColorStop(1, rgba(color, 0));
    c.fillStyle = glow;
    traceRibbon(c, streak, y, thickness * 2.8, start, end, perspective, t);
    c.fill();

    const core = c.createLinearGradient(start, 0, end, 0);
    core.addColorStop(0, rgba(color, 0));
    core.addColorStop(Math.min(0.58, edge + 0.12), rgba(tint(color, 0.75), alpha * 1.28));
    core.addColorStop(0.78, rgba(tint(color, 0.35), alpha * 0.82));
    core.addColorStop(1, rgba(color, 0));
    strokeCurvedLine(c, streak, y, start, end, perspective, t, Math.max(0.5, thickness * 0.16), core);

    if (thickness > 5 || alpha > 0.18) {
      const hairline = c.createLinearGradient(start, 0, end, 0);
      hairline.addColorStop(0, rgba(companionColor, 0));
      hairline.addColorStop(0.35, rgba(tint(companionColor, 0.68), alpha * 0.52));
      hairline.addColorStop(0.72, rgba(tint(companionColor, 0.2), alpha * 0.34));
      hairline.addColorStop(1, rgba(companionColor, 0));
      strokeCurvedLine(c, streak, y + thickness * 0.38, start, end, perspective, t, Math.max(0.35, thickness * 0.07), hairline);
    }
  }

  c.restore();
}

function drawOpeningBurst(c, time, palette, intensity, speed) {
  const fieldAge = Math.max(0, (time - fieldRevealStartedAt) * 0.001);
  const burst = smoothstep(0.005, 0.05, fieldAge) * (1 - smoothstep(0.4, 1.5, fieldAge));
  if (burst <= 0.002) return;

  c.save();
  c.globalCompositeOperation = "screen";

  const wash = c.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, rgba(paletteColor(palette, 0), 0));
  wash.addColorStop(0.44, rgba(palette.accent, burst * intensity * 0.1));
  wash.addColorStop(0.54, rgba(paletteColor(palette, 1), burst * intensity * 0.14));
  wash.addColorStop(1, rgba(paletteColor(palette, 0), 0));
  c.fillStyle = wash;
  c.fillRect(0, 0, width, height);

  for (let index = 0; index < 16; index += 1) {
    const noiseSeed = seed * 0.001 + index * 17.37;
    const y = mix(height * 0.08, height * 0.92, hashNoise(noiseSeed + 2.1));
    const thickness = height * mix(0.006, 0.055, hashNoise(noiseSeed + 9.4) ** 1.5);
    const direction = 1;
    const lag = index * 0.006 + hashNoise(noiseSeed + 12.8) * 0.02;
    const progress = easeOutCubic((fieldAge - lag) / mix(0.13, 0.3, hashNoise(noiseSeed + 20.2)));
    if (progress <= 0 || progress >= 1.02) continue;

    const head = direction > 0
      ? mix(-width * 0.72, width * 1.75, progress)
      : mix(width * 1.38, -width * 0.32, progress);
    const tailLength = width * mix(0.42, 0.95, hashNoise(noiseSeed + 41.6));
    const start = direction > 0 ? head - tailLength : head;
    const end = direction > 0 ? head : head + tailLength;
    const colorRoll = hashNoise(noiseSeed + 61.4);
    const color = colorRoll < 0.32
      ? palette.accent
      : colorRoll < 0.32 + palette.colorRange * 0.44
        ? hashedGroupColor(palette, "secondary", noiseSeed + 72.9)
        : hashedGroupColor(palette, index % 2 === 0 ? "chrome" : "modal", noiseSeed + 83.6);
    const alpha = burst * intensity * mix(0.16, 0.48, hashNoise(noiseSeed + 90.5)) * mix(0.8, 1.25, speed / 8);
    const gradient = c.createLinearGradient(start, 0, end, 0);
    gradient.addColorStop(0, rgba(tint(color, 0.55), 0));
    gradient.addColorStop(direction > 0 ? 0.68 : 0.32, rgba(tint(color, 0.82), alpha));
    gradient.addColorStop(1, rgba(tint(color, 0.55), 0));

    c.fillStyle = gradient;
    c.fillRect(Math.min(start, end), y - thickness * 0.5, Math.abs(end - start), Math.max(1, thickness));

    const coreAlpha = alpha * 1.7;
    const core = c.createLinearGradient(start, 0, end, 0);
    core.addColorStop(0, rgba(color, 0));
    core.addColorStop(direction > 0 ? 0.74 : 0.26, rgba(tint(color, 0.92), coreAlpha));
    core.addColorStop(1, rgba(color, 0));
    strokeCurvedLine(c, { motion: 1, noiseSeed }, y, Math.min(start, end), Math.max(start, end), 0, time * 0.001, Math.max(0.8, thickness * 0.08), core);
  }

  c.restore();
}

// A single hard exposure at ignition: a white-green slit snaps open across the frame
// and blooms into a brief wash before the beams take over.
function drawIgnitionFlash(c, palette, intensity, fieldAge) {
  const flash = smoothstep(0.02, 0.05, fieldAge) * (1 - smoothstep(0.07, 0.42, fieldAge));
  if (flash <= 0.002) return;

  c.save();
  c.globalCompositeOperation = "screen";
  const centerY = height * mix(0.38, 0.62, hashNoise(seed * 0.001 + 4.4));
  const spread = height * mix(0.004, 0.5, easeOutQuart(fieldAge / 0.38));
  const bloom = c.createLinearGradient(0, centerY - spread, 0, centerY + spread);
  bloom.addColorStop(0, rgba(palette.accent, 0));
  bloom.addColorStop(0.5, rgba(tint(palette.accent, 0.35), flash * intensity * 0.42));
  bloom.addColorStop(1, rgba(palette.accent, 0));
  c.fillStyle = bloom;
  c.fillRect(0, centerY - spread, width, spread * 2);

  const slit = c.createLinearGradient(0, 0, width, 0);
  slit.addColorStop(0, rgba([255, 255, 255], 0));
  slit.addColorStop(0.5, rgba([255, 255, 255], flash * intensity * 0.95));
  slit.addColorStop(1, rgba([255, 255, 255], 0));
  c.fillStyle = slit;
  c.fillRect(0, centerY - 1.5, width, 3);
  c.restore();
}

function render(time, c = ctx) {
  if (!width || !height) return;
  const palette = activePalette();
  const intensity = Number(controls.intensity.value) / 72;
  // Deliberately extreme response: the slider now drives four times its original velocity.
  const fieldAge = Math.max(0, (time - fieldRevealStartedAt) * 0.001);
  const launchSurge = 1 + smoothstep(0.005, 0.05, fieldAge) * (1 - smoothstep(0.45, 1.6, fieldAge)) * 4.2;
  const speed = (Number(controls.speed.value) / 9.5) * launchSurge;
  const flicker = Number(controls.flicker.value) / 100;
  const perspective = 0;

  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.fillStyle = `rgb(${palette.base.join(",")})`;
  c.fillRect(0, 0, width, height);

  if (fieldAge < 0.02) return;

  // A shallow black structure keeps the field architectural and prevents a foggy gradient look.
  const baseStructure = c.createLinearGradient(0, 0, 0, height);
  baseStructure.addColorStop(0, "rgba(0,0,0,0.42)");
  baseStructure.addColorStop(0.28, "rgba(0,0,0,0.08)");
  baseStructure.addColorStop(0.54, "rgba(0,0,0,0.58)");
  baseStructure.addColorStop(0.75, "rgba(0,0,0,0.15)");
  baseStructure.addColorStop(1, "rgba(0,0,0,0.48)");
  c.fillStyle = baseStructure;
  c.fillRect(0, 0, width, height);

  drawOpeningBurst(c, time, palette, intensity, speed);

  for (const band of bands) drawBand(c, band, time, palette, intensity, speed, flicker, perspective);

  drawOpeningBurst(c, time, palette, intensity * 0.7, speed);
  drawPassingStreaks(c, time, palette, intensity, speed, perspective, fieldAge);
  drawIgnitionFlash(c, palette, intensity, fieldAge);

  // Sparse, very long fragments create compressed motion without turning into particles.
  c.save();
  c.globalCompositeOperation = "screen";
  const t = time * 0.001 * speed;
  for (const mote of motes) {
    const span = mote.width * width;
    const cycle = width + span * 2;
    const travel = mote.x * width + t * 330 * mote.speed;
    const lap = Math.floor(travel / cycle);
    const x = (travel % cycle) - span;
    const evolvedY = fract(mote.y + hashNoise(mote.noiseSeed + lap * 17.17) * 0.78);
    const y = evolvedY * height;
    const evolvedColor = (mote.colorIndex + Math.floor(hashNoise(mote.noiseSeed + lap * 31.9) * palette.colors.length)) % palette.colors.length;
    const color = paletteColor(palette, evolvedColor);
    const pulse = smoothNoise(t * 0.34 * mote.speed, mote.noiseSeed + lap * 13.7);
    const fieldReveal = smoothstep(0.3, 1.4, fieldAge);
    const alpha = mote.alpha * intensity * mix(0.55, 1.18, pulse) * fieldReveal;
    const trail = c.createLinearGradient(x, 0, x + span, 0);
    trail.addColorStop(0, rgba(color, 0));
    trail.addColorStop(0.3, rgba(color, alpha));
    trail.addColorStop(0.7, rgba(color, alpha * 0.72));
    trail.addColorStop(1, rgba(color, 0));
    strokeCurvedLine(c, mote, y, x, x + span, perspective, t, 0.7, trail);
  }
  c.restore();

  // Fine optical scan texture, intentionally crisp and very low contrast.
  if (c.isVector) {
    c.fillStyle = c.createScanlinePattern(0.025, 0.13);
    c.fillRect(0, 0, width, height);
  } else {
    c.fillStyle = "rgba(255,255,255,0.025)";
    for (let y = 0.5; y < height; y += 4) c.fillRect(0, y, width, 0.45);
    c.fillStyle = "rgba(0,0,0,0.13)";
    for (let y = 2.5; y < height; y += 4) c.fillRect(0, y, width, 0.65);
  }
}

function animate(now) {
  render(now - startTime);
  if (running) animationId = requestAnimationFrame(animate);
}

function setRunning(nextRunning) {
  if (running === nextRunning) return;
  running = nextRunning;
  const button = document.querySelector("#pauseBtn");
  const label = document.querySelector("#statusLabel");
  const dot = document.querySelector(".status-dot");

  if (running) {
    startTime = performance.now() - frozenTime;
    button.classList.remove("is-paused");
    button.setAttribute("aria-label", "Pause animation");
    if (label) label.textContent = "Live field";
    if (dot) dot.style.background = "#7fee64";
    animationId = requestAnimationFrame(animate);
  } else {
    frozenTime = performance.now() - startTime;
    cancelAnimationFrame(animationId);
    button.classList.add("is-paused");
    button.setAttribute("aria-label", "Play animation");
    if (label) label.textContent = "Field held";
    if (dot) dot.style.background = "#c9c7c2";
    render(frozenTime);
  }
}

function updateRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  input.style.setProperty("--fill", `${((value - min) / (max - min)) * 100}%`);
  const output = document.querySelector(`#${input.id}Out`);
  if (output) output.value = input.id === "angle" ? `${value < 0 ? "−" : value > 0 ? "+" : ""}${Math.abs(value)}°` : value;
}

Object.values(controls).forEach((control) => {
  if (!control) return;
  if (control.type === "range") updateRange(control);
  const eventName = control.type === "range" ? "input" : "change";
  control.addEventListener(eventName, () => {
    if (control.type === "range") updateRange(control);
    if (control === controls.density || control === controls.colorRange) buildField();
    else render(currentTime());
  });
});

document.querySelector("#seedBtn").addEventListener("click", () => {
  seed = Math.floor(Math.random() * 999999) + 1;
  buildField();
});

document.querySelector("#pauseBtn").addEventListener("click", () => setRunning(!running));

// Inside a claude.ai artifact, files go through the downloads capability; opened
// locally, fall back to a plain link download.
const downloadsReady = window.claude?.use ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);

function fileStem() {
  return `velocity-field-${String(seed).padStart(6, "0")}`;
}

async function saveFile(filename, blob) {
  const downloads = await downloadsReady;
  if (downloads) {
    downloads.save({ filename, data: blob }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector("#saveBtn").addEventListener("click", () => {
  render(currentTime());
  canvas.toBlob((blob) => saveFile(`${fileStem()}.png`, blob), "image/png");
});

// Export is fixed to the 16" x 8" seating backdrop panel (a 2:1 ratio) rather than
// whatever shape the browser window happens to be — the backdrop is what this feeds.
const EXPORT_ASPECT_RATIO = 16 / 8;
const EXPORT_WIDTH = 1600;
const EXPORT_HEIGHT = Math.round(EXPORT_WIDTH / EXPORT_ASPECT_RATIO);

// Freezes the current instant into real vector markup — the same ribbons, gradients,
// and streaks the canvas draws, run through an SVG-emitting context instead of pixels.
// Bands/streaks/motes are stored as fractions of the live width/height, so temporarily
// swapping those globals re-projects the same field into the export's own dimensions.
function buildFieldSVG(time, exportWidth = EXPORT_WIDTH, exportHeight = EXPORT_HEIGHT) {
  const recorder = new SVGRecorder(exportWidth, exportHeight);
  const liveWidth = width;
  const liveHeight = height;
  width = exportWidth;
  height = exportHeight;
  try {
    render(time, recorder);
  } finally {
    width = liveWidth;
    height = liveHeight;
  }
  return recorder.toSVG();
}

document.querySelector("#exportSvgBtn").addEventListener("click", () => {
  const time = currentTime();
  const svgMarkup = buildFieldSVG(time);
  saveFile(`${fileStem()}.svg`, new Blob([svgMarkup], { type: "image/svg+xml" }));
});

// Recording restarts the current seed from its black frame so the capture always
// opens on the ignition burst, then streams the live canvas until stopped.
const recordBtn = document.querySelector("#recordBtn");
let recorder = null;

function pickRecordingType() {
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return types.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  const mimeType = pickRecordingType();
  if (!window.MediaRecorder || !canvas.captureStream) {
    recordBtn.disabled = true;
    recordBtn.title = "Recording isn't supported in this browser";
    return;
  }

  setRunning(true);
  const stream = canvas.captureStream(60);
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 40_000_000 });
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const type = recorder.mimeType || mimeType || "video/webm";
    const blob = new Blob(chunks, { type });
    saveFile(`${fileStem()}.${type.includes("mp4") ? "mp4" : "webm"}`, blob);
    recorder = null;
  };

  recorder.start();
  buildField();
  recordBtn.classList.add("is-recording");
  recordBtn.querySelector(".label").textContent = "Stop";
  recordBtn.title = "Stop recording";
}

function stopRecording() {
  if (!recorder) return;
  recorder.stop();
  recordBtn.classList.remove("is-recording");
  recordBtn.querySelector(".label").textContent = "Record";
  recordBtn.title = "Record from ignition";
}

recordBtn.addEventListener("click", () => (recorder ? stopRecording() : startRecording()));

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    setRunning(!running);
  }
  if (event.key.toLowerCase() === "r") {
    seed = Math.floor(Math.random() * 999999) + 1;
    buildField();
  }
});

resize();
buildField();
if (running) animationId = requestAnimationFrame(animate);
else {
  document.querySelector("#pauseBtn").classList.add("is-paused");
  const statusLabel = document.querySelector("#statusLabel");
  if (statusLabel) statusLabel.textContent = "Reduced motion";
}
