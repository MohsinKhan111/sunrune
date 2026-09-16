// The display canvas: 320×180 game pixels, scaled by whole numbers and centred (D10).
// The picture fills its stage, not the window: with the touch pad up the stage is only
// part of the page, so the game shrinks to make room rather than sitting under a thumb
// (F40). With no pad the stage is the whole window and nothing changes.
export const VW = 320;
export const VH = 180;

// The scale rule, in one place: whole numbers from ×2 up so pixels stay crisp, and a
// fractional fall-back under that rather than a huge border (D10). Both arguments are
// device pixels.
//
// `fluid` drops the whole-number step, and only the touch pad turns it on, only on a
// screen dense enough that the unevenness cannot be seen (D26). A phone's window is
// small and rarely a whole multiple of 320; a picture pinned to the last whole step
// there is the same size on a big phone as on a little one, which is the worse fault.
// The touch pad asks this too, so it can hand the picture a stage that is exactly the
// size the picture will use (F40).
export function fitScale(w, h, fluid = false) {
  const fit = Math.min(w / VW, h / VH);
  if (fluid) return fit;
  return fit >= 2 ? Math.floor(fit) : fit;
}

export const screen = {
  canvas: null,
  stage: null,
  ctx: null,
  scale: 1,
  ox: 0,
  oy: 0,
  // Set by the touch pad (D26). Off everywhere else, so a desktop window keeps the
  // whole-number scaling D10 asked for.
  fluid: false,

  init(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage ?? canvas.parentElement ?? null;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());
    // The address bar sliding away on a phone changes the room available without ever
    // firing a window resize on some browsers.
    window.visualViewport?.addEventListener('resize', () => this.resize());
    // The surest signal of the lot: the stage itself changed, whatever moved it - the
    // pad appearing, the keyboard opening, a turn of the device.
    if (this.stage && typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.resize()).observe(this.stage);
    }
  },

  // How much room the picture has, in CSS pixels.
  room() {
    const box = this.stage?.getBoundingClientRect();
    if (box && box.width >= 1 && box.height >= 1) return { w: box.width, h: box.height };
    return { w: window.innerWidth, h: window.innerHeight };
  },

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const { w: cssW, h: cssH } = this.room();
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.scale = fitScale(w, h, this.fluid);
    this.ox = Math.round((w - VW * this.scale) / 2);
    this.oy = Math.round((h - VH * this.scale) / 2);
    this.ctx.imageSmoothingEnabled = false;
  },

  isFullscreen() {
    return !!document.fullscreenElement;
  },

  async setFullscreen(on) {
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Browsers refuse fullscreen without a user gesture; nothing to do.
    }
  },
};
