// Homepage motion: scroll "stages" that hold a section on screen while its
// animation plays (letters lighting up, the rotor cleaning), and ratchet
// counters. Everything switches off for visitors whose device asks for reduced
// motion (the content is simply shown as-is).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import gsap from 'gsap';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Stage ─────────────────────────────────────────────────────────────────────
// The section sticks to the screen for an extra `hold` of scrolling, so an
// animation scrubbed across the stage plays while the visitor is looking at it
// instead of racing past. Pure CSS sticky: smooth, no scroll-jacking.
// Scrub against `stageRef` from 'top top' to 'bottom bottom' for the held part.
export function Stage({ stageRef, hold = '70vh', className = '', innerClassName = '', children }: {
  stageRef: RefObject<HTMLElement>; hold?: string; className?: string; innerClassName?: string; children: ReactNode;
}) {
  return (
    <section ref={stageRef} className={`relative ${className}`}>
      <div className={`sticky top-0 min-h-[100svh] flex items-center overflow-hidden ${innerClassName}`}>
        <div className="w-full">{children}</div>
      </div>
      <div aria-hidden="true" className="motion-reduce:hidden" style={{ height: hold }} />
    </section>
  );
}

// Scroll progress across a stage, 0 → 1, finishing a little before the stage
// lets go so the end state is seen while it's still held. `lead` starts it
// early: 0 = when the stage reaches the top of the screen, 0.35 = when its top
// is 35% of a screen below that. Measured live from the stage's position on
// every scroll — never from positions cached at load, which go stale when
// reviews and photos load in above and push the page down.
// With `anchor`, it instead starts when that element (inside the stage) is
// 75% of the way down the screen, so it begins the moment it can be seen,
// on any phone size.
export function useStageProgress(stageRef: RefObject<HTMLElement>, onProgress: (p: number) => void, lead = 0, anchor?: RefObject<HTMLElement>) {
  const cb = useRef(onProgress);
  cb.current = onProgress;
  useEffect(() => {
    const el = stageRef.current;
    if (!el || reducedMotion()) return;
    let raf = 0, last = -1;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      // Anchor's offset within the sticky layer: constant whether or not it's held.
      const a = anchor?.current, layer = a?.closest('.sticky');
      const leadPx = a && layer ? 0.75 * vh - (a.getBoundingClientRect().top - layer.getBoundingClientRect().top) : lead * vh;
      const run = r.height - vh + leadPx;
      const p = run > 0 ? Math.max(0, Math.min(1, (leadPx - r.top) / run / 0.85)) : 1;
      if (p !== last) { last = p; cb.current(p); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [stageRef, lead, anchor]);
}

// ── Sparks ────────────────────────────────────────────────────────────────────
// Grinder sparks on a canvas laid over a section. Streaks with gravity and
// additive glow, white-hot → orange → gone. The loop only runs while sparks
// are alive, so it costs nothing at rest.
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; w: number };
export function useSparks() {
  const ref = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<Spark[]>([]);
  const raf = useRef(0);
  const loop = () => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) { raf.current = 0; return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const alive: Spark[] = [];
    for (const s of sparks.current) {
      s.vy += 0.28; s.vx *= 0.985; s.x += s.vx; s.y += s.vy; s.life--;
      if (s.life <= 0) continue;
      const a = s.life / s.max;
      ctx.strokeStyle = `hsla(${18 + a * 30}, 100%, ${55 + a * 40}%, ${Math.min(1, a * 1.4)})`;
      ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(s.x - s.vx * 2.2, s.y - s.vy * 2.2); ctx.lineTo(s.x, s.y); ctx.stroke();
      alive.push(s);
    }
    sparks.current = alive;
    raf.current = alive.length ? requestAnimationFrame(loop) : 0;
    if (!alive.length) ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
  };
  // x/y in the canvas's own CSS pixels; `dir` 1 sprays right, -1 left, 0 both.
  const emit = (x: number, y: number, n: number, { dir = 0, spread = 1, up = 1 } = {}) => {
    if (reducedMotion()) return;
    for (let i = 0; i < n; i++) {
      const side = dir || (Math.random() < 0.5 ? -1 : 1);
      const max = 22 + Math.random() * 30;
      sparks.current.push({
        x, y: y + (Math.random() - 0.5) * 20 * spread,
        vx: side * (1.5 + Math.random() * 8), vy: -(Math.random() * 7 * up) + 1.5,
        life: max, max, w: 1.1 + Math.random() * 1.9,
      });
    }
    if (sparks.current.length > 600) sparks.current.splice(0, sparks.current.length - 600);
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { ref, emit };
}

// ── Letters that light up as you scroll ───────────────────────────────────────
// Each character starts dim and comes up to full brightness in reading order,
// scrubbed across the stage. The full text stays in the DOM for SEO.
export function ScrubLines({ stageRef, lines }: { stageRef: RefObject<HTMLElement>; lines: { text: string; className?: string }[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Each character's share of the scroll matches how much you'd see it change:
  // spaces get none and periods a sliver, so there's no dead stretch between
  // "No Shop." and "No Wait.". A soft band (each letter fades over ~2.5
  // letters' worth of scroll) makes it one continuous sweep.
  const BAND = 2.5;
  useStageProgress(stageRef, p => {
    const chars = ref.current?.querySelectorAll<HTMLElement>('.scrub-ch');
    if (!chars) return;
    const weight = (c: HTMLElement) => (c.textContent === ' ' ? 0 : c.textContent === '.' ? 0.3 : 1);
    const total = [...chars].reduce((s, c) => s + weight(c), 0);
    const lit = p * (total + BAND);
    let start = 0;
    chars.forEach(c => {
      c.style.opacity = String(0.12 + 0.88 * Math.max(0, Math.min(1, (lit - start) / BAND)));
      start += weight(c);
    });
  }, 0, ref);
  // Start dim (only once JS is running and motion is allowed).
  useEffect(() => {
    if (reducedMotion()) return;
    ref.current?.querySelectorAll<HTMLElement>('.scrub-ch').forEach(c => { c.style.opacity = '0.12'; });
  }, []);
  return (
    <span ref={ref}>
      {lines.map(l => (
        <span key={l.text} className={l.className} aria-label={l.text}>
          {[...l.text].map((c, i) => <span key={i} aria-hidden="true" className="scrub-ch" style={{ transition: 'opacity .12s linear' }}>{c}</span>)}
        </span>
      ))}
    </span>
  );
}

// ── Ratchet counter ───────────────────────────────────────────────────────────
// "30 Days" ticks 0 → 30 once it's well into view (not the moment its top edge
// appears), slowly enough to watch, then gives a little ratchet "click".
// Pre-rendered HTML keeps the real value.
export function RatchetNumber({ value, delay = 0 }: { value: string; delay?: number }) {
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
        v: n, duration: 2.2, delay, ease: 'power1.out',
        onUpdate: () => setShown(Math.round(o.v)),
        onComplete: () => { gsap.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }); },
      });
    }, { rootMargin: '0px 0px -35% 0px' });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!m) return <>{value}</>;
  return <span ref={ref} className="inline-block tabular-nums">{shown ?? n}{m[2]}</span>;
}

