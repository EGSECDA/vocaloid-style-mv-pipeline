> Archived working document from the 「残光」 project (Music / Lyrics / Movie：NikusonP). `<project>` = that project's root; commands and paths refer to its layout at the time. For the maintained, portable versions see `skills/vocaloid-style-mv/references/`.

# 残光 engine — API for scene authors

Deterministic browser renderer. `engine/index.html` loads, in order: JIZURA bundle + adapter → `core/util.js` → `core/assets.js` → `core/gl.js` → `core/draw.js` → `core/trans.js` → `scenes/scenes.js` → **scene files** (`scenes/intro.js typo.js glass.js dark.js night.js memory.js meta.js`) → timeline (`timeline.js`, or `?tl=tests/<file>.js`) → `core/main.js`.

Every frame: the active shot's scene draws into a 1920×1080 **Canvas2D** (the *scene layer*), JIZURA and `shot.text` draw into a separate transparent **text layer**, then the WebGL2 post pass composites them. Line boil, glitch, zoom blur, CA and palette LUTs apply to the scene layer only, so text stays crisp. Output is 1920×1080 @ 30 fps.

## Hard rules
- **Pure function of time.** Never use `Date.now()`, `performance.now()` for visuals, or unseeded `Math.random()` (the page seeds `Math.random`, but draw order may differ across workers). Use `Z.rnd(...ints)`, `Z.rnds`, `Z.rng(seed)`, `Z.noise1`, `Z.fbm1`. Particles must be closed-form in `t` (see `D.embers`). If a simulation is unavoidable, integrate from the shot start with fixed dt, so it's deterministic for any t.
- Scenes may be entered at any `t` (parallel render workers seek). No state carried between frames except caches of immutable data (offscreen canvases built once, keyed by args).
- Draw only inside the 1920×1080 frame. Always `ctx.save()/restore()` around state changes; reset `globalCompositeOperation`, `filter` and `globalAlpha`.
- Performance: aim for < 40 ms per frame. `ctx.filter = 'blur()'` on large areas is expensive (use it on small canvases, or pre-blur into a cached canvas). Prefer drawImage over per-pixel work. No getImageData in the per-frame path except on tiny canvases.
- Hand-drawn feel: drawn/character motion is usually quantised to 12 fps (`Z.quant(t, 12)`, or `S.tq` / `S.ltq`). Camera, light and particles run on full time.

