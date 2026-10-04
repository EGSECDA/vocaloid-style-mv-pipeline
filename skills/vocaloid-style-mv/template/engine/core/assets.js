/* vocaloid-style-mv engine — asset loading.
 *   await Z.img('assets/bg/bg_crossing.png')           cached HTMLImageElement / ImageBitmap (decoded)
 *   await Z.preload([...urls])                         before frame 0
 *   await Z.seqFrame('blender/renders/street/f_####.jpg', n)   one frame of an image sequence (LRU, decoded on demand)
 * Paths are relative to the project root (the render server root), resolved against Z.ROOT.
 */
(() => {
  'use strict';
  const Z = window.Z;
  Z.ROOT = new URL('../', document.baseURI).href;               // engine/index.html -> project root
  const url = p => (/^(https?:|data:|blob:)/.test(p) ? p : Z.ROOT + p.replace(/^\/+/, ''));
  const cache = new Map();

  async function decode(p) {
    const res = await fetch(url(p));
    if (!res.ok) throw new Error(`asset ${p}: HTTP ${res.status}`);
    const blob = await res.blob();
    return createImageBitmap(blob, { premultiplyAlpha: 'default', colorSpaceConversion: 'none' });
  }

  Z.img = p => {
    let pr = cache.get(p);
    if (!pr) { pr = decode(p); cache.set(p, pr); pr.catch(e => console.error(String(e))); }
    return pr;
  };
  Z.imgSync = p => Z.loaded.get(p) || null;                      // after preload
  Z.loaded = new Map();
  Z.preload = async (paths) => {
    const uniq = [...new Set(paths)];
    await Promise.all(uniq.map(async p => { Z.loaded.set(p, await Z.img(p)); }));
    return uniq.length;
  };

  // ---------------- image sequences (Blender renders): small LRU of decoded frames
  const seqCache = new Map(); const SEQ_MAX = 48;
  Z.seqPath = (pattern, n) => pattern.replace(/#+/, m => String(n).padStart(m.length, '0'));
  Z.seqFrame = async (pattern, n) => {
    const p = Z.seqPath(pattern, n);
    if (seqCache.has(p)) { const v = seqCache.get(p); seqCache.delete(p); seqCache.set(p, v); return v; }
    const bmp = await decode(p);
    seqCache.set(p, bmp);
    while (seqCache.size > SEQ_MAX) { const k = seqCache.keys().next().value; const old = seqCache.get(k); seqCache.delete(k); try { old.close(); } catch (e) {} }
    return bmp;
  };

  // ---------------- offscreen canvases
  Z.canvas = (w = 1920, h = 1080) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  Z.ctx2d = (c) => c.getContext('2d', { willReadFrequently: false });

  // tinted / silhouette copies of a sprite, cached per colour
  const tintCache = new Map();
  Z.tinted = (img, color, key) => {
    const k = (key || (img.src || img.width + 'x' + img.height)) + '|' + color;
    let c = tintCache.get(k); if (c) return c;
    c = Z.canvas(img.width, img.height); const x = c.getContext('2d');
    x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    tintCache.set(k, c); return c;
  };
})();
