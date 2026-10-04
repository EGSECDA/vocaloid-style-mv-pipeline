/* vocaloid-style-mv engine — WebGL2 compositor / post pipeline.
 *
 *   Z.post.init(outCanvas)
 *   Z.post.render(sceneCanvas, textCanvas, P)      P = post params for this frame (see DEFAULTS)
 *
 * Pass 1 (comp):  scene -> line boil + glitch slices + zoom blur + chromatic aberration + palette gradient map
 *                 text  -> (optional small CA) composited over the scene
 * Pass 2 (bloom): bright-pass + 3-level downsample/blur chain
 * Pass 3 (final): comp + bloom, flash, invert, vignette, grain, dither -> screen
 */
(() => {
  'use strict';
  const Z = window.Z;

  const DEFAULTS = {
    boil: 1.2,            // px amplitude of hand-drawn line boil (scene layer only)
    boilFps: 12,          // boil re-seeds this many times per second (2コマ打ち)
    lutA: 0, lutB: 0, lutBlend: 0, lutMix: 0,   // palette LUT rows and how much of the gradient map to apply
    exposure: 0, contrast: 1, saturation: 1, lift: [0, 0, 0], gain: [1, 1, 1],
    ca: 0.0,              // chromatic aberration in px (radial)
    textCa: 0.0,
    glitch: 0,            // 0..1 slice glitch amount
    glitchSeed: 0,
    zoomBlur: 0, zoomCenter: [0.5, 0.5],
    bloom: 0.35, bloomThreshold: 0.72,
    flash: 0, flashColor: [1, 1, 1],
    invert: 0,
    vignette: 0.35,
    grain: 0.06, grainSeed: 0,
    shake: [0, 0],        // px
    textOpacity: 1,
    letterbox: 0,         // 0..1 fraction of the 2.39 bars
    fade: 0,              // fade to black 0..1
  };

  const VS = `#version 300 es
  in vec2 p; out vec2 uv;
  void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

  const COMMON = `#version 300 es
  precision highp float;
  in vec2 uv; out vec4 o;
  float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
  `;

  const FS_COMP = COMMON + `
  uniform sampler2D scene, text, lut, fg;
  uniform vec2 res;
  uniform float boil, boilSeed, lutA, lutB, lutBlend, lutMix, ca, textCa, glitch, glitchSeed, zoomBlur, textOpacity;
  uniform float exposure, contrast, saturation; uniform vec3 lift, gain;
  uniform vec2 zoomCenter, shake;
  const float LUT_ROWS = 16.;
  vec3 gradmap(float l, float row){ return texture(lut, vec2(l*255./256.+0.5/256., (row+0.5)/LUT_ROWS)).rgb; }
  vec3 sceneAt(vec2 q){
    return texture(scene, q).rgb;
  }
  vec3 grade(vec3 col){
    // palette gradient map (luminance -> palette ramp), blended between two palettes
    if (lutMix > 0.){
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      vec3 g = mix(gradmap(l, lutA), gradmap(l, lutB), lutBlend);
      col = mix(col, g, lutMix);
    }
    col = col * exp2(exposure);
    col = (col - 0.5) * contrast + 0.5;
    float L = dot(col, vec3(0.2126,0.7152,0.0722));
    col = mix(vec3(L), col, saturation);
    return lift + col * (gain - lift);
  }
  void main(){
    vec2 px = 1./res;
    vec2 q = uv + shake*px;
    // glitch: horizontal slices shifted sideways
    if (glitch > 0.){
      float band = floor(q.y*38. + glitchSeed*7.);
      float r = h21(vec2(band, glitchSeed));
      if (r > 1. - glitch*0.55) q.x += (h21(vec2(band, glitchSeed+3.)) - 0.5) * 0.18 * glitch;
      float band2 = floor(q.y*140. + glitchSeed*3.);
      if (h21(vec2(band2, glitchSeed+9.)) > 1. - glitch*0.3) q.x += (h21(vec2(band2, 1.+glitchSeed)) - 0.5) * 0.03;
    }
    // line boil: low-frequency displacement, re-seeded on 2s
    vec2 bq = q;
    if (boil > 0.){
      vec2 n = vec2(vnoise(q*res/34. + boilSeed*17.3), vnoise(q*res/34. + boilSeed*9.1 + 31.7)) - 0.5;
      bq += n * 2. * boil * px;
    }
    // zoom blur + chromatic aberration
    vec3 col;
    vec2 dir = bq - zoomCenter;
    if (zoomBlur > 0.001){
      vec3 acc = vec3(0.); float wsum = 0.;
      for (int i=0;i<14;i++){ float k = float(i)/13.; float w = 1.-k*0.6; acc += sceneAt(bq - dir*k*zoomBlur)*w; wsum += w; }
      col = acc/wsum;
    } else if (ca > 0.01){
      vec2 d = normalize(dir+1e-5) * ca * px * (0.3 + 1.4*length(dir));
      col = vec3(sceneAt(bq + d).r, sceneAt(bq).g, sceneAt(bq - d).b);
    } else col = sceneAt(bq);
    col = grade(col);
    // text layer over the scene (premultiplied canvas upload)
    vec4 tx;
    if (textCa > 0.01){
      vec2 d = vec2(textCa*px.x, 0.);
      vec4 a = texture(text, q+d), b = texture(text, q), c = texture(text, q-d);
      tx = vec4(a.r, b.g, c.b, max(max(a.a,b.a),c.a));
    } else tx = texture(text, q);
    tx *= textOpacity;
    col = col*(1.-tx.a) + tx.rgb;
    // foreground (characters in front of the lyrics): same boil + grade as the scene, premultiplied upload
    vec4 f = texture(fg, bq);
    if (f.a > 0.001){ vec3 fc = grade(f.rgb / f.a); col = col*(1.-f.a) + fc*f.a; }
    o = vec4(max(col, 0.), 1.);
  }`;

  const FS_BRIGHT = COMMON + `
  uniform sampler2D src; uniform float thr;
  void main(){ vec3 c = texture(src, uv).rgb; float l = max(max(c.r,c.g),c.b); o = vec4(c * smoothstep(thr, thr+0.25, l), 1.); }`;

  const FS_BLUR = COMMON + `
  uniform sampler2D src; uniform vec2 dir;
  void main(){
    vec3 c = texture(src, uv).rgb*0.227;
    c += (texture(src, uv+dir*1.384).rgb + texture(src, uv-dir*1.384).rgb)*0.316;
    c += (texture(src, uv+dir*3.230).rgb + texture(src, uv-dir*3.230).rgb)*0.070;
    o = vec4(c,1.);
  }`;

  const FS_FINAL = COMMON + `
  uniform sampler2D comp, b1, b2, b3;
  uniform vec2 res;
  uniform float bloom, flash, invert, vignette, grain, grainSeed, letterbox, fade;
  uniform vec3 flashColor;
  // per-pixel white noise on the integer pixel lattice (Dave Hoskins' hash12). h21 on raw uv*res aliases into
  // visible vertical stripes at grain strength, so grain and dither use this one; h21 stays for boil / glitch.
  float hpx(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main(){
    vec3 c = texture(comp, uv).rgb;
    vec3 bl = texture(b1, uv).rgb*0.5 + texture(b2, uv).rgb*0.8 + texture(b3, uv).rgb*1.1;
    c += bl * bloom;
    c = mix(c, 1.-c, invert);
    c = mix(c, flashColor, flash);
    vec2 d = uv - 0.5; d.x *= res.x/res.y;
    c *= 1. - vignette * smoothstep(0.35, 1.05, length(d));
    vec2 px = floor(uv*res);
    float g = hpx(px + vec2(17., 31.) * grainSeed) - 0.5;
    c += g * grain * (0.6 + 0.4*(1.-dot(c, vec3(0.333))));
    c *= 1. - fade;
    float lb = letterbox * 0.1203;          // 2.39:1 bars at letterbox = 1
    if (uv.y < lb || uv.y > 1.-lb) c = vec3(0.);
    c += (hpx(px + vec2(5113., 7919.)) - 0.5) / 255.;  // dither
    o = vec4(clamp(c,0.,1.), 1.);
  }`;

  let gl, progs = {}, quad, texScene, texText, texLut, texFg, fbo = {}, W, H;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    return s;
  }
  function prog(fs) {
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function tex(w, h, filter = gl.LINEAR, fmt = 'rgba8') {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const internal = fmt === 'rgba16f' ? gl.RGBA16F : gl.RGBA8, type = fmt === 'rgba16f' ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function target(w, h, fmt) { const t = tex(w, h, gl.LINEAR, fmt); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; }
  function draw(pr, tgt, uniforms, textures) {
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.f : null);
    gl.viewport(0, 0, tgt ? tgt.w : W, tgt ? tgt.h : H);
    let unit = 0;
    for (const [name, t] of Object.entries(textures || {})) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(pr.u[name], unit); unit++; }
    for (const [name, v] of Object.entries(uniforms || {})) {
      const loc = pr.u[name]; if (loc == null) continue;
      if (Array.isArray(v)) { if (v.length === 2) gl.uniform2fv(loc, v); else if (v.length === 3) gl.uniform3fv(loc, v); else gl.uniform4fv(loc, v); }
      else gl.uniform1f(loc, v);
    }
    gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const post = (Z.post = {
    DEFAULTS,
    init(canvas) {
      W = canvas.width; H = canvas.height;
      gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false, alpha: false });
      if (!gl) throw new Error('WebGL2 unavailable');
      gl.getExtension('EXT_color_buffer_float');
      quad = gl.createVertexArray(); gl.bindVertexArray(quad);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      progs.comp = prog(FS_COMP); progs.bright = prog(FS_BRIGHT); progs.blur = prog(FS_BLUR); progs.final = prog(FS_FINAL);
      texScene = tex(W, H); texText = tex(W, H); texLut = tex(256, 16); texFg = tex(W, H);
      fbo.comp = target(W, H, 'rgba16f');
      fbo.b1 = target(W >> 1, H >> 1, 'rgba16f'); fbo.b1b = target(W >> 1, H >> 1, 'rgba16f');
      fbo.b2 = target(W >> 2, H >> 2, 'rgba16f'); fbo.b2b = target(W >> 2, H >> 2, 'rgba16f');
      fbo.b3 = target(W >> 3, H >> 3, 'rgba16f'); fbo.b3b = target(W >> 3, H >> 3, 'rgba16f');
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      post.renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return post.renderer;
    },
    // LUT atlas: canvas 256 x 16, one palette ramp per row (row index = Z.LUT[name])
    setLutAtlas(canvas) {
      gl.bindTexture(gl.TEXTURE_2D, texLut);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    },
    render(sceneCanvas, textCanvas, P0, fgCanvas) {
      const P = Object.assign({}, DEFAULTS, P0 || {});
      gl.bindTexture(gl.TEXTURE_2D, texScene);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, texText);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
      gl.bindTexture(gl.TEXTURE_2D, texFg);
      if (fgCanvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, fgCanvas);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const zc = [P.zoomCenter[0], 1 - P.zoomCenter[1]];
      draw(progs.comp, fbo.comp, {
        res: [W, H], boil: P.boil, boilSeed: P.boilSeed ?? 0, lutA: P.lutA, lutB: P.lutB, lutBlend: P.lutBlend, lutMix: P.lutMix,
        ca: P.ca, textCa: P.textCa, glitch: P.glitch, glitchSeed: P.glitchSeed, zoomBlur: P.zoomBlur, zoomCenter: zc,
        exposure: P.exposure, contrast: P.contrast, saturation: P.saturation, lift: P.lift, gain: P.gain,
        shake: [P.shake[0], -P.shake[1]], textOpacity: P.textOpacity,
      }, { scene: texScene, text: texText, lut: texLut, fg: texFg });
      if (P.bloom > 0) {
        draw(progs.bright, fbo.b1, { thr: P.bloomThreshold }, { src: fbo.comp.t });
        const blur = (a, b) => { draw(progs.blur, b, { dir: [1 / a.w, 0] }, { src: a.t }); draw(progs.blur, a, { dir: [0, 1 / a.h] }, { src: b.t }); };
        blur(fbo.b1, fbo.b1b);
        draw(progs.blur, fbo.b2, { dir: [0.5 / fbo.b1.w, 0.5 / fbo.b1.h] }, { src: fbo.b1.t }); blur(fbo.b2, fbo.b2b); blur(fbo.b2, fbo.b2b);
        draw(progs.blur, fbo.b3, { dir: [0.5 / fbo.b2.w, 0.5 / fbo.b2.h] }, { src: fbo.b2.t }); blur(fbo.b3, fbo.b3b); blur(fbo.b3, fbo.b3b);
      }
      draw(progs.final, null, {
        res: [W, H], bloom: P.bloom, flash: P.flash, flashColor: P.flashColor, invert: P.invert, vignette: P.vignette,
        grain: P.grain, grainSeed: P.grainSeed, letterbox: P.letterbox, fade: P.fade,
      }, { comp: fbo.comp.t, b1: fbo.b1.t, b2: fbo.b2.t, b3: fbo.b3.t });
    },
  });
})();
