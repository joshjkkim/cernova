'use client';

/**
 * Landing page — a cockpit HUD over a 3D star system: the nova (the logo) sits at
 * the centre and you orbit + dolly around it as you scroll, each waypoint a beat of
 * the story (detect / diagnose / locate / connect), then a content dossier.
 *
 * Accessibility: honours prefers-reduced-motion — no scroll-linked flight, the
 * beacons stack as a normal page over a static star field. The previous editorial
 * landing is preserved at /classic.
 */

import Link from 'next/link';
import { useEffect, useRef } from 'react';

interface WP { th: number; D: number; cy: number; active: string }

export default function Home() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 680px)').matches;
    const stacked = reduce || mobile; // phones + reduced-motion: no flight, stack the content

    // Guard against horizontal overflow from fixed HUD / wide panels while mounted.
    const prevOverflowX = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const smooth = (t: number) => t * t * (3 - 2 * t);
    function mulberry32(a: number) {
      return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    }

    const F = 820, NEAR = 60;
    const WP: WP[] = [
      { th: 0.00, D: 1500, cy: 0, active: 'nova' },
      { th: 0.95, D: 860, cy: -120, active: 'field' },
      { th: 1.75, D: 470, cy: 20, active: 'nova' },
      { th: 3.05, D: 880, cy: 160, active: 'rogue' },
      { th: 4.25, D: 900, cy: -40, active: 'routes' },
    ];
    const R = 500, OFF = 0.4;
    const ring = (a: number, y: number, kind: string) => ({ x: R * Math.sin(a), y, z: R * Math.cos(a), kind });
    const LM: Record<string, { x: number; y: number; z: number; kind: string }> = {
      nova: { x: 0, y: 0, z: 0, kind: 'nova' },
      field: ring(0.95 - OFF, -120, 'constellation'),
      rogue: ring(3.05 - OFF, 160, 'rogue'),
      routes: ring(4.25 - OFF, -40, 'routes'),
    };

    let W = 0, H = 0, DPR = 1, stars: { x: number; y: number; z: number; base: number; tw: number; ts: number; violet: boolean; cross: boolean }[] = [];

    function build() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      const cw = cv.clientWidth, ch = cv.clientHeight;
      W = cv.width = cw * DPR; H = cv.height = ch * DPR;
      const rnd = mulberry32(20260726);
      // star count scales with viewport, capped for mobile perf
      const N = Math.min(1300, Math.round(cw * ch / 900));
      stars = [];
      for (let i = 0; i < N; i++) {
        const a = rnd() * 6.283, b = (rnd() - 0.5) * Math.PI, r = 500 + rnd() * 2600;
        stars.push({ x: Math.cos(b) * Math.cos(a) * r, y: Math.sin(b) * r * 0.6, z: Math.cos(b) * Math.sin(a) * r,
          base: 0.16 + rnd() * 0.7, tw: rnd() * 6.28, ts: 0.5 + rnd() * 1.5, violet: rnd() < 0.06, cross: rnd() < 0.04 });
      }
    }

    function cam(p: number) {
      const seg = p * (WP.length - 1); const i = clamp(Math.floor(seg), 0, WP.length - 2); const ft = smooth(seg - i);
      return { th: lerp(WP[i].th, WP[i + 1].th, ft), D: lerp(WP[i].D, WP[i + 1].D, ft), cy: lerp(WP[i].cy, WP[i + 1].cy, ft), i, ft };
    }
    function project(px: number, py: number, pz: number, c: { D: number; cy: number }, ca: number, sa: number) {
      const rx = px * ca + pz * sa, rz = -px * sa + pz * ca;
      const d = c.D - rz; if (d < NEAR) return null;
      const s = F / d;
      return { sx: W / 2 + rx * s * DPR, sy: H / 2 + (py - c.cy) * s * DPR, s, d };
    }

    // The Cernova logomark itself (public/logo.svg geometry, 512 viewbox → centre 256).
    function nova(sx: number, sy: number, s: number, t: number) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
      const Rout = (56 + pulse * 10) * s * DPR;      // outer star radius
      const u = Rout / 224;                          // svg half-extent (256−32) → screen scale
      const P = (dx: number, dy: number): [number, number] => [sx + dx * u, sy + dy * u];
      const poly = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([dx, dy], i) => { const [x, y] = P(dx, dy); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
      const lw = clamp(1.1 * s, 0.5, 3) * DPR;

      // brightening halo
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Rout * 2.4);
      g.addColorStop(0, `rgba(183,148,244,${0.18 + pulse * 0.10})`); g.addColorStop(1, 'rgba(183,148,244,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, Rout * 2.4, 0, 6.283); ctx.fill();

      ctx.strokeStyle = '#b794f4'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // outer 8-point nova star
      ctx.globalAlpha = 0.92; ctx.lineWidth = lw * 1.7;
      poly([[0, -224], [51, -51], [224, 0], [51, 51], [0, 224], [-51, 51], [-224, 0], [-51, -51]]); ctx.stroke();
      // facet lines, tip → core
      ctx.globalAlpha = 0.6; ctx.lineWidth = lw;
      ([[[0, -224], [0, -44]], [[224, 0], [44, 0]], [[0, 224], [0, 44]], [[-224, 0], [-44, 0]]] as [number, number][][]).forEach(([a, b]) => { const A = P(a[0], a[1]), B = P(b[0], b[1]); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); });
      // crystal shards
      ctx.globalAlpha = 0.7; ctx.fillStyle = '#b794f4';
      ([[[67, -67], [77, -100], [117, -117], [100, -77]], [[67, 67], [100, 77], [117, 117], [77, 100]], [[-67, 67], [-100, 77], [-117, 117], [-77, 100]], [[-67, -67], [-77, -100], [-117, -117], [-100, -77]]] as [number, number][][]).forEach((q) => { poly(q); ctx.fill(); });
      // core diamond
      ctx.globalAlpha = 0.92; ctx.lineWidth = lw * 1.7; poly([[0, -44], [44, 0], [0, 44], [-44, 0]]); ctx.stroke();
      ctx.globalAlpha = 0.85; ctx.fill();
      ctx.globalAlpha = 1;
    }
    function constellation(sx: number, sy: number, s: number) {
      const pts = ([[0, -70], [64, -24], [40, 58], [-44, 50], [-66, -30]] as [number, number][]).map(([x, y]) => [sx + x * s * DPR, sy + y * s * DPR] as [number, number]);
      ctx.strokeStyle = 'rgba(183,148,244,.42)'; ctx.lineWidth = .9 * DPR;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.fillStyle = '#e9e4f0'; for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 2 * s * DPR, 0, 6.283); ctx.fill(); }
    }
    function rogue(sx: number, sy: number, s: number, t: number) {
      const q = 8 * s * DPR;
      ctx.strokeStyle = 'rgba(224,83,61,.35)'; ctx.lineWidth = DPR; ctx.setLineDash([4 * DPR, 5 * DPR]);
      ctx.beginPath(); ctx.moveTo(sx - 150 * s * DPR, sy - 120 * s * DPR); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#e0533d'; ctx.lineWidth = 1.8 * DPR;
      ctx.beginPath(); ctx.moveTo(sx - q, sy - q); ctx.lineTo(sx + q, sy + q); ctx.moveTo(sx + q, sy - q); ctx.lineTo(sx - q, sy + q); ctx.stroke();
      const pulse = 0.5 + 0.5 * Math.sin(t * 2); ctx.strokeStyle = `rgba(224,83,61,${.15 + pulse * .25})`; ctx.beginPath(); ctx.arc(sx, sy, (20 + pulse * 8) * s * DPR, 0, 6.283); ctx.stroke();
    }
    function routes(sx: number, sy: number, s: number) {
      const ends = ([[-140, -40], [0, -96], [150, -20], [70, 86]] as [number, number][]).map(([x, y]) => [sx + x * s * DPR, sy + y * s * DPR] as [number, number]);
      ctx.strokeStyle = 'rgba(183,148,244,.45)'; ctx.lineWidth = .9 * DPR;
      for (const [x, y] of ends) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = '#e9e4f0'; ctx.beginPath(); ctx.arc(x, y, 2.2 * s * DPR, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = '#b794f4'; ctx.beginPath(); ctx.arc(sx, sy, 4 * s * DPR, 0, 6.283); ctx.fill();
    }
    const PAINT: Record<string, (sx: number, sy: number, s: number, t: number) => void> = { nova, constellation, rogue, routes };

    const $ = (sel: string) => root.querySelector(sel) as HTMLElement | null;
    const beacons = [...root.querySelectorAll<HTMLElement>('.beacon')];
    const reticle = $('.reticle'), tgt = $('.tgt');
    const names: Record<string, string> = { nova: 'diagnose', field: 'detect', rogue: 'locate', routes: 'connect' };

    function paint(p: number, t: number) {
      const c = cam(p), ca = Math.cos(-c.th), sa = Math.sin(-c.th);
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        const pr = project(s.x, s.y, s.z, c, ca, sa); if (!pr) continue;
        if (pr.sx < -40 || pr.sx > W + 40 || pr.sy < -40 || pr.sy > H + 40) continue;
        const rad = clamp(pr.s * 1.5, 0.4, 3.2) * DPR;
        const fade = clamp(pr.d / 2600, 0, 1);
        const tw = 0.6 + 0.4 * Math.sin(t * s.ts + s.tw);
        ctx.globalAlpha = s.base * tw * (1 - fade * 0.7);
        ctx.fillStyle = s.violet ? '#b794f4' : '#e9e4f0';
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, rad, 0, 6.283); ctx.fill();
        if (s.cross && pr.s > 0.5) { ctx.globalAlpha *= 0.5; ctx.strokeStyle = ctx.fillStyle as string; ctx.lineWidth = .6 * DPR; const L = rad * 3; ctx.beginPath(); ctx.moveTo(pr.sx - L, pr.sy); ctx.lineTo(pr.sx + L, pr.sy); ctx.moveTo(pr.sx, pr.sy - L); ctx.lineTo(pr.sx, pr.sy + L); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      const items = Object.values(LM).map((l) => ({ l, pr: project(l.x, l.y, l.z, c, ca, sa) })).filter((o) => o.pr).sort((a, b) => b.pr!.d - a.pr!.d);
      for (const { l, pr } of items) PAINT[l.kind](pr!.sx, pr!.sy, pr!.s, t);
      ctx.globalAlpha = 1;

      const active = clamp(Math.round(p * (WP.length - 1)), 0, WP.length - 1);
      beacons.forEach((b, i) => { b.style.opacity = String(clamp(1 - Math.abs(p * (WP.length - 1) - i) * 1.6, 0, 1)); });
      const kind = WP[active].active, isRogue = kind === 'rogue';
      reticle?.classList.toggle('lock', true); reticle?.classList.toggle('rogue', isRogue);
      tgt?.classList.toggle('rogue', isRogue);
      if (tgt) tgt.innerHTML = `◆ stage <b>${names[kind]}</b>`;
      // lock the reticle + label onto the active landmark's actual projected position
      const alm = LM[kind];
      const apr = alm && project(alm.x, alm.y, alm.z, c, ca, sa);
      if (apr) {
        const rx = apr.sx / DPR, ry = apr.sy / DPR;
        if (reticle) { reticle.style.left = `${rx}px`; reticle.style.top = `${ry}px`; }
        if (tgt) { tgt.style.left = `${rx}px`; tgt.style.top = `${ry + 130}px`; }
      }
      const zlit = Math.round(clamp((1600 - c.D) / 1300, 0, 1) * 8);
      const zoomEl = $('.zoom'); if (zoomEl) zoomEl.innerHTML = Array.from({ length: 8 }, (_, i) => `<div class="z ${i < zlit ? 'on' : ''}"></div>`).join('') + `<span>zoom ${(1500 / c.D).toFixed(1)}×</span>`;
      const tr = $('.r-tr'); if (tr) tr.innerHTML = `sector<br><span class="${isRogue ? 'r' : 'b'}">llm-pipeline / ${names[kind]}</span>`;
      const bl = $('.r-bl'); if (bl) bl.innerHTML = `<span class="dotlive">● detection online</span><br>yaw ${(c.th * 57.3).toFixed(0).padStart(3, '0')}° · dist ${c.D.toFixed(0)}`;
      const br = $('.r-br'); if (br) br.innerHTML = isRogue ? '<span class="r">◆ 1 anomaly</span> · generate-reply' : (4102 - active * 130) + ' calls scored';
      const hd = Math.round(c.th * 57.3) % 360;
      const hEl = $('.heading'); if (hEl) hEl.innerHTML = [-40, -20, 0, 20, 40].map((d) => { const v = ((hd + d) % 360 + 360) % 360; return `<span class="h ${d === 0 ? 'mid' : ''}">${String(v).padStart(3, '0')}</span>`; }).join('');
    }

    const hud = $('.hud');
    const trackEl = $('.track');
    // hudFade drives the handoff: flight overlay fades out as the dossier scrolls in.
    let hudFade = 1;
    const applyFade = () => {
      if (hud) hud.style.opacity = String(hudFade);
      beacons.forEach((b) => { b.style.opacity = String(Number(b.style.opacity || 0) * hudFade); });
    };

    build();

    if (stacked) {
      // Phones + reduced-motion: no flight. Static field backdrop, beacons stack.
      root.classList.add('reduced');
      paint(0, 0);
      const onResize = () => { build(); paint(0, 0); };
      window.addEventListener('resize', onResize);
      return () => { window.removeEventListener('resize', onResize); document.body.style.overflowX = prevOverflowX; };
    }

    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      const flightRange = Math.max(1, (trackEl?.offsetHeight ?? window.innerHeight) - window.innerHeight);
      const p = clamp(window.scrollY / flightRange, 0, 1);
      hudFade = 1 - clamp((window.scrollY - (flightRange - window.innerHeight * 0.4)) / (window.innerHeight * 0.6), 0, 1);
      paint(p, t);
      applyFade();
      raf = requestAnimationFrame(loop);
    };
    const onResize = () => build();
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); document.body.style.overflowX = prevOverflowX; };
  }, []);

  return (
    <div className="flight" ref={rootRef}>
      <div className="viewport"><canvas ref={canvasRef} className="sky" /></div>
      <div className="glass" />

      <nav className="fnav">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Cernova" width={22} height={22} className="brand-mark" />
          Cernova
        </div>
        <div className="navlinks"><Link href="/docs">Docs</Link><Link href="/about">About</Link><Link href="/login">Sign in</Link></div>
      </nav>

      <div className="beacon pl" data-wp="0">
        <div className="region">Detection layer for LLM pipelines</div>
        <h1>Your agent<br />is failing.<br /><span className="em">Silently.</span><span className="tcursor" /></h1>
        <p>Cernova learns what each step normally does and flags the moment one breaks — the failures your logs record as success.</p>
        <div><Link className="cta" href="/login">Start free →</Link><Link className="ghost" href="/docs">See how it works</Link></div>
      </div>
      <div className="beacon pr" data-wp="1">
        <div className="region">01 · Detect</div>
        <h2>It learns as<br />your agent runs.</h2>
        <p>Every step gets a baseline from its own history — no thresholds to configure. Cernova knows what normal looks like for this exact call.</p>
        <div className="chips"><span className="chip">profile <b>#d4b97b</b></span><span className="chip"><b>847</b> clean samples</span></div>
      </div>
      <div className="beacon pl" data-wp="2">
        <div className="region">02 · Diagnose</div>
        <h2>Catches what your<br /><span className="em">logs call success.</span></h2>
        <p>When a call breaks the pattern you get the evidence — what Cernova observed, and what it expected.</p>
        <div className="chips"><span className="chip">observed <b>3400ms</b></span><span className="chip">expected <b>≤ 240</b></span></div>
      </div>
      <div className="beacon pr" data-wp="3">
        <div className="region">03 · Locate</div>
        <h2>Straight to the<br /><span className="rd">exact line.</span></h2>
        <p>Every call records where in your code it ran — from “this step broke” to the file and line, for you or an agent in your editor.</p>
        <div className="chips"><span className="chip rd">anomaly <b>generate-reply</b></span><span className="chip">at <b>workflow.ts:256</b></span></div>
      </div>
      <div className="beacon pl" data-wp="4">
        <div className="region">04 · Connect</div>
        <h2>Alerts where you<br />already work.</h2>
        <p>Pull anomalies into Claude Code over MCP, or push signed events to Slack, Sentry, and your own webhook. Keep your stack.</p>
        <div className="chips"><span className="chip"><b>@cernova/mcp</b></span><span className="chip">slack</span><span className="chip">sentry</span></div>
      </div>

      {/* one-time POV console power-up (JARVIS-style): rings lock, systems arm, then dissolves */}
      <div className="boot" aria-hidden="true">
        <div className="boot-scrim" />
        <div className="boot-rig">
          <svg viewBox="0 0 340 340">
            <g className="boot-ringA" fill="none" stroke="currentColor">
              <circle cx="170" cy="170" r="150" strokeDasharray="2 13" strokeWidth="1.5" strokeOpacity=".85" />
              <circle cx="170" cy="170" r="150" strokeDasharray="1 39" strokeWidth="7" strokeOpacity=".5" />
              <circle cx="170" cy="170" r="162" strokeWidth="1" strokeOpacity=".35" />
            </g>
            <g className="boot-ringB" fill="none" stroke="currentColor">
              <circle cx="170" cy="170" r="118" strokeDasharray="1 8" strokeWidth="1.5" strokeOpacity=".65" />
            </g>
            <line className="boot-sweep" x1="170" y1="170" x2="170" y2="24" stroke="currentColor" strokeWidth="2" strokeOpacity=".85" />
          </svg>
          <div className="boot-lock" />
          <div className="boot-fr bf1" /><div className="boot-fr bf2" /><div className="boot-fr bf3" /><div className="boot-fr bf4" />
        </div>
        <ul className="boot-log">
          <li>◇ optics<span className="v">online</span></li>
          <li>◇ nav<span className="v">online</span></li>
          <li>◇ baselines<span className="v">calibrated</span></li>
          <li>◇ detection layer<span className="v">armed</span></li>
        </ul>
      </div>

      <div className="hud">
        <div className="corner c1" /><div className="corner c2" /><div className="corner c3" /><div className="corner c4" />
        <div className="heading" />
        <div className="zoom" />
        <div className="reticle"><div className="ring" /><div className="cx" /><div className="cy" /><div className="brk t1" /><div className="brk t2" /><div className="brk t3" /><div className="brk t4" /></div>
        <div className="tgt" />
        <div className="read r-tr" />
        <div className="read r-bl" />
        <div className="read r-br" />
      </div>

      {/* scroll room for the flight overlay */}
      <div className="track" />

      {/* dossier — the content half; scrolls in over the (now-parked) star field */}
      <main className="dossier">
        <section className="d-sec">
          <div className="d-kicker">// the dashboard</div>
          <h2 className="d-h">Every step, learned<br />and watched.</h2>
          <p className="d-lede">Cernova splits your agent into steps and learns two things about each — its normal behavior and its expected output shape — then flags the one that drifts. This is the real console.</p>
          <DashboardProof />
        </section>

        <section className="d-sec">
          <div className="d-kicker">// claude code · mcp</div>
          <h2 className="d-h">Ask your agent<br />what broke.</h2>
          <p className="d-lede">The MCP server puts Cernova inside Claude Code. Ask in plain language; it pulls the run, the evidence, and the call site — then tells you the fix.</p>
          <McpConsole />
        </section>

        <section className="d-sec">
          <div className="d-kicker">// keep your stack, add detection</div>
          <div className="grid3">
            <div className="col">
              <div className="col-h">Traces in</div>
              <span className="tag">Anthropic SDK</span><span className="tag">OpenAI SDK</span><span className="tag">LangChain</span><span className="tag">OpenTelemetry</span><span className="tag">Vercel AI SDK</span><span className="tag">Manual ingest</span>
            </div>
            <div className="col">
              <div className="col-h">Alerts out</div>
              <span className="tag">Slack</span><span className="tag">Sentry</span><span className="tag">Signed webhooks</span>
            </div>
            <div className="col">
              <div className="col-h">Data out</div>
              <span className="tag">Read API</span><span className="tag">MCP · Claude Code</span><span className="tag">Langfuse / LangSmith import</span>
            </div>
          </div>
        </section>

        <section className="d-sec d-cta">
          <h2 className="d-h"><span className="muted">Green dashboards.</span><br /><span className="em">Broken agents.</span></h2>
          <p className="d-lede">See what your logs record as success. Start charting the dark.</p>
          <div><Link className="cta" href="/login">Start free →</Link><Link className="ghost" href="/docs">Read the docs</Link></div>
          <div className="colophon">Cernova · the detection layer for LLM pipelines · set in Space Grotesk &amp; IBM Plex Mono</div>
        </section>
      </main>

      <style>{CSS}</style>
    </div>
  );
}

