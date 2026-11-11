"use strict";
/* The landing hero's globe: the agent at rest, waiting for a question.
   It is the same dot globe that thinks during a build, here breathing slowly. It leans in a little
   when the command bar takes focus and again when someone types. It runs only on the landing, and
   stops while it is off screen or the browser tab is hidden.                                       */

const Hero = (()=>{
  const cv = $("#idle");
  if (!cv) return { start(){}, stop(){} };
  const ctx = cv.getContext("2d"), cmd = $("#cmd");
  const N = 300, GOLD = Math.PI * (3 - Math.sqrt(5)), dots = [];
  for (let i = 0; i < N; i++){
    const y = 1 - (i + .5) / N * 2, r = Math.sqrt(1 - y*y), th = i * GOLD;
    dots.push({ ux:Math.cos(th)*r, uy:y, uz:Math.sin(th)*r, lat:Math.asin(y) });
  }
  const DEEP = [110,155,209], FROST = [214,230,245];
  const BREATH = 5600;                          // one slow breath, in ms

  let W = 0, H = 0, raf = 0, last = 0, spin = 0, focus = 0, typing = 0, inView = true;
  function size(){
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (RM) draw(performance.now(), 0);
  }

  function draw(now, dt){
    // ease toward listening: focus in the command bar, then text in it
    const k = Math.min(1, dt / 450);
    focus  += ((document.activeElement === cmd ? 1 : 0) - focus) * k;
    typing += ((cmd.value.trim() ? 1 : 0) - typing) * k;
    spin += dt * (1 + .8*focus + .5*typing);    // turns a little faster while it listens

    const breath = RM ? .5 : .5 - .5*Math.cos(now / BREATH * Math.PI * 2);
    if (!RM) Seam.breathe(breath * (.8 + .2*focus));     // the shell's bottom line breathes with it
    const cx = W/2, cy = H/2;
    const R = Math.min(W, H) * .4 * (.93 + .07*breath + .04*focus);
    const glow = .55 + .3*breath + .15*focus;
    const amp = .03 + .05*typing;
    const a = spin * .00028, tilt = -.38;

    ctx.clearRect(0, 0, W, H);
    for (const d of dots){
      const x = d.ux*Math.cos(a) + d.uz*Math.sin(a);
      const z = -d.ux*Math.sin(a) + d.uz*Math.cos(a);
      const y2 = d.uy*Math.cos(tilt) - z*Math.sin(tilt);
      const z2 = d.uy*Math.sin(tilt) + z*Math.cos(tilt);
      const rr = R * (1 + amp*Math.sin(d.lat*5 - now*.0016));   // the slow wave across its latitudes
      const depth = (z2 + 1) / 2;
      const c = DEEP.map((v, i)=>v + (FROST[i] - v)*depth);
      ctx.fillStyle = `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${(.08 + .82*depth) * glow})`;
      ctx.beginPath(); ctx.arc(cx + x*rr, cy + y2*rr, .5 + 1.35*depth, 0, 6.2832); ctx.fill();
    }
  }
  function frame(now){
    draw(now, last ? Math.min(64, now - last) : 16);
    last = now;
    raf = requestAnimationFrame(frame);
  }

  const onLanding = () => !document.body.classList.contains("tabs-on");
  function sync(){
    const run = !RM && onLanding() && inView && !document.hidden;
    if (run && !raf){ last = 0; raf = requestAnimationFrame(frame); }
    if (!run && raf){ cancelAnimationFrame(raf); raf = 0; Seam.breathe(0); }
  }
  new ResizeObserver(size).observe(cv);
  new IntersectionObserver(([e])=>{ inView = e.isIntersecting; sync(); }).observe(cv);
  document.addEventListener("visibilitychange", sync);
  // the first tab folds the hero away; closing the last tab brings it back
  new MutationObserver(sync).observe(document.body, { attributes:true, attributeFilter:["class"] });

  return { start(){ size(); sync(); }, stop(){ cancelAnimationFrame(raf); raf = 0; Seam.breathe(0); } };
})();