## Registering a scene
```js
Z.scene('myScene', {
  preload: (args) => ['assets/char/bust_sing.png', ...],   // every image the scene uses (loaded before frame 0)
  init: async () => {},                                     // optional one-time setup (build caches)
  draw(ctx, S) { ... },                                     // may be async (e.g. image sequences)
});
```
`S` = `{ t, lt, dur, p, shot, args, W:1920, H:1080, clock, env, tq, ltq, rng(seed), section }`
- `t` song time (s). `lt = t - shot.t0`. `dur = shot.t1 - shot.t0`. `p = lt/dur` clamped 0..1. `args` = `shot.args`.
- `S.lt` can exceed `dur` (the previous shot keeps rendering during the next shot's transition), and it can be ≥ 0 only.
- `Z.imgSync(path)` returns the decoded ImageBitmap of a preloaded path (width/height available).

## Beat clock `S.clock` (from analysis/audio.json; tempo drifts 128→132 BPM, so never assume a fixed grid)
`pulse(t,k=10)` 1 at each beat and decaying · `downPulse(t)` the same on downbeats only · `phase(t)` 0..1 within the beat · `barPhase(t)` · `beat(t)` beat number (0 = first downbeat) · `bar(t)` · `inBar(t)` 0..3 · `since(t)` s since last beat · `nearest(t)` · `at(n)` time of beat n · `beats` raw array · `spb`.
Also `Z.audio` = the full audio.json (`bars[i].start`, `downbeats`, `impacts`, `stops`, `sections`, `vocal_activity`, `onsets_strong`).

## Audio envelope `S.env` (30 fps curves, 0..1, interpolated)
`rms(t) low(t) mid(t) high(t) onset(t) vocal(t)` · generic `get(key,t)`.

## Drawing toolkit `Z.draw` (alias `const D = Z.draw`) — core/draw.js
- `D.cover(ctx, img, {zoom,x,y,rot}, alpha)` fills the frame with pan (x/y in -1..1 of the spare margin). `D.viewLerp(a,b,k)`.
- `D.sprite(ctx, img, x, y, h, {anchor:[ax,ay], rot, flip, sway, breathe, t, phase, alpha, wave:{amp,freq,speed,from,q}})`: character draw. `wave` is a hair-wind strip warp (use `from` 0.25–0.4 so the face doesn't warp).
- `D.silhouette(ctx,img,x,y,h,color,opt)`, `D.rim(ctx,img,x,y,h,color,[dx,dy],opt)`.
- `D.glow(ctx,x,y,r,color,a)` additive radial glow · `D.disc` · `D.rays(ctx,x,y,n,len,color,a,t,seed)`.
- Particles: `D.embers(ctx,t,{n,seed,area:[x0,y0,x1,y1],color,rise,size,alpha,wind})`, `D.fireflies(ctx,t,{n,seed,area,color,size,alpha})`, `D.rain(ctx,t,{n,angle,speed,len,color,width})`, `D.dust(ctx,t,{n,color})`, `D.feathers(ctx,t,{n,size,color,line})`.
- Glass cracks: `D.crackNet(seed,cx,cy,n,reach)` → lines; `D.cracks(ctx, lines, prog0..1, {glow,core,width,alpha})`.
- Type: `D.font(ctx,size,fam,weight)` with families `Z.FONT = {mincho:'Shippori Mincho B1', minchoHeavy:'Zen Old Mincho', tokumin:'Kaisei Tokumin', serif:'Noto Serif JP', gothic:'Zen Kaku Gothic New', dela:'Dela Gothic One', sans:'Noto Sans JP', hand:'Klee One', brush:'Yuji Syuku', dot:'DotGothic16'}` (all loaded from engine/fonts, weights: Shippori 400–800, Zen Old Mincho 400/500/600/700/900, Noto variable 100–900, Zen Kaku 300–900, Klee 400/600).
  `D.vtext(ctx, text, x, yTop, {size,fam,weight,pitch,color,stroke,strokeW,reveal,glow,glowR})` vertical 縦書き · `D.htext(ctx,text,x,y,{size,fam,weight,color,stroke,glow,align,reveal,spacing,jitter,scaleIn})`.
- `D.halftone(ctx,[x0,y0,x1,y1],step,fn(x,y)->0..1,color)` · `D.fill(ctx,color,a,comp)` · `D.vgrad(ctx,[[k,color]..],a,comp,rect)` · `D.shake(t,amp,fps,seed)`.
- `Z.fx(ctx, S, {type:'embers'|'fireflies'|'rain'|'dust'|'feathers'|'rays'|'glow'|'cracks'|'grad'|'fill'|'custom', ...})` is the same effect set the `illust` scene uses.
- `Z.drawChar(ctx, S, charSpec)` draws a character exactly like `illust` does (see below).
- Offscreen: `Z.canvas(w,h)`, `Z.scratch[0..2]` (shared 1920×1080 temp canvases; only use them inside your own draw call, and never across awaits), `Z.tinted(img,color,key)` (cached tinted copy).
- Easing: `Z.ease.{linear,inQuad,outQuad,inOutQuad,inCubic,outCubic,inOutCubic,outQuart,inQuart,inOutSine,outSine,inSine,outExpo,inExpo,inOutExpo,outBack,inBack,outElastic,snap}` · `Z.tween(t,t0,t1,a,b,ease)` · `Z.clamp Z.lerp Z.inv Z.remap Z.smooth Z.fract Z.quant Z.hex Z.rgba`.

## Existing scenes (scenes/scenes.js)
- `solid` `{color|grad, embers, fireflies}`
- `jz` `{plan}` draws a full JIZURA 文字PV frame (its own background) for plan name.
- `illust` is the workhorse:
```js
{ bg:'assets/bg/x.png', bgFrom:{zoom,x,y,rot}, bgTo:{...}, bgEase:'inOutSine', beatZoom:0.015, shake:0,
  tint:[{color,a,comp}], overlayGrad:[[k,c]..], overlayA, overlayComp,
  layers:[{img,x,y,h,x2,y2,h2,anchor,alpha,rot}],
  fxBack:[fx...], chars:[{ img, x, y, h, x2, y2, h2, ease, anchor:[.5,1], flip, sway, breathe, wave:{amp,from,q}|false,
          rim:{color,off}, sil:'#color', shadow:{a,dx,dy,color}, alpha, rot, q:12,
          in:{at,dur,dx,dy,ds,rot,ease,alpha}, out:{at,dur,dx,dy,ds,ease}, beatBump, glowAt:[fx,fy,fr], glowColor }],
  fx:[fx...], vignette:0.5 }
```

## Transitions (core/trans.js), on the INCOMING shot: `trans:{type, dur, ...}`
`cut xfade flash{color} black iris{cx,cy,color} irisClose{cx,cy} barrier{px,py} wipe{angle,color} slices{n} push{dx,dy} zoom ink{seed} shatter{cx,cy,seed}`. Register new ones with `Z.transition(name, (ctx, A, B, k, o) => {})`.

## Post params (per shot `post: {...}` or `post: S => ({...})`) — core/gl.js
`boil` (px, default 1.1) · `lutA lutB lutBlend lutMix` (palette gradient map: names `P1 P1_duo P2 P2_duo P3 P3_duo P4 P4_duo P5 P5_duo night ember dawn mono`) · `exposure contrast saturation lift gain` · `ca` (px) `beatCA` · `textCa` · `glitch` (0..1) `glitchSeed` · `zoomBlur` `zoomCenter:[x,y] (0..1)` · `bloom` `bloomThreshold` `beatBloom` · `flash` `flashColor:[r,g,b]` · `invert` · `vignette` · `grain` · `shake:[px,px]` · `textOpacity` · `letterbox` (0..1) · `fade` (to black).

## Shot object (timeline)
`{ id, t0, t1, scene, args, lyric:'front'|'full'|'backfront'|'none'|{plan,mode}, plan:'main', post, trans, text:(ctx,S)=>{} }`. `lyric` defaults to `'front'` (the JIZURA lyric layer over the scene).

## Assets (all under project root; PNG; characters are trimmed RGBA cut-outs)
Characters `assets/char/`: `REF_master` (full body front), `master_a` `master_c` (full body), `bust_sing` (singing, hand on headphone), `bust_calm` (eyes closed), `eyes_ecu` (OPAQUE 16:9 eye close-up with crossing reflected in irises), `back_sunset` (full body from behind, hair blowing), `hand_reach` (raised arm + ribbon), `sit_knees`, `run` (running to the left), `lookup_tear` (upper body looking up, crying), `profile_sing` (side profile facing right, singing), `turn_smile` (spinning, looking back), `flame_hands` (cupped hands holding a flame), `kneel_pick` (kneeling, picking up glowing shards), `fall` (falling backward, seen from above), `reach_viewer` (reaching toward camera), `smile_dawn` (bust, tearful smile toward the right), `hug_self` (standing, hugging herself). Alternate takes of the last six are in `assets/char/alt/`.
Backgrounds `assets/bg/` (1672×941, opaque; upscale by covering): `bg_crossing` (dusk), `bg_crossing_night`, `bg_crossing_dawn`, `bg_platform`, `bg_embankment`, `bg_train` (sunset), `bg_train_night`, `bg_rooftop`, `bg_sky` (sky only), `bg_fireflies` (blue hour), `bg_classroom`, `bg_vending`, `bg_door` (rusted door, light leaking), `bg_wetstreet` (night puddles). Prop: `assets/bg/prop_heart.png` (RGBA glass heart).
Palettes: `assets/style/palettes.json` (`Z.PAL.P1.roles.*` etc. after boot). Brand colours: ink #140B1E, shadow #3A1745, dusk #7A2350, vermilion #C8373A, sunset #F0663A, glow #FFA552, highlight #FFE3B0, afterimage cyan #39C6E0, paper #F4EFE6.

## Testing your scenes
Write a test timeline `engine/tests/<yourname>.js`:
```js
(() => { const Z = window.Z;
  Z.setup = async (audio) => {
    Z.LOOK_DEFAULT = { boil: 1.1, bloom: 0.3, grain: 0.05, vignette: 0.3 };
    Z.SHOTS = [ { id:'x', t0: 62.53, t1: 66.26, scene:'myScene', lyric:'none', args:{...} } ];
  }; })();
```
(Use the real song times your scene is meant for. JIZURA plans aren't needed; set `lyric:'none'`.) Render stills plus a contact sheet:
`node <project>\tools\stills.mjs --url "engine/index.html?tl=tests/<yourname>.js" --times 62.6,63.0,64.2 --out render/tests/<yourname> --sheet <yourname>`
(Or `--range a:b:step`.) It prints per-frame ms and any page errors. **Look at the PNGs/sheet with the Read tool** and iterate until it looks like a top-tier motion-design piece. To check motion, render a short clip: `node <project>\tools\render_frames.mjs --url "engine/index.html?tl=tests/<yourname>.js" --start 62.5 --end 66 --out render/tests/<yourname>.mp4 --mode blob --audio audio/zanko.wav --audio-offset 62.5` (then extract a few frames with ffmpeg to inspect, if needed).
