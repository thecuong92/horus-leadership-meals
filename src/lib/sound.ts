'use client';

// Bộ tổng hợp âm thanh tương tác trực quan bằng Web Audio API (Không cần tải file MP3 ngoài)
let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem('horus_sound_enabled');
    if (saved !== null) {
      soundEnabled = saved === '1';
    }
  }
  return soundEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('horus_sound_enabled', enabled ? '1' : '0');
  }
  if (enabled) {
    playClickSound();
  }
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainValue = 0.06,
  delaySec = 0
) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  } catch {
    // Ignore audio context errors on restricted browsers
  }
}

/** Âm thanh click nhẹ khi chuyển tab, lọc dữ liệu */
export function playClickSound() {
  playTone(680, 0.045, 'sine', 0.045, 0);
}

/** Âm thanh tích chọn người tham gia (checkbox tick) */
export function playTickSound(checked = true) {
  if (checked) {
    playTone(540, 0.04, 'triangle', 0.05, 0);
    playTone(820, 0.06, 'triangle', 0.05, 0.035);
  } else {
    playTone(460, 0.05, 'triangle', 0.04, 0);
  }
}

/** Âm thanh hoàn thành / Lưu bữa ăn / Duyệt / Commit thành công */
export function playSuccessSound() {
  playTone(523.25, 0.09, 'sine', 0.06, 0); // C5
  playTone(659.25, 0.09, 'sine', 0.06, 0.07); // E5
  playTone(783.99, 0.12, 'sine', 0.07, 0.14); // G5
  playTone(1046.5, 0.22, 'triangle', 0.07, 0.21); // C6
}

/** Âm thanh cảnh báo / lỗi nhập liệu */
export function playWarningSound() {
  playTone(280, 0.11, 'sawtooth', 0.045, 0);
  playTone(220, 0.16, 'sawtooth', 0.045, 0.1);
}

/** Âm thanh quét từng tầng kiểm thử (5-Tier Testing Suite) */
export function playTierScanSound(tierIndex: number) {
  const baseFreq = 440 + tierIndex * 90;
  playTone(baseFreq, 0.07, 'sine', 0.05, 0);
  playTone(baseFreq * 1.25, 0.09, 'triangle', 0.05, 0.05);
}
