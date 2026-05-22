import { useEffect, useRef, useState } from 'react';

const HUD = {
  bg: '#000B14',
  cyan: '#00E5FF',
  cyanDim: 'rgba(0, 136, 170, 0.45)',
  cyanFaint: 'rgba(0, 229, 255, 0.12)',
  coreInner: '#1a3a52',
  coreOuter: '#061018',
};

const STATES = {
  INITIALISING: { label: 'INITIALISING', color: '#6b8a99' },
  LISTENING: { label: 'LISTENING', color: '#00FF7F' },
  THINKING: { label: 'THINKING', color: '#f59e0b' },
  SPEAKING: { label: 'SPEAKING', color: '#00E5FF' },
  MUTED: { label: 'MUTED', color: '#f472b6' },
};

/**
 * Iron Man–style HUD orb (no logo). Use `fill` + `containerRef` to size from parent.
 * @param {{
 *   state?: string;
 *   speaking?: boolean;
 *   muted?: boolean;
 *   levels?: number[];
 *   size?: number;
 *   fill?: boolean;
 *   containerRef?: import('react').RefObject<HTMLElement | null>;
 * }} props
 */
export function VoiceCore({
  state = 'INITIALISING',
  speaking = false,
  muted = false,
  levels = [],
  size = 320,
  fill = false,
  containerRef,
}) {
  const canvasRef = useRef(null);
  const [dims, setDims] = useState(size);
  const animRef = useRef({
    tick: 0,
    rings: [0, 72, 144, 216],
    scan: 0,
    scan2: 180,
    lastT: 0,
    blink: true,
    blinkTick: 0,
  });

  useEffect(() => {
    if (!fill) {
      setDims(size);
      return undefined;
    }
    const el = containerRef?.current;
    if (!el) return undefined;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.floor(Math.min(width, height) * 0.96);
      if (s > 0) setDims(Math.max(240, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, size, containerRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let raf = 0;

    const resize = () => {
      const w = dims;
      const h = dims;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const step = () => {
      const a = animRef.current;
      a.tick += 1;
      const now = performance.now() / 1000;
      const isSpeak = speaking || state === 'SPEAKING';
      const isMut = muted || state === 'MUTED';
      const speedMul = isSpeak ? 1.8 : 1;

      if (now - a.lastT > 0.016) {
        a.rings = a.rings.map((r, i) => (r + (0.35 + i * 0.12) * speedMul) % 360);
        a.scan = (a.scan + (isSpeak ? 2.2 : 0.9)) % 360;
        a.scan2 = (a.scan2 - (isSpeak ? 1.6 : 0.65)) % 360;
        a.lastT = now;
      }

      a.blinkTick += 1;
      if (a.blinkTick >= 40) {
        a.blink = !a.blink;
        a.blinkTick = 0;
      }

      drawHud(ctx, a, { state, speaking: isSpeak, muted: isMut, levels, size: dims });
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state, speaking, muted, levels, dims]);

  const meta = STATES[state] || STATES.INITIALISING;

  return (
    <div
      className="voice-core pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ background: HUD.bg }}
    >
      <canvas ref={canvasRef} className="block shrink-0" aria-label={`Voice core: ${meta.label}`} />
    </div>
  );
}

function drawHud(ctx, a, { state, speaking, muted, levels, size }) {
  const W = size;
  const H = size;
  const cx = W / 2;
  const cy = H / 2;
  const meta = STATES[state] || STATES.INITIALISING;
  const accent = muted ? '#f472b6' : HUD.cyan;
  const maxR = Math.min(W, H) * 0.46;

  ctx.clearRect(0, 0, W, H);

  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.35);
  bgGrad.addColorStop(0, '#0d2238');
  bgGrad.addColorStop(0.45, HUD.bg);
  bgGrad.addColorStop(1, '#000508');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  drawGrid(ctx, W, H);
  drawCornerBrackets(ctx, W, H, accent);

  ctx.strokeStyle = HUD.cyanFaint;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.08);
  ctx.lineTo(cx, H * 0.92);
  ctx.moveTo(W * 0.08, cy);
  ctx.lineTo(W * 0.92, cy);
  ctx.stroke();

  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.55);
  coreGrad.addColorStop(0, '#2a5f7a');
  coreGrad.addColorStop(0.35, HUD.coreInner);
  coreGrad.addColorStop(0.75, HUD.coreOuter);
  coreGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  drawCenterLabel(ctx, cx, cy, W);

  for (let i = 0; i < 5; i++) {
    const r = maxR * (0.32 + i * 0.09);
    const alpha = 0.12 + (speaking ? 0.15 : 0.05) - i * 0.015;
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
    ctx.lineWidth = i === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawTickRing(ctx, cx, cy, maxR * 0.98, 72, accent, 0.35);

  for (let ri = 0; ri < 3; ri++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((a.rings[ri] * Math.PI) / 180);
    const r = maxR * (0.62 + ri * 0.1);
    ctx.strokeStyle = `rgba(0, 229, 255, ${speaking ? 0.65 : 0.35})`;
    ctx.lineWidth = speaking ? 1.8 : 1.2;
    const segs = 4 + ri;
    for (let s = 0; s < segs; s++) {
      const start = (s / segs) * Math.PI * 2 + 0.15;
      const end = start + Math.PI * (0.12 + ri * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, r, start, end);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((a.scan * Math.PI) / 180);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = speaking ? 0.9 : 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, maxR * 0.72, -0.35, 0.55);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((a.scan2 * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, maxR * 0.82, 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  drawWaveform(ctx, cx, W, H, levels, speaking, muted, maxR, a.tick);

  const statusY = H - maxR * 0.14;
  const dotR = 4;
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx - 42, statusY, dotR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = `600 ${Math.max(10, W * 0.028)}px ui-monospace, monospace`;
  ctx.fillStyle = meta.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const sym = state === 'THINKING' && a.blink ? '◇' : '◈';
  ctx.fillText(`${sym} ${meta.label}`, cx - 28, statusY);
}

function drawCenterLabel(ctx, cx, cy, size) {
  const fontSize = Math.max(13, size * 0.042);
  ctx.save();
  ctx.font = `300 ${fontSize}px ui-monospace, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0, 229, 255, 0.95)';
  ctx.shadowColor = 'rgba(0, 229, 255, 0.65)';
  ctx.shadowBlur = 14;
  const label = 'J.A.R.V.I.S';
  const chars = label.split('');
  const gap = fontSize * 0.38;
  let total = 0;
  const widths = chars.map((ch) => {
    const w = ctx.measureText(ch).width;
    total += w;
    return w;
  });
  total += gap * (chars.length - 1);
  let x = cx - total / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x + widths[i] / 2, cy);
    x += widths[i] + gap;
  }
  ctx.restore();
}

function drawGrid(ctx, W, H) {
  const step = Math.max(18, Math.floor(W / 28));
  ctx.fillStyle = 'rgba(0, 136, 170, 0.18)';
  for (let x = step; x < W; x += step) {
    for (let y = step; y < H; y += step) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawCornerBrackets(ctx, W, H, color) {
  const m = W * 0.04;
  const len = W * 0.07;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.85;
  const corners = [
    [m, m, m + len, m, m, m + len],
    [W - m, m, W - m - len, m, W - m, m + len],
    [m, H - m, m + len, H - m, m, H - m - len],
    [W - m, H - m, W - m - len, H - m, W - m, H - m - len],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTickRing(ctx, cx, cy, r, count, color, alpha) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const inner = r - (i % 6 === 0 ? 6 : 3);
    const x1 = cx + Math.cos(ang) * inner;
    const y1 = cy + Math.sin(ang) * inner;
    const x2 = cx + Math.cos(ang) * r;
    const y2 = cy + Math.sin(ang) * r;
    ctx.lineWidth = i % 6 === 0 ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWaveform(ctx, cx, W, H, levels, speaking, muted, maxR, tick) {
  const bars = 48;
  const barW = (W * 0.72) / bars;
  const baseY = H - maxR * 0.22;
  const maxH = maxR * 0.12;
  for (let i = 0; i < bars; i++) {
    const lv =
      levels[i] ??
      (speaking ? 0.25 + Math.abs(Math.sin(tick * 0.08 + i * 0.2)) * 0.75 : 0.08 + Math.sin(i * 0.35 + tick * 0.02) * 0.06);
    const bh = lv * maxH;
    ctx.fillStyle = muted ? 'rgba(244,114,182,0.55)' : `rgba(0, 229, 255, ${0.25 + lv * 0.55})`;
    ctx.fillRect(cx - (bars * barW) / 2 + i * barW, baseY - bh, barW * 0.65, bh);
  }
}