/* Window chrome shared by the dashboard + console mocks */
function Win({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="win">
      <div className="win-bar">
        <span className="tl tl1" /><span className="tl tl2" /><span className="tl tl3" />
        <span className="win-title">{title}</span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  );
}

/**
 * Faithful replica of the dashboard Steps/Contracts tab (page.tsx StepsTab),
 * using the same tokens, classes, and DEMO_STEP_HEALTH / DEMO_CONTRACTS data so
 * the marketing demo matches the real product exactly.
 */
function DashboardProof() {
  return (
    <Win title="cernova · support-agent · steps">
      <div className="dash">
        <div className="dash-status">
          <span className="ok">3 steps monitored</span><span className="muted"> · 1 still learning</span>
          <span className="muted right">30 calls per step to start</span>
        </div>

        {/* critical — generate-reply, expanded (behavior drift) */}
        <div className="srow crit">
          <div className="srow-head">
            <span className="dot d-crit" /><span className="sname">generate-reply</span><span className="badge b-crit">critical</span>
            <span className="scalls">198 calls</span><span className="chev">▲</span>
          </div>
          <div className="srow-body">
            <div className="blabel">behavior</div>
            <div className="trend">
              <span className="tmetric">latency</span>
              <span className="tbase">890ms</span><span className="tarrow up">→</span><span className="tnow crit">3120ms</span>
              <span className="tmult crit">3.5× normal</span>
            </div>
            <div className="blabel mt">output shape</div>
            <div className="muted small">Free-form text output — no structural keys.</div>
          </div>
        </div>

        {/* degrading — retrieve-context */}
        <div className="srow deg">
          <div className="srow-head">
            <span className="dot d-deg" /><span className="sname">retrieve-context</span><span className="badge b-deg">degrading</span>
            <span className="scalls">156 calls</span><span className="chev">▼</span>
          </div>
        </div>

        {/* healthy — classify-intent, expanded (contract to review) */}
        <div className="srow ok2">
          <div className="srow-head">
            <span className="dot d-ok" /><span className="sname">classify-intent</span><span className="badge b-ok">healthy</span>
            <span className="shape">output shape to review</span><span className="scalls">214 calls</span><span className="chev">▲</span>
          </div>
          <div className="srow-body">
            <div className="shape-head">
              <div className="blabel">output shape</div>
              <div className="verdict">
                <button className="v-ok">✓ correct</button><button className="v-no">✕ not right</button>
              </div>
            </div>
            <div className="muted small">learned from 42 outputs · json · valid JSON 98% · <span className="warn">watching — confirm to enforce</span></div>
            <table className="ktable">
              <thead><tr><th>key</th><th>type</th><th>required</th><th>constraints</th></tr></thead>
              <tbody>
                <tr><td className="k">category</td><td>string</td><td className="ok">required</td><td className="muted">∈ general · billing · technical · account</td></tr>
                <tr><td className="k">confidence</td><td>number</td><td className="ok">required</td><td className="muted">0 – 1</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* warming — summarize-ticket */}
        <div className="srow warm">
          <div className="srow-head">
            <span className="dot d-warm" /><span className="sname warm-name">summarize-ticket</span><span className="badge b-warm">learning</span>
            <span className="scalls">12 calls</span><span className="chev">▼</span>
          </div>
        </div>
      </div>
    </Win>
  );
}

