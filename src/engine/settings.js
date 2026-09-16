// Player settings (F3), kept in localStorage under sunrune:settings.
export const DEFAULTS = {
  music: 60,
  sfx: 70,
  textSpeed: 'normal',
  shake: true,
  reduceFlashing: false,
  timing: 'normal',
  // 'auto' follows the device: a pad on a phone, none on a desktop (F40).
  touchControls: 'auto',
  vibrate: true,
};

const KEY = 'sunrune:settings';

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) s.reduceFlashing = true;
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch {
    // Storage blocked or broken: defaults are fine.
  }
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
