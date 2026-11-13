/* Bruma — landing interactions. GSAP + ScrollTrigger + Lenis, no build step. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------------- Smooth scroll ---------------- */
  let lenis = null;
  if (hasGsap && !reduced && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const el = id.length > 1 ? $(id) : null;
    if (!el && id !== '#top') return;
    e.preventDefault();
    const target = id === '#top' ? 0 : el;
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
    else (el || document.body).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }));

  /* ---------------- Nav ---------------- */
  const nav = $('[data-nav]');
  const hero = $('[data-hero]');
  const setNav = () => nav.classList.toggle('is-solid', window.scrollY > hero.offsetHeight - window.innerHeight * .55);
  setNav();
  window.addEventListener('scroll', setNav, { passive: true });

  /* ---------------- GitHub stars ---------------- */
  fetch('https://api.github.com/repos/yairhdz24/bruma', { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d || typeof d.stargazers_count !== 'number' || d.stargazers_count < 5) return;
      const n = d.stargazers_count;
      const label = n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(n);
      $$('[data-stars]').forEach(el => { el.textContent = '★ ' + label; el.hidden = false; });
    })
    .catch(() => {});

  /* ---------------- Fog (WebGL) ---------------- */
  const fog = (() => {
    const canvas = $('[data-fog]');
    const state = { scroll: 0, mx: 0, my: 0 };
    if (!canvas) return state;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) { hero.classList.add('no-webgl'); return state; }

    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = `
      precision mediump float;
      uniform vec2 r; uniform float t; uniform float s; uniform float base; uniform vec2 m;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
      float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*n(p);p=R*p*2.02;a*=.5;}return v;}
      void main(){
        vec2 uv=gl_FragCoord.xy/r; float asp=r.x/r.y;
        vec2 q=vec2(uv.x*asp,uv.y)*1.8+m*.04;
        float w=fbm(q+vec2(t*.018,-t*.006));
        float w2=fbm(q*1.7-vec2(t*.026,t*.004)+w);
        float line=base+s*1.25;
        float d=(line-uv.y)+(w2-.5)*.38;
        float a=smoothstep(-.06,.22,d);
        float wisp=smoothstep(.56,.82,w2)*smoothstep(line+.45,line-.05,uv.y)*.35;
        a=clamp(a+wisp*(1.-a),0.,1.);
        a*=smoothstep(0.,.35,line+.2);
        vec3 lo=vec3(.984,.988,.996); vec3 hi=vec3(.86,.915,.98);
        vec3 col=mix(lo,hi,clamp((uv.y-line+.3)*1.6,0.,1.)*(1.-s));
        gl_FragColor=vec4(col*a,a);
      }`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { hero.classList.add('no-webgl'); return state; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = k => gl.getUniformLocation(prog, k);
    const uR = U('r'), uT = U('t'), uS = U('s'), uB = U('base'), uM = U('m');

    let w = 0, hgt = 0, visible = true, raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
      w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      hgt = Math.max(1, Math.round(canvas.clientHeight * dpr));
      canvas.width = w; canvas.height = hgt;
      gl.viewport(0, 0, w, hgt);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', e => {
      state.mx = (e.clientX / window.innerWidth - .5) * 2;
      state.my = (e.clientY / window.innerHeight - .5) * 2;
    }, { passive: true });
    const start = performance.now();
    const draw = now => {
      raf = 0;
      if (!visible) return;
      const t = reduced ? 0 : (now - start) / 1000;
      const basePx = Math.min(190, canvas.clientHeight * .2);
      gl.uniform2f(uR, w, hgt);
      gl.uniform1f(uT, t);
      gl.uniform1f(uS, state.scroll);
      gl.uniform1f(uB, basePx / Math.max(1, canvas.clientHeight));
      gl.uniform2f(uM, state.mx, state.my);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    state.redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) state.redraw(); }).observe(hero);
    state.redraw();
    return state;
  })();

  /* ---------------- Hero title: words condense out of mist ---------------- */
  const title = $('.hero-title');
  $$('.line', title).forEach(line => {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');
    text.split(' ').forEach((word, wi, all) => {
      const w = document.createElement('span');
      w.className = 'word';
      [...word].forEach(c => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = c;
        w.appendChild(s);
      });
      line.appendChild(w);
      if (wi < all.length - 1) line.appendChild(document.createTextNode(' '));
    });
  });

  if (hasGsap && !reduced) {
    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
    intro
      .from('.hero-sky', { scale: 1.12, duration: 2.4, ease: 'power2.out' }, 0)
      .from('.hero-title .ch', { opacity: 0, filter: 'blur(18px)', y: 24, duration: 1.3, stagger: { each: .035, from: 'start' } }, .15)
      .from('[data-hero-fade]', { opacity: 0, filter: 'blur(10px)', y: 18, duration: 1, stagger: .12 }, .75)
      .from('[data-nav]', { opacity: 0, y: -16, duration: .8 }, .9);

    gsap.timeline({
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    })
      .to('.hero-sky', { yPercent: 14, scale: 1.08, ease: 'none' }, 0)
      .to('.hero-title', { y: -90, opacity: 0, filter: 'blur(16px)', ease: 'power1.in' }, 0)
      .to('.hero-sub, .hero-ctas', { y: -60, opacity: 0, filter: 'blur(10px)', ease: 'power1.in' }, .05)
      .to('.demo', { y: -40, opacity: 0, filter: 'blur(8px)', ease: 'power2.in' }, .35)
      .to('.hero-scroll', { opacity: 0, ease: 'none', duration: .1 }, 0);

    // The mist rises only once the demo has been seen: last screen of the hero.
    gsap.to(fog, {
      scroll: 1, ease: 'power1.in',
      onUpdate: () => fog.redraw && fog.redraw(),
      scrollTrigger: { trigger: hero, start: 'bottom bottom', end: 'bottom top', scrub: true },
    });
  }

  /* ---------------- Hero demo ---------------- */
  (() => {
    const demo = $('[data-demo]');
    const pill = $('[data-pill]');
    const live = $('[data-live]');
    const field = $('[data-demo-text]');
    const fnKey = $('[data-fn]');
    const hint = $('[data-demo-hint]');
    const bars = $$('[data-wave] i');
    const thread = $('.demo-thread');
    const micBtn = $('[data-mic]');
    const micNote = $('[data-mic-note]');

    const scripts = [
      { raw: 'eh a las diez no perdón a las diez y media en la sala de siempre', clean: 'A las 10:30, en la sala de siempre.' },
      { raw: 'va yo llevo el demo de bruma y las métricas del sprint', clean: 'Va, yo llevo el demo de Bruma y las métricas del sprint.' },
      { raw: 'oye y quién pide los cafés', clean: 'Oye, ¿y quién pide los cafés?' },
    ];
    let idx = 0;
    let mode = 'idle';
    let interacted = false;
    let run = 0;          // invalidates stale async loops
    let level = 0, levelRaf = 0;
    let finishNow = null;
    const hints = {
      idle: 'Toca <b>fn</b> para dictar, y otra vez para pegar',
      listening: 'Escuchando… toca <b>fn</b> otra vez para pegar',
      working: 'Puliendo el texto…',
      done: 'Pegado donde estaba tu cursor',
    };

    const setMode = m => {
      mode = m;
      pill.dataset.mode = m;
      fnKey.setAttribute('aria-pressed', String(m === 'listening'));
      hint.innerHTML = hints[m] || hints.idle;
    };

    const animateLevel = () => {
      // Organic waveform: each bar follows the level with its own wobble.
      const t = performance.now() / 1000;
      bars.forEach((b, i) => {
        const env = 0.25 + 0.75 * Math.sin(Math.PI * (i + .5) / bars.length);
        const wob = .55 + .45 * Math.sin(t * (7 + i * 1.7) + i * 1.3);
        b.style.transform = `scaleY(${Math.max(.16, Math.min(1, level * env * wob * 1.25 + .14))})`;
      });
      pill.style.setProperty('--level', level.toFixed(3));
      levelRaf = requestAnimationFrame(animateLevel);
    };
    const stopLevel = () => { cancelAnimationFrame(levelRaf); levelRaf = 0; level = 0; pill.style.setProperty('--level', 0); bars.forEach(b => (b.style.transform = '')); };

    const showLive = words => {
      live.innerHTML = words.map(w => `<span>${w} </span>`).join('');
      live.classList.toggle('is-on', words.length > 0);
    };

    const paste = async (text, token) => {
      demo.classList.add('has-text');
      field.innerHTML = '';
      const words = text.split(' ');
      for (const w of words) {
        if (token !== run) return;
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w + ' ';
        field.appendChild(s);
        await sleep(reduced ? 0 : 55);
      }
    };

    const send = text => {
      const b = document.createElement('p');
      b.className = 'bubble me';
      b.textContent = text;
      thread.appendChild(b);
      const bubbles = $$('.bubble', thread);
      if (bubbles.length > 3) bubbles[0].remove();
      field.innerHTML = '';
      demo.classList.remove('has-text');
    };

    const finish = async (clean, token) => {
      if (token !== run) return;
      stopLevel();
      showLive([]);
      setMode('working');
      await sleep(reduced ? 0 : 650);
      if (token !== run) return;
      setMode('done');
      await paste(clean, token);
      await sleep(1500);
      if (token !== run) return;
      send(clean);
      setMode('idle');
    };

    /* Scripted dictation */
    const playScript = async () => {
      const token = ++run;
      const { raw, clean } = scripts[idx++ % scripts.length];
      field.innerHTML = '';
      demo.classList.remove('has-text');
      setMode('listening');
      if (!levelRaf) animateLevel();
      const words = raw.split(' ');
      const shown = [];
      let stop = false;
      finishNow = () => { stop = true; };
      for (const w of words) {
        if (token !== run || stop) break;
        shown.push(w);
        showLive(shown.slice(-9));
        level = .45 + Math.random() * .5;
        await sleep(reduced ? 0 : 170 + Math.random() * 120);
        level = .2 + Math.random() * .25;
        await sleep(reduced ? 0 : 60);
      }
      finishNow = null;
      if (token !== run) return;
      await sleep(stop ? 0 : 350);
      await finish(clean, token);
    };

    /* Real voice, via the browser's speech recognition */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let useMic = false, rec = null, stream = null, ctx = null, analyser = null, micRaf = 0, heard = '';
    if (SR && navigator.mediaDevices && window.isSecureContext) micBtn.hidden = false;

    const polish = s => {
      let t = ' ' + s.trim() + ' ';
      t = t.replace(/\s(eh+|este|mmm+|o sea|pues|ehm)\s/gi, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (!/[.!?…]$/.test(t)) t += '.';
      return t;
    };

    const micLevel = () => {
      if (!analyser) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      level = Math.min(1, Math.sqrt(sum / data.length) * 5);
      micRaf = requestAnimationFrame(micLevel);
    };

    const startMic = async () => {
      const token = ++run;
      heard = '';
      field.innerHTML = '';
      demo.classList.remove('has-text');
      try {
        stream = stream || await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 512; ctx.createMediaStreamSource(stream).connect(analyser); }
        await ctx.resume();
      } catch {
        hint.textContent = 'Sin permiso de micrófono. Puedes ver la demostración sin él.';
        setMic(false);
        return;
      }
      rec = new SR();
      rec.lang = navigator.language && navigator.language.startsWith('en') ? 'en-US' : 'es-MX';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = e => {
        let fin = '', tmp = '';
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' ';
          else tmp += e.results[i][0].transcript;
        }
        heard = (fin + tmp).trim();
        showLive(heard.split(' ').slice(-9));
      };
      rec.onerror = ev => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { hint.textContent = 'Tu navegador no permitió el reconocimiento de voz.'; setMic(false); }
      };
      rec.onend = () => { if (mode === 'listening' && token === run) stopMic(); };
      setMode('listening');
      if (!levelRaf) animateLevel();
      micLevel();
      rec.start();
    };

    const stopMic = async () => {
      const token = run;
      cancelAnimationFrame(micRaf);
      try { rec && rec.stop(); } catch {}
      rec = null;
      await sleep(250);
      const clean = polish(heard);
      if (!clean) { stopLevel(); showLive([]); setMode('idle'); hint.textContent = 'No te escuché. Toca fn e inténtalo otra vez.'; return; }
      await finish(clean, token);
    };

    const setMic = on => {
      useMic = on;
      micBtn.setAttribute('aria-pressed', String(on));
      $('[data-mic-label]', micBtn).textContent = on ? 'Usando tu micrófono' : 'Probar con mi voz';
      micNote.hidden = !on;
      if (!on && stream) { stream.getTracks().forEach(t => t.stop()); stream = null; analyser = null; }
    };
    micBtn.addEventListener('click', () => { interacted = true; setMic(!useMic); });

    const press = () => {
      interacted = true;
      demo.classList.add('has-played');
      fnKey.classList.add('is-down');
      setTimeout(() => fnKey.classList.remove('is-down'), 140);
      if (mode === 'listening') {
        if (useMic) stopMic();
        else if (finishNow) finishNow();
        return;
      }
      if (mode === 'working') return;
      if (useMic) startMic(); else playScript();
    };
    fnKey.addEventListener('click', press);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && mode === 'listening') {
        run++; stopLevel(); showLive([]); setMode('idle');
        if (rec) try { rec.abort(); } catch {}
        hint.textContent = 'Cancelado. Esc funciona igual en cualquier app.';
      }
    });

    // Show it once by itself, so people see what fn does before touching anything.
    setTimeout(() => {
      const r = hero.getBoundingClientRect();
      if (!interacted && r.bottom > window.innerHeight * .5 && !document.hidden) playScript();
    }, reduced ? 600 : 2600);
  })();

  /* ---------------- Condensation section ---------------- */
  (() => {
    const holder = $('[data-sentence]');
    const state = $('[data-paper-state]');
    const stepEls = $$('.steps li');
    // kind: k = keep, f = filler (fades away), c = correction cut, s = swap (raw|clean)
    const T = [
      ['eh', 'f'], ['bueno', 'f'], ['o sea', 'f'], ['mañana|Mañana', 's'], ['nos', 'k'], ['vemos', 'k'],
      ['el', 'c'], ['martes', 'c'], ['no', 'c'], ['perdón', 'c'], ['el', 'k'], ['viernes', 'k'], ['a', 'k'], ['las', 'k'],
      ['cinco|cinco.', 's'], ['y', 'f'], ['llevas|¿Llevas', 's'], ['la', 'k'], ['presentación', 'k'], ['que', 'k'],
      ['hicimos', 'k'], ['en', 'k'], ['figma|Figma?', 's'],
    ];

    const build = () => {
      holder.innerHTML = '';
      holder.setAttribute('aria-label', 'Mañana nos vemos el viernes a las cinco. ¿Llevas la presentación que hicimos en Figma?');
      T.forEach(([text, kind], i) => {
        const s = document.createElement('span');
        s.className = 'tok gap ' + ({ f: 'fill', c: 'cut', s: 'sw', k: 'keep' })[kind];
        s.setAttribute('aria-hidden', 'true');
        if (kind === 's') {
          const [a, b] = text.split('|');
          s.innerHTML = `<span class="swap"><span class="from">${a}</span><span class="to">${b}</span></span>`;
        } else if (kind === 'c') {
          s.innerHTML = `<span class="strike">${text}</span>`;
        } else s.textContent = text;
        holder.appendChild(s);
      });
    };
    build();

    const setStep = i => {
      stepEls.forEach((li, j) => li.classList.toggle('is-on', j === i));
      state.textContent = ['Escuchando…', 'Transcribiendo…', 'Puliendo…', 'Pegado en #lanzamiento'][i];
      state.style.color = i === 3 ? '#1d8a52' : '';
    };

    if (!hasGsap || reduced) {
      // Final state, no motion.
      $$('.fill, .cut', holder).forEach(e => e.remove());
      $$('.swap .from', holder).forEach(e => e.remove());
      $$('.swap .to', holder).forEach(e => (e.style.opacity = 1));
      setStep(3);
      return;
    }

    let tl;
    const make = () => {
      if (tl) { tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); }
      build();
      const toks = $$('.tok', holder);
      const fills = $$('.fill', holder);
      const cuts = $$('.cut', holder);
      const strikes = $$('.cut .strike', holder);
      // Freeze natural widths so collapsing can scrub both ways.
      [...fills, ...cuts].forEach(el => gsap.set(el, { width: el.getBoundingClientRect().width }));
      gsap.set(toks, { opacity: 0, filter: 'blur(10px)' });
      gsap.set(holder, { color: '#7e8aa0' });

      const isMobile = window.matchMedia('(max-width: 760px)').matches;
      tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '[data-condense-section]',
          start: 'top top',
          end: () => '+=' + (isMobile ? 1500 : 2200),
          pin: '[data-condense-pin]',
          scrub: .6,
          anticipatePin: 1,
          onUpdate: self => {
            const p = self.progress;
            setStep(p < .3 ? 0 : p < .42 ? 1 : p < .82 ? 2 : 3);
          },
        },
      });
      // 1. Listening: words condense in one by one
      tl.to(toks, { opacity: 1, filter: 'blur(0px)', duration: .28, stagger: .3 / toks.length }, 0)
        // 2. Transcribed: hold
        .to({}, { duration: .1 })
        // 3. Polish: fillers dissolve back into mist
        .to(fills, { opacity: 0, filter: 'blur(12px)', y: -6, duration: .12, stagger: .02 }, .45)
        .to(fills, { width: 0, marginRight: 0, duration: .1 }, .55)
        // corrections: strike, then dissolve
        .to(strikes, { '--s': 1, duration: .08, stagger: .015 }, .5)
        .to(cuts, { opacity: 0, filter: 'blur(12px)', duration: .08 }, .62)
        .to(cuts, { width: 0, marginRight: 0, duration: .08 }, .68)
        // swaps: casing and punctuation condense in
        .to($$('.swap .from', holder), { opacity: 0, filter: 'blur(8px)', duration: .06 }, .7)
        .fromTo($$('.swap .to', holder), { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: .08, stagger: .02 }, .72)
        // 4. Pasted: ink
        .to(holder, { color: '#0f1729', duration: .08 }, .84)
        .to({}, { duration: .12 });
    };
    make();
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastW) < 40) return;
      lastW = window.innerWidth;
      clearTimeout(make._t);
      make._t = setTimeout(() => { make(); ScrollTrigger.refresh(); }, 200);
    });
  })();

  /* ---------------- Apps: horizontal tour, pill re-tints ---------------- */
  (() => {
    const track = $('[data-apps-track]');
    const pill = $('[data-apps-pill]');
    const label = $('[data-apps-label]');
    const apps = [
      { name: 'WhatsApp', logo: 'whatsapp', color: '#25d366', cls: 'wa', meta: 'Familia', tone: 'Breve, como chat',
        body: '<span class="msg">Ya voy saliendo, llego en 10. ¿Quieren que pase por pan?</span>' },
      { name: 'Slack', logo: 'slack', color: '#e01e5a', meta: '#producto', tone: 'Directo, con contexto',
        body: '<p>Ya quedó el deploy. ¿Revisas el PR cuando puedas? Te dejé los cambios en la rama de diseño.</p>' },
      { name: 'Gmail', logo: 'gmail', color: '#ea4335', meta: 'Nuevo mensaje', tone: 'Párrafos y saludo',
        body: '<p>Hola, Andrea:</p><p>Te comparto la propuesta actualizada con los cambios que platicamos el jueves. Si te parece bien, la presentamos el lunes.</p><p>Saludos,<br>Yair</p>' },
      { name: 'Claude', logo: 'claude', color: '#d97757', meta: 'Nuevo chat', tone: 'Prompts largos sin teclear',
        body: '<p>Revisa este componente de React y dime por qué se vuelve a renderizar cada vez que escribo en el input. Explícamelo paso a paso y propón una solución con useMemo.</p>' },
      { name: 'Notion', logo: 'notion', color: '#8a8f98', meta: 'Lanzamiento', tone: 'Listas cuando dictas listas',
        body: '<ul class="notion-list"><li>Grabar el video de la píldora</li><li>Publicar la versión 0.6</li><li>Responder los issues de la semana</li></ul>' },
      { name: 'VS Code', logo: 'vscode', color: '#2f8fe0', meta: 'auth.ts', tone: 'Exacto en tu editor',
        body: '<div class="code"><span class="c">// Valida el token antes de llamar a fetchUser()</span>\n<span class="k">if</span> (!token) <span class="k">return</span> <span class="f">redirect</span>(<span>"/login"</span>);</div>' },
      { name: 'Linear', logo: 'linear', color: '#5e6ad2', meta: 'Nuevo issue', tone: 'Títulos claros',
        body: '<div class="issue"><span class="issue-id">BRU-42</span><p><b>La píldora no aparece en pantallas externas.</b> Pasa al conectar un segundo monitor con el Dock oculto.</p></div>' },
    ];
    track.innerHTML = apps.map((a, i) => `
      <article class="app-card ${a.cls || ''}" style="--c:${a.color}" data-i="${i}">
        <div class="app-top"><img src="assets/brands/${a.logo}.svg" alt="" width="22" height="22" />${a.name}<small>${a.meta}</small></div>
        <div class="app-body">${a.body}<div class="app-tone">${a.tone}</div></div>
      </article>`).join('');
    const cards = $$('.app-card', track);
    let active = -1;
    const activate = i => {
      if (i === active) return;
      active = i;
      cards.forEach((c, j) => c.classList.toggle('is-active', j === i));
      label.textContent = apps[i].name;
      if (hasGsap) gsap.to(pill, { '--brand': apps[i].color, duration: .5, ease: 'power2.out' });
      else pill.style.setProperty('--brand', apps[i].color);
    };
    activate(0);

    if (!hasGsap || reduced) {
      track.style.overflowX = 'auto';
      track.style.scrollSnapType = 'x mandatory';
      cards.forEach(c => (c.style.scrollSnapAlign = 'center'));
      track.addEventListener('scroll', () => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0, d = Infinity;
        cards.forEach((c, j) => { const cm = c.offsetLeft + c.offsetWidth / 2; if (Math.abs(cm - mid) < d) { d = Math.abs(cm - mid); best = j; } });
        activate(best);
      }, { passive: true });
      return;
    }

    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: '[data-apps]',
        start: 'top top',
        end: () => '+=' + Math.max(dist(), window.innerHeight),
        pin: '[data-apps-pin]',
        scrub: .7,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => {
          // Card closest to the center of the screen wears the pill.
          const mid = window.innerWidth / 2;
          let best = 0, d = Infinity;
          cards.forEach((c, j) => { const r = c.getBoundingClientRect(); const cm = r.left + r.width / 2; if (Math.abs(cm - mid) < d) { d = Math.abs(cm - mid); best = j; } });
          activate(best);
        },
      },
    });
  })();

  /* ---------------- Ledger: what you say vs what Bruma writes ---------------- */
  if (hasGsap && !reduced) {
    $$('[data-ledger]').forEach(row => {
      const wrote = $('.wrote', row);
      const why = $('.why', row);
      gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 82%', toggleActions: 'play none none reverse' } })
        .from(wrote, { opacity: 0, filter: 'blur(12px)', x: -10, duration: .9, ease: 'power3.out' })
        .from(why, { opacity: 0, duration: .5 }, .35);
    });
  }

  /* ---------------- Learn demo ---------------- */
  (() => {
    const pill = $('[data-learn-pill]');
    const fix = $('[data-fix]');
    const replay = $('[data-learn-replay]');
    const strike = $('s', fix), good = $('b', fix);
    let played = false;
    const reset = () => {
      pill.dataset.mode = 'idle';
      strike.style.cssText = ''; good.style.cssText = 'opacity:0;filter:blur(8px)';
      replay.hidden = true;
    };
    const play = async () => {
      reset();
      await sleep(500);
      strike.style.cssText = `max-width:${strike.scrollWidth}px;transition:opacity .45s, filter .45s, max-width .5s .25s, margin .5s .25s;`;
      strike.getBoundingClientRect();
      strike.style.cssText += 'opacity:0;filter:blur(6px);max-width:0;margin-right:-.28em';
      good.style.cssText = 'transition:opacity .6s, filter .6s;opacity:1;filter:blur(0)';
      await sleep(900);
      pill.dataset.mode = 'learn';
    };
    $('[data-learn-add]').addEventListener('click', async () => { pill.dataset.mode = 'learned'; await sleep(2200); pill.dataset.mode = 'idle'; replay.hidden = false; });
    $('[data-learn-no]').addEventListener('click', () => { pill.dataset.mode = 'idle'; replay.hidden = false; });
    replay.addEventListener('click', play);
    reset();
    new IntersectionObserver(([e], o) => { if (e.isIntersecting && !played) { played = true; play(); o.disconnect(); } }, { threshold: .6 }).observe($('.learn-stage'));
  })();

  /* ---------------- Showcase ---------------- */
  (() => {
    const device = $('[data-device]');
    $$('[data-shot]').forEach(btn => btn.addEventListener('click', () => {
      device.dataset.theme = btn.dataset.shot;
      $$('[data-shot]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    }));
    if (hasGsap && !reduced) {
      gsap.fromTo('.device-frame', { rotateX: 16, scale: .9, y: 40 }, {
        rotateX: 0, scale: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: device, start: 'top 95%', end: 'top 25%', scrub: .6 },
      });
    }
    // Count-ups
    $$('[data-count]').forEach(el => {
      const to = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
      const render = v => (el.textContent = pre + Math.round(v).toLocaleString('es-MX') + suf);
      if (!hasGsap || reduced) return render(to);
      render(0);
      const o = { v: 0 };
      ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => render(o.v) }) });
    });
  })();

  /* ---------------- Privacy route ---------------- */
  if (hasGsap && !reduced) {
    const mobile = () => window.matchMedia('(max-width: 960px)').matches;
    $$('[data-route-dot]').forEach((dot, i) => {
      const tw = gsap.fromTo(dot,
        { left: () => (mobile() ? '50%' : '0%'), top: () => (mobile() ? '0%' : '50%') },
        { left: () => (mobile() ? '50%' : '100%'), top: () => (mobile() ? '100%' : '50%'), duration: 1.6, ease: 'power1.inOut', repeat: -1, delay: i * .8, paused: true });
      ScrollTrigger.create({ trigger: '[data-route]', start: 'top 85%', end: 'bottom 10%', onToggle: s => (s.isActive ? tw.play() : tw.pause()) });
    });
    gsap.from('.route-ghost', { opacity: 0, y: 14, filter: 'blur(8px)', duration: .9, scrollTrigger: { trigger: '[data-route]', start: 'top 60%' } });
  }

  /* ---------------- Download ---------------- */
  if (hasGsap && !reduced) {
    gsap.fromTo('[data-download-sky] img', { yPercent: -8 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: '[data-download]', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from('.download-inner h2', { opacity: 0, filter: 'blur(16px)', y: 30, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '[data-download]', start: 'top 55%' } });
  }
  const copy = $('[data-copy]');
  copy.addEventListener('click', async () => {
    const text = $('[data-cmd]').textContent;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const r = document.createRange(); r.selectNodeContents($('[data-cmd]'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges();
    }
    copy.textContent = 'Copiado';
    copy.classList.add('is-done');
    setTimeout(() => { copy.textContent = 'Copiar'; copy.classList.remove('is-done'); }, 1800);
  });

  window.addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
