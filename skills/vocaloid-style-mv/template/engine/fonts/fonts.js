// Font preloader for the vocaloid-style-mv engine. Usage (module or classic script):
//   <link rel="stylesheet" href="../fonts/fonts.css">
//   <script src="../fonts/fonts.js"></script>
//   await ZankoFonts.loadAll();            // or ZankoFonts.load(['Zen Old Mincho 400', ...])
//   ZankoFonts.report()  -> [{family, weight, ok}]
// Every face in fonts.css uses font-display:block, so text never falls back silently once loaded.
(function (g) {
  const FACES = [
    ['Noto Sans JP', [100, 300, 400, 500, 700, 900]],
    ['Noto Serif JP', [200, 400, 600, 900]],
    ['Zen Old Mincho', [400, 500, 600, 700, 900]],
    ['Shippori Mincho B1', [400, 500, 600, 700, 800]],
    ['Dela Gothic One', [400]],
    ['Klee One', [400, 600]],
    ['Yuji Syuku', [400]],
    ['Zen Kaku Gothic New', [300, 400, 500, 700, 900]],
    ['DotGothic16', [400]],
    ['Kaisei Tokumin', [400, 500, 700, 800]],
    ['M PLUS Rounded 1c', [100, 300, 400, 500, 700, 800, 900]],
    ['Reggae One', [400]],
    ['Rampart One', [400]],
    ['Noto Sans SC', [100, 400, 700, 900]],
    ['Noto Serif SC', [200, 400, 700, 900]],
  ];
  const SAMPLE = '残光あア亜Ag';
  async function load(list) {
    const jobs = [];
    for (const [fam, ws] of list || FACES)
      for (const w of ws) jobs.push(document.fonts.load(`${w} 64px "${fam}"`, SAMPLE));
    await Promise.all(jobs);
    await document.fonts.ready;
    return report(list);
  }
  // NB: document.fonts.check() also returns true when NO face matches (e.g. a typo'd family),
  // so we additionally require a FontFace of that family with status 'loaded'.
  function report(list) {
    const out = [];
    const all = [...document.fonts];
    for (const [fam, ws] of list || FACES) {
      const faces = all.filter((f) => f.family.replace(/["']/g, '') === fam);
      for (const w of ws) {
        const loaded = faces.filter((f) => f.status === 'loaded').length;
        out.push({ family: fam, weight: w, ok: loaded > 0 && document.fonts.check(`${w} 64px "${fam}"`, SAMPLE), faces: faces.length, loaded });
      }
    }
    return out;
  }
  g.ZankoFonts = { FACES, load, loadAll: () => load(FACES), report };
})(typeof window !== 'undefined' ? window : globalThis);
