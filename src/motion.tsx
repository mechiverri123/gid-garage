// Homepage motion: the scroll-drawn route line, letter-by-letter scroll
// lighting, and ratchet counters. Everything switches off for visitors whose
// device asks for reduced motion (the content is simply shown as-is).
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Route line ────────────────────────────────────────────────────────────────
// A red "GPS route" that draws itself down the page as you scroll, weaving from
// one edge to the other between sections, with a pulsing puck at its tip that
// stays with the reader. It ends with a map pin at the booking section — the
// destination. Drop it as the last child of a `relative` wrapper around the
// sections it should run through; it measures them, so content changes (reviews
// loading, images) just redraw it.
export function RouteLine() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geo, setGeo] = useState<{ w: number; h: number; d: string; end: { x: number; y: number } } | null>(null);
  const trail = useRef<SVGPathElement>(null);
  const puck = useRef<SVGGElement>(null);
  const pin = useRef<SVGGElement>(null);

  // Build the path from the wrapper's sections.
  useEffect(() => {
    const wrap = svgRef.current?.parentElement;
    if (!wrap) return;
    let raf = 0;
    const build = () => {
      const w = wrap.clientWidth, h = wrap.scrollHeight;
      const edge = w < 768 ? 9 : w < 1280 ? 16 : 40;
      const xs = [edge, w - edge];
      const top = wrap.getBoundingClientRect().top;
      const kids = [...wrap.children].filter(c => c !== svgRef.current && (c as HTMLElement).offsetHeight > 0) as HTMLElement[];
      if (kids.length < 2) return;
      const last = kids[kids.length - 1];
      const endY = last.getBoundingClientRect().top - top + 36;
      const end = { x: w / 2, y: endY };
      let side = 0, y = 0;
      let d = `M ${xs[0]} 0`;
      for (const k of kids.slice(1, -1)) {
        const b = k.getBoundingClientRect().top - top;
        const bend = Math.min(70, (b - y) / 3);
        d += ` L ${xs[side]} ${b - bend}`;
        const other = 1 - side;
        d += ` C ${xs[side]} ${b}, ${xs[other]} ${b}, ${xs[other]} ${b + bend}`;
        side = other; y = b + bend;
      }
      // Final leg: down the current edge, then curve in to the pin.
      const lastTop = last.getBoundingClientRect().top - top;
      d += ` L ${xs[side]} ${lastTop - 40} C ${xs[side]} ${endY}, ${end.x} ${lastTop - 30}, ${end.x} ${endY}`;
      setGeo({ w, h, d, end });
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); };
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    window.addEventListener('resize', schedule);
    schedule();
    return () => { ro.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(raf); };
  }, []);

  // Tie the drawn length to scroll: the tip sits ~60% down the screen.
  useEffect(() => {
    const path = trail.current, svg = svgRef.current;
    if (!geo || !path || !svg) return;
    const total = path.getTotalLength();
    path.style.strokeDasharray = `${total}`;
    if (reducedMotion()) {
      path.style.strokeDashoffset = '0';
      if (puck.current) puck.current.style.display = 'none';
      return;
    }
    // y -> length lookup (the path only ever moves down).
    const N = 600;
    const ys: number[] = [];
    for (let i = 0; i <= N; i++) ys.push(path.getPointAtLength((total * i) / N).y);
    let raf = 0;
    let shown = -1;
    const update = () => {
      raf = 0;
      const target = window.scrollY + window.innerHeight * 0.6 - (svg.getBoundingClientRect().top + window.scrollY);
      let lo = 0, hi = N;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ys[m] < target) lo = m + 1; else hi = m; }
      const len = (total * lo) / N;
      if (Math.abs(len - shown) < 0.5) return;
      shown = len;
      path.style.strokeDashoffset = `${total - len}`;
      const p = path.getPointAtLength(len);
      puck.current?.setAttribute('transform', `translate(${p.x} ${p.y})`);
      if (puck.current) puck.current.style.opacity = len > 2 && lo < N ? '1' : '0';
      pin.current?.classList.toggle('route-pin-on', lo >= N - 2);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [geo]);

  return (
    <svg ref={svgRef} aria-hidden="true" className="absolute top-0 left-0 pointer-events-none z-[5]"
      width="100%" height={geo?.h ?? 0} style={{ overflow: 'visible' }}>
      {geo && <>
        {/* The route ahead: faint road dashes. */}
        <path d={geo.d} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} strokeDasharray="6 10" />
        {/* The route travelled: solid red, drawn by scroll. */}
        <path ref={trail} d={geo.d} fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px rgba(220,38,38,0.6))' }} />
        <g ref={puck} style={{ opacity: 0, transition: 'opacity .3s' }}>
          <circle r={11} fill="rgba(220,38,38,0.25)" className="route-ping" />
          <circle r={5.5} fill="#dc2626" stroke="#fff" strokeWidth={2} />
        </g>
        <g ref={pin} className="route-pin" transform={`translate(${geo.end.x} ${geo.end.y})`}>
          <g className="route-pin-inner">
            <path d="M0 0 C -9 -12 -12 -17 -12 -24 A 12 12 0 1 1 12 -24 C 12 -17 9 -12 0 0 Z" fill="#dc2626" stroke="#fff" strokeWidth={1.5} />
            <circle cy={-24} r={4.5} fill="#fff" />
          </g>
        </g>
      </>}
    </svg>
  );
}

// ── Letters that light up as you scroll ───────────────────────────────────────
// Each character starts dim and comes up to full brightness in reading order,
// scrubbed to the scroll position. The full text stays in the DOM for SEO.
export function ScrubText({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const chars = el.querySelectorAll('.scrub-ch');
    const tween = gsap.fromTo(chars, { opacity: 0.12 }, {
      opacity: 1, ease: 'none', stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 88%', end: 'top 40%', scrub: 0.4 },
    });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); };
  }, []);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {[...text].map((c, i) => <span key={i} aria-hidden="true" className="scrub-ch">{c}</span>)}
    </span>
  );
}

// ── Ratchet counter ───────────────────────────────────────────────────────────
// "30 Days" ticks 0 → 30 when it scrolls into view, then gives a little
// ratchet "click" (a quick scale kick). Pre-rendered HTML keeps the real value.
export function RatchetNumber({ value }: { value: string }) {
  const m = value.match(/^(\d+)(.*)$/);
  const n = m ? Number(m[1]) : 0;
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!m || !el || reducedMotion()) return;
    setShown(0);
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const o = { v: 0 };
      gsap.to(o, {
        v: n, duration: Math.min(1.4, 0.5 + n / 60), ease: 'power3.out',
        onUpdate: () => setShown(Math.round(o.v)),
        onComplete: () => { gsap.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }); },
      });
    }, { threshold: 0.6 });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!m) return <>{value}</>;
  return <span ref={ref} className="inline-block tabular-nums">{shown ?? n}{m[2]}</span>;
}