// ── In view (once) ────────────────────────────────────────────────────────────
// True once the element is properly on screen (not just its top edge peeking
// in), then stays true. Always true when motion is reduced.
export function useInViewOnce<T extends Element>(rootMargin = '0px 0px -20% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) { setSeen(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } }, { rootMargin });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);
  return [ref, seen] as const;
}

// ── Shine ─────────────────────────────────────────────────────────────────────
// A red-hot glint sweeps once across a heading when it comes into view.
export function Shine({ children }: { children: ReactNode }) {
  const [ref, seen] = useInViewOnce<HTMLSpanElement>();
  return <span ref={ref} className={`shine ${seen ? 'shine-go' : ''}`}>{children}</span>;
}

// ── 0 → 1 over `ms` once `start` turns true (for SVG drawing) ─────────────────
export function useTween(start: boolean, ms: number) {
  const [t, setT] = useState(() => (reducedMotion() ? 1 : 0));
  useEffect(() => {
    if (!start || reducedMotion()) return;
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => {
      const v = Math.min(1, (now - t0) / ms);
      setT(v);
      if (v < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, ms]);
  return t;
}

// ── Sent check ────────────────────────────────────────────────────────────────
// A red ring draws itself, then a white tick, with a small pop: the moment a
// customer's request goes through. Static (already drawn) for reduced motion.
export function SentCheck({ size = 72 }: { size?: number }) {
  return (
    <svg className="sent-check mx-auto" width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" fill="none" stroke="#dc2626" strokeWidth="3" />
      <path d="M15 27.5l7 7 15-16" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
