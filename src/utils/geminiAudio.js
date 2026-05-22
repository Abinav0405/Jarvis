const TARGET_MIC_RATE = 16000;
const PLAYBACK_RATE = 24000;

/** Downsample float32 [-1,1] to int16 PCM at 16kHz. */
export function floatToPcm16(float32, inputRate) {
  const ratio = inputRate / TARGET_MIC_RATE;
  const outLen = Math.floor(float32.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, float32[idx] || 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToFloat32(int16) {
  const f = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  return f;
}

/** Queue int16 24kHz chunks for smooth playback. */
export function createPlaybackQueue() {
  let ctx = null;
  let nextTime = 0;
  let activeSources = 0;
  let onIdle = null;

  const ensureCtx = () => {
    if (!ctx) ctx = new AudioContext({ sampleRate: PLAYBACK_RATE });
    return ctx;
  };

  const scheduleChunk = (int16) => {
    if (!int16?.length) return;
    const audioCtx = ensureCtx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const float = pcm16ToFloat32(int16);
    const buffer = audioCtx.createBuffer(1, float.length, PLAYBACK_RATE);
    buffer.copyToChannel(float, 0);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    const start = Math.max(audioCtx.currentTime, nextTime);
    nextTime = start + buffer.duration;
    activeSources += 1;
    src.onended = () => {
      activeSources -= 1;
      if (activeSources <= 0) {
        activeSources = 0;
        nextTime = audioCtx.currentTime;
        onIdle?.();
      }
    };
    src.start(start);
  };

  const reset = () => {
    nextTime = 0;
    activeSources = 0;
    onIdle = null;
  };

  const setOnIdle = (fn) => {
    onIdle = typeof fn === 'function' ? fn : null;
  };

  return { scheduleChunk, reset, setOnIdle, PLAYBACK_RATE };
}

export { TARGET_MIC_RATE, PLAYBACK_RATE };