/** Mock Claude Code session driving the Cernova MCP server. */
function McpConsole() {
  return (
    <Win title="claude code — support-agent">
      <div className="cli">
        <div className="l"><span className="usr">›</span> which step is failing in my support agent?</div>
        <div className="l gap"><span className="bul">●</span> I&apos;ll check Cernova for anomalies.</div>
        <div className="l tool"><span className="tk">⏺ cernova</span> · list_anomalies <span className="mcp">(MCP)</span></div>
        <div className="l out">⎿ 1 run · <span className="crit">critical</span> · score 600</div>
        <div className="l out ind">generate-reply · <span className="crit">latency_iqr_fence</span></div>
        <div className="l tool"><span className="tk">⏺ cernova</span> · get_run <span className="mcp">(MCP)</span></div>
        <div className="l out">⎿ run d33f575d · 3 calls</div>
        <div className="l out ind">observed <span className="crit">3400ms</span> · expected ≤ 240</div>
        <div className="l out ind">code_filepath: <span className="path">sample-app/workflow.ts:256</span></div>
        <div className="l gap ans"><span className="bul">●</span> The failing step is <b>generate-reply</b>. Latency spiked to 3400ms against a 240ms baseline — a <b>14× regression</b> — at <span className="path">workflow.ts:256</span>. The retriever is returning oversized context; scope it to the intent before the reply call.</div>
        <div className="l cursor"><span className="usr">›</span> <span className="blink">▋</span></div>
      </div>
    </Win>
  );
}

