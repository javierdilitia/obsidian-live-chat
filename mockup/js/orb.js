"use strict";
/* The dot globe: it thinks where the page will appear, then its dots fly out and land on the page's outline. */

const Orb = (()=>{
  const cv = document.createElement("canvas");
  cv.className = "orb"; cv.setAttribute("aria-hidden","true");
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  const N = 300, GOLD = Math.PI * (3 - Math.sqrt(5));
  const dots = [];
  for (let i = 0; i < N; i++){
    const y = 1 - (i + .5) / N * 2, r = Math.sqrt(1 - y*y), th = i * GOLD;
    dots.push({ ux:Math.cos(th)*r, uy:y, uz:Math.sin(th)*r, lat:Math.asin(y) });
  }
  const DEEP=[110,155,209], FROST=[214,230,245], STEEL=[156,190,224];
  let W=0, H=0, raf=0, mode="off", born=0, flyAt=0, fadeAt=0, cx=0, cy=0, R=100;
  function size(){
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size(); addEventListener("resize", size);
  const mix = (a,b,t)=>a+(b-a)*t;
  const outExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10*t);

  function sphereAt(d, t){
    const a = t * .00042, tilt = -.38;
    const x = d.ux*Math.cos(a) + d.uz*Math.sin(a);
    const z = -d.ux*Math.sin(a) + d.uz*Math.cos(a);
    const y2 = d.uy*Math.cos(tilt) - z*Math.sin(tilt);
    const z2 = d.uy*Math.sin(tilt) + z*Math.cos(tilt);
    const g = 1 - Math.pow(1 - Math.min(1, t/750), 3);           // forms out of a point
    const wave = 1 + .05*Math.sin(d.lat*5 - t*.0042);             // the synth LFO, rolled across latitudes
    const rr = R * wave * (.5 + .5*g);
    const depth = (z2 + 1) / 2;
    return { x:cx + x*rr, y:cy + y2*rr, a:(.1 + .8*depth) * g, s:.55 + 1.45*depth, depth };
  }
  function frame(now){
    ctx.clearRect(0, 0, W, H);
    const t = RM ? 4000 : now - born;
    const fade = fadeAt ? clamp(1 - (now - fadeAt) / 520, 0, 1) : 1;
    for (const d of dots){
      let p;
      if (mode === "think"){ p = sphereAt(d, t); d.last = p; }
      else {
        const k = outExpo(clamp((now - flyAt - d.delay) / d.dur, 0, 1));
        const s = d.last, u = 1 - k;
        // a curved path: each dot swings outward from the globe before landing
        p = { x:u*u*s.x + 2*u*k*d.cx + k*k*d.tx, y:u*u*s.y + 2*u*k*d.cy + k*k*d.ty,
              a:mix(s.a, .8, k), s:mix(s.s, 1.15, k), depth:mix(s.depth, .55, k) };
      }
      const c = mode === "think" ? DEEP.map((v,i)=>mix(v, FROST[i], p.depth)) : DEEP.map((v,i)=>mix(v, STEEL[i], .7));
      ctx.fillStyle = `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${p.a * fade})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.2832); ctx.fill();
    }
    if (fadeAt && fade <= 0){ stop(); return; }
    raf = requestAnimationFrame(frame);
  }
  function stop(){ cancelAnimationFrame(raf); raf = 0; mode = "off"; fadeAt = 0; ctx.clearRect(0, 0, W, H); }
  return {
    think(x, y, r){
      stop(); cx = x; cy = y; R = r; mode = "think"; born = performance.now();
      raf = requestAnimationFrame(frame);
    },
    /* every dot leaves the globe for a point on the outline; resolves when they've landed */
    land(points){
      if (!points.length || RM){ return Promise.resolve(); }
      const now = performance.now();
      dots.forEach((d, i)=>{
        if (!d.last) d.last = sphereAt(d, now - born);
        const tp = points[i % points.length];
        d.tx = tp[0]; d.ty = tp[1];
        const ox = d.last.x - cx, oy = d.last.y - cy, len = Math.hypot(ox, oy) || 1;
        const push = 60 + Math.random()*70;
        d.cx = (d.last.x + d.tx)/2 + ox/len*push; d.cy = (d.last.y + d.ty)/2 + oy/len*push;
        d.delay = Math.random() * 260; d.dur = 680 + Math.random() * 260;
      });
      flyAt = now; mode = "fly";
      return new Promise(r => setTimeout(r, 1080));
    },
    fade(){ if (mode !== "off") fadeAt = performance.now(); },
    stop,
  };
})();

/* the blocks of a page whose outlines the dots land on */
const OUTLINE = ".artifact, .art-header h2, .art-meta, .verdict, .prod, .spec-row, .chart-cell, .explain-body > *, .step, .ord-cell, .art-foot";

/* points spaced along the outlines of the given elements — only what sits on screen */
function outlinePoints(nodes, n){
  const top = $("#chrome").getBoundingClientRect().bottom + 4, bottom = innerHeight - 4;
  const rects = nodes.map(node=>node.getBoundingClientRect())
    .map(r=>({ x:r.left, y:Math.max(r.top, top), w:r.width, h:Math.min(r.bottom, bottom) - Math.max(r.top, top) }))
    .filter(r=>r.h > 3 && r.w > 3);
  const total = rects.reduce((s,r)=>s + 2*(r.w + r.h), 0);
  if (!total) return [];
  const pts = [];
  rects.forEach(r=>{
    const L = 2*(r.w + r.h), k = Math.max(4, Math.round(L / total * n));
    for (let i = 0; i < k; i++){
      let d = (i + .5) / k * L, x, y;
      if (d < r.w){ x = r.x + d; y = r.y; }
      else if ((d -= r.w) < r.h){ x = r.x + r.w; y = r.y + d; }
      else if ((d -= r.h) < r.w){ x = r.x + r.w - d; y = r.y + r.h; }
      else { d -= r.w; x = r.x; y = r.y + r.h - d; }
      pts.push([x, y]);
    }
  });
  for (let i = pts.length - 1; i > 0; i--){ const j = Math.random()*(i+1)|0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
  return pts;
}

/* where the globe sits: the middle of the visible workspace */
function orbCenter(){
  const ws = $("#workspace").getBoundingClientRect();
  const top = Math.max($("#chrome").getBoundingClientRect().bottom, ws.top);
  const span = innerHeight - top;
  const inner = ws.width - 48;
  return { x:ws.left + ws.width/2, y:top + span*.44, r:clamp(Math.min(span*.27, inner*.32), 56, 128) };
}
