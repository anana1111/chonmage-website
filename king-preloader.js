/*! KING preloader - chonmagepoker.com
 *  Usage: put snippet.html right after <body>, this script right after it (no defer/async).
 *  API:   KingPreloader.track(promise, weight)  - add your own loading work to the progress
 *         KingPreloader.done                    - Promise resolved when the preloader has left
 *         window event "kingpreloader:done"
 */
(function () {
  'use strict';
  var TEMPLATE = null;
  var api = window.KingPreloader = window.KingPreloader || {};
  var pending = [];               // track() calls made before start
  var current = null;

  function settle(p) { return Promise.resolve(p).then(function(){}, function(){}); }
  function loadImg(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.decoding = 'async'; i.onload = function(){ res(i); }; i.onerror = rej; i.src = src; });
  }
  function storage(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------------- shader ---------------- */
  var VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  /* mask: R = red silk, G = gold ornament, B = person safety zone (never touched) */
  var FS = [
'precision highp float;',
'uniform sampler2D uImg,uMask;uniform float uT,uSweep,uProg,uFill;uniform vec2 uRes;varying vec2 vUv;',
'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
' return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}',
'float L(vec3 c){return dot(c,vec3(.299,.587,.114));}',
'void main(){',
' vec2 uv=vUv;float t=uT;',
' vec4 m=texture2D(uMask,uv);',
' vec3 orig=texture2D(uImg,uv).rgb;',
' float free=1.-m.b;',
/* 1. red silk streaming lower-left -> upper-right */
' vec2 dir=normalize(vec2(1.,-.55)),perp=vec2(-dir.y,dir.x);',
' float s=dot(uv,dir),q=dot(uv,perp);',
' float n1=fbm(vec2(s*3.-t*.4,q*6.));',
' float p0=fract(t*.22),p1=fract(t*.22+.5);',
' float w0=1.-abs(1.-2.*p0),w1=1.-w0;',
' vec2 wob=perp*(sin(s*20.-t*2.6+n1*4.)*.007+sin(s*7.-t*1.3)*.006);',
' vec2 ua=uv+(-dir*p0*.06+wob)*m.r,ub=uv+(-dir*p1*.06+wob)*m.r;',
' vec4 ma=texture2D(uMask,ua),mb=texture2D(uMask,ub);',
' vec3 va=mix(orig,texture2D(uImg,ua).rgb,smoothstep(.15,.7,ma.r)*(1.-ma.b));',
' vec3 vb=mix(orig,texture2D(uImg,ub).rgb,smoothstep(.15,.7,mb.r)*(1.-mb.b));',
' vec3 col=mix(orig,va*w0+vb*w1,smoothstep(.05,.5,m.r));',
' float fold=sin(s*17.-t*2.8+n1*5.)*.6+sin(s*9.-t*1.6+q*14.)*.4;',
' col*=1.+m.r*fold*.34;',
' col+=m.r*pow(max(0.,fold),5.)*vec3(.6,.2,.14)*.9;',
' col+=m.r*smoothstep(.6,.8,fbm(vec2(s*6.-t*.7,q*22.)))*vec3(1.,.62,.22)*.5;',
/* 2. crown halo */
' vec2 d=(uv-vec2(.5,.092))*vec2(uRes.x/uRes.y,1.);',
' float r=length(d),ang=atan(d.y,d.x);',
' float rays=pow(.5+.5*sin(ang*18.+t*.5),6.)*.6+pow(.5+.5*sin(ang*11.-t*.35),8.)*.5;',
' float ivory=smoothstep(.72,.9,L(col))*(1.-m.r);',
' col+=rays*smoothstep(.42,.04,r)*smoothstep(.03,.09,r)*(.6+.4*sin(t*1.6))*ivory*vec3(1.,.72,.3)*.45;',
' col+=m.g*smoothstep(.14,0.,r)*(.25+.25*sin(t*2.2))*vec3(1.,.8,.4);',
/* 3. gold sheen + glitter */
' float ph=fract(t*.16)*2.4-.4;',
' col+=m.g*exp(-pow((uv.x*.6+uv.y-ph)*10.,2.))*vec3(1.,.84,.5)*1.05;',
' float h=hash(floor(uv*uRes*.5));',
' col+=m.g*step(.94,h)*pow(max(0.,sin(t*(1.4+h*3.)+h*40.)),26.)*vec3(1.,.92,.65)*1.4;',
/* 4. KING lettering fills with gold = loading progress */
' float bx=smoothstep(.135,.155,uv.x)*smoothstep(.862,.842,uv.x)*smoothstep(.615,.632,uv.y)*smoothstep(.802,.785,uv.y);',
' float letter=bx*max(m.g,smoothstep(.30,.12,L(orig)))*(1.-m.r);',
' float u=(uv.x-.155)/.687;',
' float e=uProg*1.08-.04;',
' float filled=1.-smoothstep(e-.012,e+.012,u);',
' float dim=letter*(1.-filled)*uFill;',
' col=mix(col,vec3(L(col))*.38,dim*.9);',
' float edge=exp(-pow((u-e)*38.,2.))*(1.-smoothstep(.96,1.,uProg))*uFill;',
' col+=letter*edge*vec3(1.,.8,.45)*2.6;',
' col+=bx*edge*vec3(1.,.7,.35)*.3;',
/* 5. light sweep */
' col+=exp(-pow((uv.x*.75-uv.y*.35+.35-uSweep)*7.,2.))*vec3(1.,.9,.72)*.28;',
' gl_FragColor=vec4(mix(orig,col,free),1.);',
'}'].join('\n');

  function start(root) {
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var base = (root.getAttribute('data-assets') || '/images/king/').replace(/\/?$/, '/');
    var repeat = storage('kp-seen') === '1';
    var minDur = +(root.getAttribute(repeat ? 'data-min-repeat' : 'data-min') || (repeat ? 700 : 2400));
    var maxDur = +(root.getAttribute('data-max') || 12000);
    var card = root.querySelector('.kp-card');
    var img = root.querySelector('.kp-face img');
    var glc = root.querySelector('.kp-gl');
    var fx = root.querySelector('.kp-fx');
    var pctEl = root.querySelector('.kp-pct');
    var suitEl = root.querySelector('.kp-suit');
    var labelEl = root.querySelector('.kp-label');
    var skip = root.querySelector('.kp-skip');
    document.documentElement.classList.add('kp-lock');

    var st = { totalW: 0, doneW: 0, outstanding: 0, alive: true };
    var allSettled = [];
    function track(p, w) {
      w = w == null ? 1 : +w; st.totalW += w; st.outstanding++;
      var s = settle(p).then(function () { st.doneW += w; st.outstanding--; });
      allSettled.push(s); return s;
    }

    /* ---- what counts as "loaded" ---- */
    var cardReady = new Promise(function (res) {
      if (img.complete && img.naturalWidth) res(img); else { img.addEventListener('load', function(){ res(img); }); img.addEventListener('error', function(){ res(null); }); }
    });
    cardReady.then(function (i) { if (i) img.classList.add('kp-ready'); });
    var maskP = loadImg(base + 'mask.webp');
    var protP = loadImg(base + 'protect.png');
    track(cardReady, 3); track(maskP, 1.5); track(protP, .3);
    track(new Promise(function (res) { if (document.readyState === 'complete') res(); else addEventListener('load', res); }), 4);
    if (document.fonts && document.fonts.ready) track(document.fonts.ready, 1);
    function trackPageImages() {
      var imgs = document.images;
      for (var k = 0; k < imgs.length; k++) {
        var im = imgs[k];
        if (root.contains(im) || im.loading === 'lazy' || im.complete) continue;
        track(new Promise(function (res) { im.addEventListener('load', res); im.addEventListener('error', res); }), .5);
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trackPageImages); else trackPageImages();
    pending.splice(0).forEach(function (a) { track(a[0], a[1]); });

    var resolveDone; var done = new Promise(function (r) { resolveDone = r; });
    current = { track: track, done: done, finish: function(){ forced = true; } };

    /* ---- WebGL ---- */
    var gl = null, U = {}, glOk = false, W = 1122, H = 1402;
    if (!reduce) try { gl = glc.getContext('webgl', { premultipliedAlpha: false, antialias: false }); } catch (e) {}
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    function tex(im, unit) { var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (k) { gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE); });
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); }
    if (gl) Promise.all([cardReady, maskP]).then(function (r) {
      if (!r[0] || !st.alive) return;
      W = r[0].naturalWidth; H = r[0].naturalHeight; glc.width = W; glc.height = H;
      var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      tex(r[0], 0); tex(r[1], 1);
      ['uImg', 'uMask', 'uT', 'uSweep', 'uRes', 'uProg', 'uFill'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
      gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uMask, 1); gl.uniform2f(U.uRes, W, H);
      gl.viewport(0, 0, W, H); glOk = true;
    }).catch(function (e) { console.warn('[KingPreloader] WebGL off:', e); });

    /* ---- embers (2D, cut out over the person) ---- */
    var fctx = fx.getContext('2d'), fw = 0, fh = 0, dpr = 1, protect = null;
    protP.then(function (i) { protect = i; }, function () {});
    function sizeFx() { var b = card.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
      fw = fx.width = Math.max(1, Math.round(b.width * dpr)); fh = fx.height = Math.max(1, Math.round(b.height * dpr)); }
    sizeFx(); addEventListener('resize', sizeFx);
    var sprite = (function () { var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d');
      var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,245,210,1)'); g.addColorStop(.25, 'rgba(255,196,90,.85)');
      g.addColorStop(.6, 'rgba(220,90,30,.25)'); g.addColorStop(1, 'rgba(160,20,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; })();
    var P = [];
    function spawn(p, first) {
      p.x = Math.random(); p.y = first ? Math.random() : 1.02 + Math.random() * .1;
      if (Math.random() < .35) { p.x = Math.random() < .5 ? Math.random() * .3 : .7 + Math.random() * .3; p.y = first ? p.y : .45 + Math.random() * .25; }
      p.v = .04 + Math.random() * .09; p.s = .004 + Math.random() * .012; p.ph = Math.random() * 6.28; p.life = 0; p.max = 4 + Math.random() * 6; return p;
    }
    for (var k = 0; k < (reduce ? 0 : 70); k++) P.push(spawn({}, true));
    function drawFx(dt, t) {
      fctx.clearRect(0, 0, fw, fh); if (!protect || reduce) return;
      fctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < P.length; i++) { var p = P[i];
        p.life += dt; p.y -= p.v * dt; p.x += Math.sin(t * .8 + p.ph) * .012 * dt;
        if (p.y < -.05 || p.life > p.max) spawn(p, false);
        var a = Math.min(1, p.life * 1.5) * Math.max(0, 1 - p.life / p.max) * (.6 + .4 * Math.sin(t * 4 + p.ph));
        var sz = p.s * fw * (1 + .3 * Math.sin(t * 3 + p.ph));
        fctx.globalAlpha = a; fctx.drawImage(sprite, p.x * fw - sz, p.y * fh - sz, sz * 2, sz * 2); }
      fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'destination-out';
      fctx.drawImage(protect, 0, 0, fw, fh); fctx.globalCompositeOperation = 'source-over';
    }

    /* ---- progress + loop ---- */
    var SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'], t0 = performance.now(), last = t0, shown = 0, forced = false, leaving = false, sweepAt = -10, lastSuit = -1;
    setTimeout(function () { skip && skip.classList.add('kp-show'); }, 1500);
    skip && skip.addEventListener('click', function () { forced = true; minDur = 0; });

    function frame(now) {
      if (!st.alive) return;
      var t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
      var target = st.totalW ? st.doneW / st.totalW : 0;
      var complete = forced || (st.outstanding === 0 && now - t0 >= minDur) || now - t0 > maxDur;
      var creep = Math.min(.35, (1 - Math.exp(-t * 1.2)) * .35);          // never sits frozen at 0
      var timeCap = Math.min(1, (now - t0) / minDur);                       // pace to the minimum duration
      var goal = complete ? 1 : Math.min(.99, Math.max(creep, target) * (.35 + .65 * timeCap));
      shown += Math.max(0, goal - shown) * Math.min(1, dt * (complete ? 9 : 3.2));
      if (complete && 1 - shown < .004) shown = 1;
      var pct = Math.floor(shown * 100);
      pctEl.textContent = pct;
      var si = Math.floor(t * 3.3) % 4; if (si !== lastSuit && !leaving) { lastSuit = si; suitEl.textContent = SUITS[si]; suitEl.classList.toggle('kp-red', si === 1 || si === 2); }
      if (shown === 1 && !leaving) leave(now);

      var ts = (now - sweepAt) / 1000;
      var cyc = leaving ? ts : (t + 3.2) % 5.5;
      var sweep = cyc < 1.2 ? -.4 + cyc / 1.2 * 2.2 : -1;
      if (glOk) {
        gl.uniform1f(U.uT, t); gl.uniform1f(U.uSweep, sweep); gl.uniform1f(U.uProg, shown); gl.uniform1f(U.uFill, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!glc.classList.contains('kp-ready')) glc.classList.add('kp-ready');
      }
      drawFx(dt, t);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function leave(now) {
      leaving = true; sweepAt = now;
      labelEl.textContent = 'READY'; suitEl.textContent = '\u2660'; suitEl.classList.remove('kp-red');
      storage('kp-seen', '1');
      var flipAt = reduce ? 250 : 900, outAt = reduce ? 450 : 1550;
      setTimeout(function () { root.classList.add('kp-flip'); }, flipAt);
      setTimeout(function () { root.classList.add('kp-out'); document.documentElement.classList.remove('kp-lock'); }, outAt);
      setTimeout(function () {
        st.alive = false; removeEventListener('resize', sizeFx);
        if (gl) { var ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); }
        root.remove(); resolveDone();
        window.dispatchEvent(new CustomEvent('kingpreloader:done'));
      }, outAt + 600);
    }
    return done;
  }

  api.track = function (p, w) { if (current) return current.track(p, w); pending.push([p, w]); return settle(p); };
  api.finish = function () { current && current.finish(); };
  api.replay = function () {
    if (!TEMPLATE || document.getElementById('king-preloader')) return;
    try { sessionStorage.removeItem('kp-seen'); } catch (e) {}
    var wrap = document.createElement('div'); wrap.innerHTML = TEMPLATE;
    var el = wrap.firstElementChild; document.body.insertBefore(el, document.body.firstChild);
    api.done = start(el); return api.done;
  };

  var root = document.getElementById('king-preloader');
  if (root) { TEMPLATE = root.outerHTML; api.done = start(root); }
})();