const CSS = `
.flight *{box-sizing:border-box}
.flight{--paper:#201a2b;--ink:#e9e4f0;--sec:#c9c2d6;--dim:#9a91ad;--faint:#7c7291;--rule:#3a2f4e;--violet:#b794f4;--red:#e0533d;--gold:#d9c964;--sans:var(--font-grotesk),sans-serif;--mono:var(--font-plex),monospace;color:var(--ink);font-family:var(--sans);overflow-x:hidden}
.flight ::selection{background:var(--gold);color:var(--paper)}
.flight .track{height:640vh}
.flight .viewport{position:fixed;inset:0;overflow:hidden;z-index:0;background:radial-gradient(120% 120% at 50% 45%,#241a34,#161022 70%)}
.flight .sky{position:absolute;inset:0;width:100%;height:100%}
.flight .beacon{position:fixed;top:50%;width:520px;transform:translateY(-50%);opacity:0;transition:opacity .25s;z-index:12;pointer-events:none}
.flight .beacon.pl{left:96px}
.flight .beacon.pr{right:96px;text-align:right}
.flight .beacon .region{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--violet);margin-bottom:20px;display:flex;gap:12px;align-items:center}
.flight .beacon.pr .region{flex-direction:row-reverse}
.flight .beacon .region::before{content:'//';color:var(--violet);opacity:.85;letter-spacing:0}
.flight .beacon h1{font-family:var(--mono);font-size:58px;font-weight:600;line-height:1.02;letter-spacing:-.05em}
.flight .beacon h2{font-family:var(--mono);font-size:46px;font-weight:600;line-height:1.04;letter-spacing:-.045em}
.flight .tcursor{display:inline-block;width:.52em;height:.92em;background:var(--violet);margin-left:.06em;vertical-align:-.06em;animation:cblink 1.1s step-end infinite}
.flight .em{color:var(--violet)}.flight .dm{color:var(--dim)}.flight .rd{color:var(--red)}
.flight .beacon p{font-size:19px;line-height:1.5;color:var(--sec);margin:24px 0;max-width:40ch}
.flight .beacon.pr p{margin-left:auto}
.flight .cta{display:inline-flex;gap:10px;font-family:var(--mono);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;background:var(--violet);color:var(--paper);padding:14px 26px;box-shadow:5px 5px 0 var(--ink);cursor:pointer}
.flight .ghost{margin-left:20px;font-family:var(--mono);font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--dim);border-bottom:1px solid var(--rule);padding-bottom:3px;cursor:pointer}
.flight .chips{margin-top:20px;display:flex;gap:9px;flex-wrap:wrap}
.flight .beacon.pr .chips{justify-content:flex-end}
.flight .chip{font-family:var(--mono);font-size:12px;color:var(--dim);border:1px solid var(--rule);padding:7px 11px}
.flight .chip b{color:var(--ink);font-weight:600}.flight .chip.rd{border-color:var(--red)}.flight .chip.rd b{color:var(--red)}
.flight .hud{position:fixed;inset:0;z-index:20;pointer-events:none;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.flight .hud .b{color:var(--violet);font-weight:500}.flight .hud .r{color:var(--red)}
.flight .corner{position:absolute;width:44px;height:44px;border:2px solid var(--rule);opacity:.75}
.flight .c1{top:78px;left:40px;border-right:0;border-bottom:0}.flight .c2{top:78px;right:40px;border-left:0;border-bottom:0}
.flight .c3{bottom:56px;left:40px;border-right:0;border-top:0}.flight .c4{bottom:56px;right:40px;border-left:0;border-top:0}
.flight .reticle{position:absolute;left:50%;top:50%;width:210px;height:210px;transform:translate(-50%,-50%)}
.flight .reticle .ring{position:absolute;inset:0;border:1px solid var(--rule);border-radius:50%;opacity:.45}
.flight .reticle .cx{position:absolute;left:50%;top:0;width:1px;height:100%;background:var(--dim);opacity:.5;transform:translateX(-.5px)}
.flight .reticle .cy{position:absolute;top:50%;left:0;height:1px;width:100%;background:var(--dim);opacity:.5;transform:translateY(-.5px)}
.flight .reticle .brk{position:absolute;width:15px;height:15px;border:2px solid var(--rule)}
.flight .reticle .t1{top:22px;left:22px;border-right:0;border-bottom:0}.flight .reticle .t2{top:22px;right:22px;border-left:0;border-bottom:0}
.flight .reticle .t3{bottom:22px;left:22px;border-right:0;border-top:0}.flight .reticle .t4{bottom:22px;right:22px;border-left:0;border-top:0}
.flight .reticle.lock .brk{border-color:var(--violet)}.flight .reticle.rogue .brk{border-color:var(--red)}
.flight .tgt{position:absolute;left:50%;top:calc(50% + 128px);transform:translateX(-50%);white-space:nowrap;color:var(--dim);text-align:center}
.flight .tgt b{color:var(--violet)}.flight .tgt.rogue b{color:var(--red)}
.flight .zoom{position:absolute;right:44px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.flight .zoom .z{width:14px;height:2px;background:var(--rule)}.flight .zoom .z.on{background:var(--violet);width:24px}
.flight .zoom span{font-size:10px;color:var(--faint);margin-top:4px}
.flight .heading{position:absolute;top:80px;left:50%;transform:translateX(-50%);display:flex;gap:22px}
.flight .heading .h{opacity:.5}.flight .heading .h.mid{color:var(--violet);opacity:1}
.flight .read{position:absolute;display:flex;flex-direction:column;gap:5px}
.flight .r-tr{top:82px;right:100px;text-align:right}.flight .r-bl{bottom:60px;left:100px}.flight .r-br{bottom:60px;right:100px;text-align:right;color:var(--dim)}
.flight .dotlive{color:#7fb59a}
.flight .fnav{position:fixed;top:0;left:0;right:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:24px 44px}
.flight .brand{font-weight:600;font-size:19px;display:flex;gap:10px;align-items:center}
.flight .navlinks{display:flex;gap:30px;font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.flight .glass{position:fixed;inset:0;z-index:15;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(233,228,240,.016) 0 1px,transparent 1px 3px),radial-gradient(120% 120% at 50% 50%,transparent 56%,rgba(8,5,14,.55) 100%)}
@media (max-width:820px){
  .flight .beacon{width:auto;left:24px;right:24px}
  .flight .beacon.pl,.flight .beacon.pr{left:24px;right:24px;text-align:left}
  .flight .beacon.pr .region{flex-direction:row}.flight .beacon.pr p,.flight .beacon.pr .chips{margin-left:0;justify-content:flex-start}
  .flight .beacon h1{font-size:42px}.flight .beacon h2{font-size:34px}
  .flight .r-tr,.flight .r-bl,.flight .r-br,.flight .heading,.flight .zoom{display:none}
}
/* phones: content half responsive; flight is replaced by the stacked layout below */
@media (max-width:680px){
  .flight .d-sec{padding:76px 20px}
  .flight .d-h{font-size:34px}.flight .d-lede{font-size:17px}
  .flight .grid3{gap:16px}
  .flight .win-body{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .flight .dash{min-width:460px}          /* keep the ledger legible; scroll inside its window */
  .flight .cli{font-size:12px;line-height:1.6}
  .flight .beacon h1{font-size:34px}.flight .beacon h2{font-size:28px}
  .flight .beacon p{font-size:17px}
  .flight .beacon,.flight .d-sec{padding-left:20px!important;padding-right:20px!important}
  .flight .beacon p,.flight .d-lede{max-width:100%!important;overflow-wrap:break-word}
  .flight .beacon .region{font-size:10px;letter-spacing:.12em;flex-wrap:wrap}
}
/* ── dossier (content half) — scrolls over the parked star field ── */
.flight .dossier{position:relative;z-index:14;background:linear-gradient(180deg,transparent,rgba(22,16,34,.82) 12%,rgba(22,16,34,.92) 100%);backdrop-filter:blur(1px)}
.flight .d-sec{max-width:1080px;margin:0 auto;padding:120px 48px}
.flight .d-kicker{font-family:var(--mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--violet);margin-bottom:22px}
.flight .d-h{font-family:var(--mono);font-size:clamp(32px,4.4vw,58px);font-weight:600;line-height:1.04;letter-spacing:-.045em}
.flight .d-lede{font-size:20px;line-height:1.55;color:var(--sec);max-width:52ch;margin:26px 0 40px}
.flight .muted{color:var(--dim)}.flight .ok{color:#7fb59a}.flight .bad{color:var(--red)}.flight .warn{color:var(--gold)}
/* window chrome */
.flight .win{border:1px solid var(--rule);background:#201a2b;box-shadow:0 30px 80px -20px rgba(8,5,14,.7);font-family:var(--font-geist-mono),ui-monospace,monospace}
.flight .win-bar{display:flex;align-items:center;gap:8px;padding:11px 16px;border-bottom:1px solid var(--rule);background:#281f38}
.flight .win-bar .tl{width:11px;height:11px;border-radius:50%;background:#3a2f4e}
.flight .win-title{margin-left:12px;font-size:12px;color:var(--dim);letter-spacing:.04em}
.flight .win-body{padding:22px}
/* dashboard replica — matches app StepsTab tokens/classes */
.flight .dash{display:flex;flex-direction:column;gap:8px;font-size:13px}
.flight .dash-status{background:#281f38;border:1px solid var(--rule);padding:11px 18px;font-size:11px}
.flight .dash-status .right{float:right;color:var(--faint);font-size:10px}
.flight .srow{background:#281f38;border:1px solid var(--rule);border-left:2px solid var(--rule)}
.flight .srow.crit{border-left-color:var(--red)}.flight .srow.deg{border-left-color:var(--gold)}.flight .srow.ok2{border-left-color:#7fb59a}.flight .srow.warm{border-left-color:var(--rule)}
.flight .srow-head{display:flex;align-items:center;gap:12px;padding:15px 18px}
.flight .dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto}.flight .d-crit{background:var(--red)}.flight .d-deg{background:#d9a441}.flight .d-ok{background:#7fb59a}.flight .d-warm{background:#332946}
.flight .sname{color:var(--sec)}.flight .warm-name{color:var(--dim)}
.flight .badge{font-size:10px;padding:2px 8px;border:1px solid;letter-spacing:.04em}
.flight .b-crit{color:var(--red);border-color:rgba(224,83,61,.5)}.flight .b-deg{color:#d9a441;border-color:rgba(217,164,65,.5)}.flight .b-ok{color:#7fb59a;border-color:rgba(127,181,154,.5)}.flight .b-warm{color:var(--dim);border-color:var(--rule)}
.flight .shape{margin-left:auto;font-size:10px;color:var(--gold)}
.flight .scalls{margin-left:auto;font-size:10px;color:var(--faint)}.flight .shape~.scalls{margin-left:12px}
.flight .chev{color:var(--faint);font-size:11px}
.flight .srow-body{padding:6px 18px 16px;border-top:1px solid var(--rule)}
.flight .blabel{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:12px 0 8px}.flight .blabel.mt{margin-top:16px}
.flight .trend{display:flex;align-items:center;gap:12px;font-size:12px}
.flight .tmetric{color:var(--faint);width:56px}.flight .tbase{color:var(--mid)}.flight .tarrow.up{color:var(--red)}.flight .tnow.crit{color:var(--red)}.flight .tmult{margin-left:auto;font-weight:700}.flight .tmult.crit{color:var(--red)}
.flight .small{font-size:12px}
.flight .shape-head{display:flex;align-items:center;justify-content:space-between}
.flight .verdict{display:flex;gap:8px}.flight .verdict button{font-size:11px;padding:4px 10px;border:1px solid;background:none;cursor:pointer}
.flight .v-ok{color:#7fb59a;border-color:rgba(127,181,154,.5)}.flight .v-no{color:var(--red);border-color:rgba(224,83,61,.5)}
.flight .ktable{width:100%;border:1px solid var(--rule);margin-top:10px;border-collapse:collapse;font-size:10px}
.flight .ktable th{text-align:left;padding:6px 12px;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;font-weight:400;border-bottom:1px solid var(--rule)}
.flight .ktable td{padding:6px 12px;border-bottom:1px solid rgba(58,47,78,.5);color:var(--mid)}.flight .ktable tr:last-child td{border:0}
.flight .ktable .k{color:#cdb9f7}
/* mcp console */
.flight .cli{font-family:var(--font-geist-mono),ui-monospace,monospace;font-size:13px;line-height:1.7;color:var(--sec)}
.flight .cli .l{white-space:pre-wrap}.flight .cli .gap{margin-top:14px}
.flight .cli .usr{color:var(--violet)}.flight .cli .bul{color:var(--violet);margin-right:8px}
.flight .cli .tool{margin-top:12px;color:var(--dim)}.flight .cli .tk{color:#cdb9f7}.flight .cli .mcp{color:var(--faint)}
.flight .cli .out{color:var(--dim)}.flight .cli .ind{padding-left:20px}
.flight .cli .crit{color:var(--red)}.flight .cli .path{color:var(--violet)}
.flight .cli .ans{color:var(--ink);max-width:70ch}.flight .cli .ans b{color:#fff}
.flight .cli .cursor{margin-top:14px}.flight .blink{color:var(--violet);animation:cblink 1.1s step-end infinite}
@keyframes cblink{50%{opacity:0}}
/* one-time POV console power-up */
.flight .boot{position:fixed;inset:0;z-index:26;pointer-events:none;color:var(--violet);font-family:var(--mono);animation:bootfade 2s ease-out forwards}
@keyframes bootfade{0%,66%{opacity:1}100%{opacity:0;visibility:hidden}}
.flight .boot-scrim{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(22,16,34,.35) 0%,rgba(9,6,16,.82) 70%);animation:bootscrim 2s ease-out forwards}
@keyframes bootscrim{0%{opacity:1}55%{opacity:1}100%{opacity:0}}
.flight .boot-rig{position:absolute;left:50%;top:50%;width:360px;height:360px;transform:translate(-50%,-50%);filter:drop-shadow(0 0 10px rgba(183,148,244,.35))}
.flight .boot-rig svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.flight .boot-ringA{transform-origin:170px 170px;animation:bootspin 8s linear,bootringin .55s ease-out both}
.flight .boot-ringB{transform-origin:170px 170px;animation:bootspinR 8s linear,bootringin .55s .08s ease-out both}
.flight .boot-sweep{transform-origin:170px 170px;animation:bootsweep 1.1s .1s ease-out both}
@keyframes bootspin{to{transform:rotate(360deg)}}
@keyframes bootspinR{to{transform:rotate(-360deg)}}
@keyframes bootringin{from{opacity:0;transform:scale(.35)}to{opacity:1}}
@keyframes bootsweep{from{transform:rotate(-150deg);opacity:.9}to{transform:rotate(260deg);opacity:0}}
.flight .boot-lock{position:absolute;left:50%;top:50%;width:118px;height:118px;margin:-59px 0 0 -59px;border:1px solid var(--violet);border-radius:50%;box-shadow:0 0 0 1px rgba(183,148,244,.15) inset;animation:bootlock .7s .25s cubic-bezier(.2,.8,.2,1) both}
.flight .boot-lock::before,.flight .boot-lock::after{content:'';position:absolute;background:var(--violet);opacity:.7}
.flight .boot-lock::before{left:50%;top:-14px;bottom:-14px;width:1px;transform:translateX(-.5px)}
.flight .boot-lock::after{top:50%;left:-14px;right:-14px;height:1px;transform:translateY(-.5px)}
@keyframes bootlock{0%{opacity:0;width:280px;height:280px;margin:-140px 0 0 -140px}100%{opacity:.95}}
.flight .boot-fr{position:absolute;width:38px;height:38px;border:2px solid var(--violet);opacity:.85}
.flight .bf1{top:8px;left:8px;border-right:0;border-bottom:0;animation:bf1 .5s .15s ease-out both}
.flight .bf2{top:8px;right:8px;border-left:0;border-bottom:0;animation:bf2 .5s .15s ease-out both}
.flight .bf3{bottom:8px;left:8px;border-right:0;border-top:0;animation:bf3 .5s .15s ease-out both}
.flight .bf4{bottom:8px;right:8px;border-left:0;border-top:0;animation:bf4 .5s .15s ease-out both}
@keyframes bf1{from{opacity:0;transform:translate(-22px,-22px)}to{opacity:.85}}
@keyframes bf2{from{opacity:0;transform:translate(22px,-22px)}to{opacity:.85}}
@keyframes bf3{from{opacity:0;transform:translate(-22px,22px)}to{opacity:.85}}
@keyframes bf4{from{opacity:0;transform:translate(22px,22px)}to{opacity:.85}}
.flight .boot-log{position:absolute;left:50%;top:calc(50% + 150px);transform:translateX(-50%);list-style:none;font-size:11px;letter-spacing:.2em;text-transform:uppercase;line-height:2.1;min-width:270px}
.flight .boot-log li{opacity:0;display:flex;justify-content:space-between;gap:20px;animation:bootline .3s ease-out forwards}
.flight .boot-log li:nth-child(1){animation-delay:.35s}.flight .boot-log li:nth-child(2){animation-delay:.6s}
.flight .boot-log li:nth-child(3){animation-delay:.85s}.flight .boot-log li:nth-child(4){animation-delay:1.1s}
.flight .boot-log .v{color:#7fb59a}
@keyframes bootline{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@media (max-width:680px){.flight .boot-rig{transform:translate(-50%,-50%) scale(.8)}}
@media (prefers-reduced-motion: reduce){.flight .tcursor,.flight .blink{animation:none}.flight .boot{display:none}}
.flight .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:20px}
.flight .col-h{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--rule)}
.flight .tag{display:inline-block;font-family:var(--mono);font-size:12px;color:var(--sec);border:1px solid var(--rule);padding:7px 11px;margin:0 6px 8px 0}
.flight .d-cta{text-align:center}.flight .d-cta .d-lede{margin:26px auto 34px}.flight .d-cta .cta{cursor:pointer}
.flight .colophon{margin-top:90px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--faint)}
@media (max-width:820px){.flight .grid3{grid-template-columns:1fr}.flight .lrow{grid-template-columns:1.4fr .7fr .8fr;gap:10px}.flight .lrow span:nth-child(2),.flight .lrow span:nth-child(4){display:none}}

/* stacked layout (phones + reduced-motion): no flight — beacons become a normal page,
   the star system is dimmed to a quiet backdrop, HUD chrome removed */
.flight.reduced .track{display:none}
.flight.reduced .viewport{opacity:.4}
.flight.reduced .heading,.flight.reduced .zoom,.flight.reduced .reticle,.flight.reduced .tgt,.flight.reduced .corner,.flight.reduced .read{display:none}
.flight.reduced .beacon{position:relative!important;opacity:1!important;transform:none!important;inset:auto!important;width:auto!important;max-width:640px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;justify-content:center;text-align:left;padding:0 24px}
.flight.reduced .beacon.pr{text-align:left}.flight.reduced .beacon.pr .region{flex-direction:row}.flight.reduced .beacon.pr .region::after{display:none}.flight.reduced .beacon.pr p,.flight.reduced .beacon.pr .chips{margin-left:0;justify-content:flex-start}
`;
