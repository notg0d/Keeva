type Mode = { m: number; n: number; symmetry: number };
type Ripple = { x: number; y: number; age: number };

const modes: readonly [Mode, ...Mode[]] = [
  { m: 5, n: 3, symmetry: 1 },
  { m: 4, n: 2, symmetry: -.8 },
  { m: 7, n: 3, symmetry: .72 },
  { m: 3, n: 1, symmetry: -1 },
  { m: 6.4, n: 3.2, symmetry: .55 },
];
const fieldSize = 512;
const settleDelay = .18;
const settleFade = .8;
const fullTurn = Math.PI * 2;
const sine = Float32Array.from({ length: 4096 }, (_, i) => Math.sin(i / 4096 * fullTurn));
const sinPi = (value: number) => sine[(value * 2048) & 4095]!;
const reflect = (value: number) => value < 0 ? -value : value > 1 ? 2 - value : value;

/** Decorative vibrating-plate simulation. Grains slow down at the standing wave's nodes. */
export function createHeroParticleField(background: HTMLCanvasElement, foreground: HTMLCanvasElement) {
  const fieldContext = background.getContext('2d', { alpha: true });
  const trailContext = foreground.getContext('2d', { alpha: true });
  if (!fieldContext || !trailContext) return null;

  const compact = window.matchMedia('(pointer: coarse)').matches || navigator.hardwareConcurrency <= 4;
  const frameInterval = 1000 / (compact ? 24 : 30);
  const pixelBudget = compact ? 360_000 : 850_000;
  const maximumGrains = compact ? 20_000 : 58_000;
  const standingWave = new Float32Array(fieldSize * fieldSize);
  const modeX = new Float32Array(fieldSize);
  const mirrorX = new Float32Array(fieldSize);
  let trailX = new Float32Array(2048);
  let trailY = new Float32Array(2048);
  let trailLife = new Float32Array(2048);
  let trailSettled = new Float32Array(2048);
  let grains = new Float32Array(0);
  let pixels: ImageData | null = null;
  let trailPixels: ImageData | null = null;
  let width = 0;
  let height = 0;
  let count = 0;
  let trailCount = 0;
  let trailScale = 1;
  let frame = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let warmup = 12;
  let visible = false;
  let paused = false;
  let modeIndex = 0;
  let mode = { ...modes[0] };
  let from = { ...mode };
  let transition = 1;
  let ripple: Ripple | null = null;
  let pointer: { x: number; y: number } | null = null;

  const rebuildWave = () => {
    const yScale = Math.max(1, height / Math.max(width, 720));
    for (let x = 0; x < fieldSize; x++) {
      modeX[x] = sinPi(mode.m * x / (fieldSize - 1));
      mirrorX[x] = mode.symmetry * sinPi(mode.n * x / (fieldSize - 1));
    }
    for (let y = 0; y < fieldSize; y++) {
      const a = sinPi(mode.n * y / (fieldSize - 1) * yScale);
      const b = sinPi(mode.m * y / (fieldSize - 1) * yScale);
      for (let x = 0; x < fieldSize; x++) standingWave[y * fieldSize + x] = modeX[x]! * a + mirrorX[x]! * b;
    }
  };
  const wave = (x: number, y: number) => Math.abs(standingWave[((y * (fieldSize - 1)) | 0) * fieldSize + ((x * (fieldSize - 1)) | 0)]!);

  const clearTrail = () => {
    trailCount = 0; pointer = null; ripple = null;
    if (trailPixels) for (let i = 3; i < trailPixels.data.length; i += 4) trailPixels.data[i] = 0;
    trailContext.clearRect(0, 0, width, height);
  };

  const simulate = (delta: number, paint: boolean) => {
    if (!pixels) return;
    const data = pixels.data;
    const rowWidth = pixels.width;
    const pixelWidth = rowWidth - 1; const pixelHeight = pixels.height - 1;
    const walkScale = Math.sqrt(delta);
    const radius = ripple ? ripple.age * 410 : 0;
    for (let i = 0; i < count * 2; i += 2) {
      let x = grains[i]!; let y = grains[i + 1]!;
      const amplitude = Math.max(.00065, Math.abs(wave(x, y)) * .013) * walkScale;
      x += (Math.random() * 2 - 1) * amplitude;
      y += (Math.random() * 2 - 1) * amplitude;
      if (ripple) {
        const dx = x * width - ripple.x; const dy = y * height - ripple.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const band = Math.max(0, 1 - Math.abs(distance - radius) / 42);
        if (distance > 1 && band > 0) {
          const force = band * band * (1 - ripple.age / 1.8) * 3.5 * delta;
          x += dx / distance * force / width; y += dy / distance * force / height;
        }
      }
      x = reflect(x); y = reflect(y);
      grains[i] = x; grains[i + 1] = y;
      if (paint) {
        const offset = (((y * pixelHeight) | 0) * rowWidth + ((x * pixelWidth) | 0)) * 4 + 3;
        data[offset] = data[offset]! + 46;
      }
    }
  };

  const drawTrail = (delta: number, seconds: number) => {
    if ((!trailCount && !ripple) || !trailPixels) return;
    const data = trailPixels.data;
    const pixelWidth = trailPixels.width; const pixelHeight = trailPixels.height;
    const decay = .87 ** delta;
    // Truncate decay so clamped-byte rounding cannot leave permanent afterimages.
    for (let i = 3; i < data.length; i += 4) data[i] = (data[i]! * decay) | 0;
    let active = 0;
    const walkScale = Math.sqrt(delta);
    const nearFlow = 1 - Math.exp(-delta * .008);
    const farFlow = 1 - Math.exp(-delta * .16);
    const gridX = (fieldSize - 1) / width; const gridY = (fieldSize - 1) / height;
    const size = Math.max(1, Math.round(trailScale));
    for (let i = 0; i < trailCount; i++) {
      const px = trailX[i]!; const py = trailY[i]!;
      const distance = pointer ? Math.hypot(px * width - pointer.x, py * height - pointer.y) : 600;
      const far = pointer ? Math.min(1, Math.max(0, (distance - 120) / 360)) : 1;
      const life = trailLife[i]! - seconds;
      if (life <= 0) continue;
      // Follow the signed field downhill to its zero crossings, in CSS-pixel space.
      const sx = px * (fieldSize - 1); const sy = py * (fieldSize - 1);
      const ix = Math.min(fieldSize - 2, sx | 0); const iy = Math.min(fieldSize - 2, sy | 0);
      const fx = sx - ix; const fy = sy - iy;
      const offset = iy * fieldSize + ix;
      const a = standingWave[offset]!; const b = standingWave[offset + 1]!;
      const c = standingWave[offset + fieldSize]!; const d = standingWave[offset + fieldSize + 1]!;
      const value = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
      const gx = ((b - a) * (1 - fy) + (d - c) * fy) * gridX;
      const gy = ((c - a) * (1 - fx) + (d - b) * fx) * gridY;
      const gradient = Math.max(.00001, Math.hypot(gx, gy));
      // Require a brief stay on the line, then finish fading even if the pattern moves.
      const settled = trailSettled[i]! >= settleDelay || Math.abs(value) / gradient < 3
        ? trailSettled[i]! + seconds : 0;
      if (settled >= settleDelay + settleFade) continue;
      const normalX = gx / gradient; const normalY = gy / gradient;
      const flow = nearFlow + (farFlow - nearFlow) * far * far;
      const pull = Math.max(-80, Math.min(80, value / gradient)) * flow;
      // Collected grains gently wander along the line as they fade into the field.
      const tangent = (Math.random() * 2 - 1) * (1 + far * 2.5) * walkScale;
      const jitter = (.85 + Math.min(4, Math.abs(value) * 5) * (1 - far * .7)) * walkScale;
      const nx = reflect(px + (-normalX * pull - normalY * tangent + (Math.random() * 2 - 1) * jitter) / width);
      const ny = reflect(py + (-normalY * pull + normalX * tangent + (Math.random() * 2 - 1) * jitter) / height);
      trailX[active] = nx; trailY[active] = ny; trailLife[active] = life;
      trailSettled[active] = settled;
      active++;
      const x = (nx * (pixelWidth - size)) | 0;
      const y = (ny * (pixelHeight - size)) | 0;
      const mergeFade = 1 - Math.max(0, (settled - settleDelay) / settleFade);
      const opacity = Math.min(1, life / 2.4) * mergeFade * mergeFade * 130;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const offset = ((y + dy) * pixelWidth + x + dx) * 4;
        data[offset] = i % 7 === 0 ? 227 : 185;
        data[offset + 1] = i % 7 === 0 ? 247 : 225;
        data[offset + 2] = i % 7 === 0 ? 204 : 158;
        data[offset + 3] = data[offset + 3]! + opacity;
      }
    }
    trailContext.putImageData(trailPixels, 0, 0);
    trailCount = active;
    if (ripple) {
      const fade = Math.max(0, 1 - ripple.age / 1.8);
      trailContext.lineWidth = .65;
      trailContext.strokeStyle = `rgba(214, 245, 191, ${fade * fade * .11})`;
      for (const lag of [0, 12]) {
        trailContext.beginPath();
        trailContext.arc(ripple.x, ripple.y, Math.max(0, ripple.age * 410 - lag), 0, fullTurn);
        trailContext.stroke();
      }
    }
    if (!trailCount && !ripple) trailContext.clearRect(0, 0, width, height);
  };

  const draw = (now: number) => {
    frame = 0;
    if (!visible || paused || !pixels) return;
    frame = requestAnimationFrame(draw);
    if (lastFrame && now - lastFrame < frameInterval - 1) return;
    const seconds = lastFrame ? (now - lastFrame) / 1000 : frameInterval / 1000;
    lastFrame = now; elapsed += seconds;
    const delta = Math.min(seconds * 60, 3.6);
    if (transition < 1) {
      transition = Math.min(1, transition + seconds / 2.2);
      const ease = transition * transition * (3 - 2 * transition);
      const target = modes[modeIndex]!;
      mode = { m: from.m + (target.m - from.m) * ease, n: from.n + (target.n - from.n) * ease,
        symmetry: from.symmetry + (target.symmetry - from.symmetry) * ease };
      rebuildWave();
    }
    if (ripple) { ripple.age += seconds; if (ripple.age >= 1.8) ripple = null; }
    const decay = .89 ** delta;
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = (pixels.data[i]! * decay) | 0;
    if (warmup > 0) {
      const steps = Math.min(4, warmup);
      for (let i = 0; i < steps; i++) simulate(1, false);
      warmup -= steps;
    }
    simulate(delta, true);
    fieldContext.putImageData(pixels, 0, 0);
    drawTrail(delta, seconds);
    if (elapsed - seconds < 1.2) background.style.opacity = String(Math.min(1, elapsed / 1.2));
  };

  const sync = () => {
    if (visible && !paused && pixels) {
      if (!frame) { lastFrame = 0; frame = requestAnimationFrame(draw); }
    } else {
      cancelAnimationFrame(frame); frame = 0; lastFrame = 0; clearTrail();
    }
  };

  const emit = (x: number, y: number, amount: number, spread: number) => {
    if (trailCount + amount > trailX.length) {
      const length = Math.max(trailCount + amount, trailX.length * 2);
      const grow = (buffer: Float32Array) => { const next = new Float32Array(length); next.set(buffer); return next; };
      trailX = grow(trailX); trailY = grow(trailY); trailLife = grow(trailLife);
      trailSettled = grow(trailSettled);
    }
    for (let i = 0; i < amount; i++) {
      const index = trailCount++;
      const angle = Math.random() * fullTurn;
      const radius = Math.sqrt(Math.random()) * spread;
      trailX[index] = Math.max(0, Math.min(1, (x + Math.cos(angle) * radius) / width));
      trailY[index] = Math.max(0, Math.min(1, (y + Math.sin(angle) * radius) / height));
      trailLife[index] = 7 + Math.random() * 2;
      trailSettled[index] = 0;
    }
  };

  return {
    resize(nextWidth: number, nextHeight: number) {
      if (nextWidth <= 0 || nextHeight <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = Math.min(dpr, Math.sqrt(pixelBudget / (nextWidth * nextHeight)));
      const w = Math.max(1, Math.round(nextWidth * scale)); const h = Math.max(1, Math.round(nextHeight * scale));
      if (width === nextWidth && height === nextHeight && background.width === w && background.height === h) return;
      width = nextWidth; height = nextHeight;
      background.width = w; background.height = h;
      pixels = fieldContext.createImageData(w, h);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = 183; pixels.data[i + 1] = 222; pixels.data[i + 2] = 157;
      }
      count = Math.min(maximumGrains, Math.max(8000, Math.round(w * h * .075)));
      rebuildWave();
      grains = new Float32Array(count * 2);
      for (let i = 0; i < grains.length; i += 2) {
        let x = 0; let y = 0;
        for (let attempt = 0; attempt < 24; attempt++) {
          x = Math.random(); y = Math.random();
          const amplitude = wave(x, y);
          if (Math.random() < .018 / (.018 + amplitude * amplitude)) break;
        }
        grains[i] = x; grains[i + 1] = y;
      }
      trailScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1_800_000 / (width * height)));
      foreground.width = Math.max(1, Math.round(width * trailScale)); foreground.height = Math.max(1, Math.round(height * trailScale));
      trailContext.setTransform(trailScale, 0, 0, trailScale, 0, 0);
      trailPixels = trailContext.createImageData(foreground.width, foreground.height);
      warmup = 12; clearTrail(); sync();
    },
    setVisible(value: boolean) { visible = value; sync(); },
    setPaused(value: boolean) { paused = value; sync(); },
    leave() { pointer = null; },
    stir(x: number, y: number) {
      if (!visible || paused || !width || !height) return;
      if (pointer) {
        const dx = x - pointer.x; const dy = y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 2) return;
        const steps = Math.max(1, Math.ceil(distance / 5));
        for (let i = 1; i <= steps; i++) emit(pointer.x + dx * i / steps, pointer.y + dy * i / steps, 38, 2.4);
      } else emit(x, y, 48, 2.4);
      pointer = { x, y };
    },
    shift(x = width * .36, y = height * .4) {
      if (!visible || paused || !width || !height) return;
      from = { ...mode }; modeIndex = (modeIndex + 1) % modes.length; transition = 0;
      pointer = { x, y };
      ripple = { x, y, age: 0 };
      emit(x, y, 640, 9);
    },
    destroy() {
      visible = false; cancelAnimationFrame(frame); frame = 0;
      clearTrail(); fieldContext.clearRect(0, 0, background.width, background.height);
      pixels = null; trailPixels = null; grains = new Float32Array(0);
    },
  };
}
