import React, { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ReactLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Bug,
  ChevronDown,
  ClipboardList,
  FileCheck,
  FileSpreadsheet,
  GitBranch,
  PlayCircle,
  Rocket,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import PulseScene from "@/components/landing/PulseScene";
import { scrollState } from "@/components/landing/scrollState";
import { PulseLogo } from "@/components/PulseLogo";

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Requirements & Review",
    desc: "FAs author requirements with acceptance criteria, then walk them through a real review workflow — approve, reject, revise, re-review.",
  },
  {
    icon: PlayCircle,
    title: "Test Management",
    desc: "A versioned test case library feeding QA and UAT execution runs — live pass / fail / blocked counts per milestone and environment.",
  },
  {
    icon: Bug,
    title: "Defects & Escape Analysis",
    desc: "Raise defects from a failing step, classify production escapes by root cause, and backfill regression tests automatically.",
  },
  {
    icon: BarChart3,
    title: "PM Command Center",
    desc: "Phase timelines, baseline-vs-actual Gantt, capacity and SPI — plus benchmark history that answers \"is this a pattern?\".",
  },
  {
    icon: ShieldCheck,
    title: "Risk & Governance",
    desc: "A living risk register, an audit trail on every action, and a role access matrix with RACI overlay — governance built in, not bolted on.",
  },
  {
    icon: Bot,
    title: "AI Copilots",
    desc: "Generate test cases from requirements, draft verdicts, predict milestone risk and chat with your requirements — four copilots, one hub.",
  },
];

const PHASES = [
  {
    icon: ClipboardList,
    step: "01",
    title: "Requirements",
    color: "#a78bfa",
    desc: "FAs author requirements with acceptance criteria — versioned, discussed and linked to everything downstream.",
  },
  {
    icon: FileCheck,
    step: "02",
    title: "Review",
    color: "#f0abfc",
    desc: "Submit, approve or reject with comments. Segregation of duties is enforced — nobody approves their own work.",
  },
  {
    icon: GitBranch,
    step: "03",
    title: "Develop",
    color: "#818cf8",
    desc: "Approved work lands in the dev queue — assignment, blockers and the ready-for-QA handoff, all tracked.",
  },
  {
    icon: PlayCircle,
    step: "04",
    title: "QA testing",
    color: "#2dd4bf",
    desc: "Execution files per milestone and environment. A failing step raises a defect with full context attached.",
  },
  {
    icon: Users,
    step: "05",
    title: "UAT",
    color: "#60a5fa",
    desc: "Business sign-off runs in dedicated UAT files — same traceability, separate verdict.",
  },
  {
    icon: Rocket,
    step: "06",
    title: "Go-live",
    color: "#34d399",
    desc: "The PM sets the go-live plan; dashboards track every phase against it, with risks and an AI read on delivery.",
  },
];

const STATS = [
  { value: 100, suffix: "%", label: "traceability, from requirement to go-live" },
  { value: 15, suffix: "", label: "roles governed by one access matrix" },
  { value: 4, suffix: "", label: "AI copilots built into the platform" },
  { value: 1, suffix: "", label: "source of truth for the whole delivery team" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const QMPulseLanding: React.FC = () => {
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  const goLogin = () => setLocation("/login");

  // pointer parallax for the 3D scene
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      scrollState.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      scrollState.mouseY = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useGSAP(
    () => {
      // Drive the WebGL camera from total page scroll
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (st) => {
          scrollState.progress = st.progress;
        },
      });

      if (prefersReducedMotion) {
        // Skip all entrance/scroll animations; show final values immediately.
        gsap.utils.toArray<HTMLElement>(".stat-value").forEach((el) => {
          el.textContent = el.dataset.value ?? "0";
        });
        return;
      }

      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const driftX = isMobile ? 28 : 70;

      // Hero entrance — fromTo with an explicit visible end state so a
      // double-invoked timeline (React StrictMode) can never leave an
      // element stuck at opacity 0.
      gsap
        .timeline()
        .fromTo(
          ".hero-pill",
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", delay: 0.15 },
        )
        .fromTo(
          ".hero-line",
          { y: 70, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.1, stagger: 0.14, ease: "power4.out" },
          "-=0.5",
        )
        .fromTo(
          ".hero-desc",
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" },
          "-=0.7",
        )
        .fromTo(
          ".hero-cta",
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power3.out" },
          "-=0.5",
        )
        .fromTo(".hero-scroll-hint", { opacity: 0 }, { opacity: 1, duration: 1 }, "-=0.2");

      // Generic reveals
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 60, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%" },
          },
        );
      });

      // Feature cards stagger in as a group
      gsap.fromTo(
        ".feature-card",
        { y: 80, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: ".feature-grid", start: "top 80%" },
        },
      );

      // ECG pulse strip draws segment by segment as it scrolls into view —
      // per-segment duration proportional to path length keeps the draw
      // speed constant across the whole line.
      const segs = gsap.utils.toArray<SVGPathElement>(".pulse-seg");
      if (segs.length > 0) {
        const stripTl = gsap.timeline({
          scrollTrigger: { trigger: ".pulse-strip", start: "top 85%", end: "top 35%", scrub: 0.5 },
        });
        segs.forEach((p) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
          stripTl.to(p, { strokeDashoffset: 0, duration: len, ease: "none" });
        });
      }

      // Workflow spine draws itself while the section scrolls
      gsap.fromTo(
        ".workflow-spine",
        { scaleY: 0 },
        {
          scaleY: 1,
          transformOrigin: "top center",
          ease: "none",
          scrollTrigger: {
            trigger: ".workflow-list",
            start: "top 70%",
            end: "bottom 60%",
            scrub: 0.6,
          },
        },
      );

      gsap.utils.toArray<HTMLElement>(".workflow-item").forEach((el, i) => {
        gsap.fromTo(
          el,
          { x: i % 2 === 0 ? -driftX : driftX, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 82%" },
          },
        );
      });

      // Animated counters
      gsap.utils.toArray<HTMLElement>(".stat-value").forEach((el) => {
        const end = Number(el.dataset.value ?? 0);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: end,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
          onUpdate: () => {
            el.textContent = String(Math.round(obj.v));
          },
        });
      });

      // Big CTA drifts up over the scene
      gsap.fromTo(
        ".cta-block",
        { y: 90, opacity: 0, scale: 0.96 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ".cta-section", start: "top 75%" },
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <ReactLenis root options={{ lerp: 0.09, smoothWheel: !prefersReducedMotion }}>
      <div
        ref={containerRef}
        className="relative min-h-screen bg-[#04070f] text-slate-100 antialiased overflow-x-clip selection:bg-teal-400/30 [-webkit-tap-highlight-color:transparent]"
      >
        {/* WebGL backdrop */}
        <PulseScene />

        {/* soft vignettes so text stays readable over the scene */}
        <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(4,7,15,0.75)_100%)]" />

        {/* ------------------------------------------------ nav */}
        <header className="fixed top-0 inset-x-0 z-50">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between rounded-b-2xl backdrop-blur-md bg-[#04070f]/50 border-b border-white/5">
            <PulseLogo size="md" />
            <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
              <a href="#features" className="hover:text-teal-300 transition-colors">
                Features
              </a>
              <a href="#workflow" className="hover:text-teal-300 transition-colors">
                Lifecycle
              </a>
              <a href="#numbers" className="hover:text-teal-300 transition-colors">
                Why QMPulse
              </a>
            </nav>
            <button
              onClick={goLogin}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Sign in <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="relative z-10">
          {/* ------------------------------------------------ hero */}
          <section className="relative min-h-[100svh] flex flex-col items-center justify-center text-center px-5 sm:px-6 pt-24 pb-20">
            <div className="hero-pill inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-1.5 text-xs font-medium text-teal-200 tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
              </span>
              Quality-led delivery
            </div>

            <h1 className="mt-8 text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              <span className="hero-line block">One pulse.</span>
              <span className="hero-line block bg-gradient-to-r from-teal-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
                From requirement to go-live.
              </span>
            </h1>

            <p className="hero-desc mt-7 max-w-2xl text-lg md:text-xl text-slate-300/90 leading-relaxed">
              QMPulse connects FA requirements, dev handoffs, QA execution, UAT, defects,
              risks and PMO reporting into one live system — so everyone from analyst to PM
              sees the same truth.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full max-w-xs sm:max-w-none sm:w-auto">
              <button
                onClick={goLogin}
                className="hero-cta group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-teal-400 to-sky-500 px-8 py-3.5 text-base font-semibold text-[#04070f] shadow-xl shadow-teal-500/25 hover:shadow-teal-400/40 hover:scale-[1.03] transition-all"
              >
                Get started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#features"
                className="hero-cta inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 py-3.5 text-base font-medium hover:bg-white/10 transition-colors"
              >
                Explore the platform
              </a>
            </div>

            <div className="hero-scroll-hint absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-1 text-slate-400 text-xs tracking-widest uppercase whitespace-nowrap">
              Scroll to follow the pulse
              <ChevronDown className="w-5 h-5 animate-bounce" />
            </div>
          </section>

          {/* ------------------------------------------------ features */}
          <section id="features" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="reveal max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  The platform
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  One platform for the whole delivery team
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  FA, dev, QA and PM working the same living data — not four tools stitched
                  together with exports.
                </p>
              </div>

              <div className="feature-grid mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="feature-card group rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-7 hover:border-teal-400/40 hover:bg-white/[0.07] hover:-translate-y-1.5 transition-all duration-300"
                  >
                    <span className="grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400/20 to-sky-500/20 border border-teal-400/20 text-teal-300 group-hover:scale-110 transition-transform">
                      <f.icon className="w-6 h-6" />
                    </span>
                    <h3 className="mt-5 text-xl font-semibold">{f.title}</h3>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-slate-300/85">
                      {f.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ lifecycle */}
          <section id="workflow" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <div className="reveal text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  Lifecycle
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  One heartbeat, six phases
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  The same phases your PM Dashboard tracks — the landing page is an honest
                  preview, not marketing art.
                </p>
              </div>

              {/* ECG pulse strip — one colored spike per phase, drawn on scroll */}
              <div className="pulse-strip reveal mt-14">
                <svg viewBox="0 0 640 96" className="w-full block" aria-hidden="true">
                  <line x1="0" y1="48" x2="640" y2="48" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <path className="pulse-seg" d="M0 48 L60 48 L70 33 L80 59 L90 48 L106 48" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" />
                  <path className="pulse-seg" d="M106 48 L166 48 L176 31 L186 61 L196 48 L212 48" fill="none" stroke="#f0abfc" strokeWidth="2.5" strokeLinejoin="round" />
                  <path className="pulse-seg" d="M212 48 L272 48 L282 27 L292 63 L302 48 L318 48" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinejoin="round" />
                  <path className="pulse-seg" d="M318 48 L378 48 L388 23 L398 65 L408 48 L424 48" fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinejoin="round" />
                  <path className="pulse-seg" d="M424 48 L484 48 L494 27 L504 61 L514 48 L530 48" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />
                  <path className="pulse-seg" d="M530 48 L588 48 L596 17 L604 48 L640 48" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" />
                  <circle cx="596" cy="17" r="4" fill="#34d399" />
                </svg>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-y-2 text-center mt-2">
                  {PHASES.map((p) => (
                    <span key={p.step} className="text-[11px] sm:text-xs font-semibold tracking-wide" style={{ color: p.color }}>
                      {p.title}
                    </span>
                  ))}
                </div>
              </div>

              <div className="workflow-list relative mt-14 md:mt-20">
                {/* animated spine — left rail on mobile, centered on desktop */}
                <div className="workflow-spine absolute left-5 md:left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-teal-400 via-cyan-400/60 to-transparent" />

                <div className="space-y-12 md:space-y-20">
                  {PHASES.map((s, i) => (
                    <div
                      key={s.step}
                      className={`workflow-item relative flex items-center pl-14 md:pl-0 md:gap-16 ${
                        i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                      }`}
                    >
                      <div className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-5 sm:p-7">
                        <div className="flex items-center gap-3">
                          <span style={{ color: s.color }}>
                            <s.icon className="w-6 h-6" />
                          </span>
                          <h3 className="text-xl sm:text-2xl font-semibold">{s.title}</h3>
                        </div>
                        <p className="mt-3 text-[15px] leading-relaxed text-slate-300/85">
                          {s.desc}
                        </p>
                      </div>
                      {/* node on the spine */}
                      <span
                        className="absolute left-5 md:left-1/2 -translate-x-1/2 grid place-items-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#04070f] text-xs md:text-sm font-bold"
                        style={{ border: `1px solid ${s.color}66`, color: s.color }}
                      >
                        {s.step}
                      </span>
                      <div className="hidden md:block flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ numbers */}
          <section id="numbers" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="reveal rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-6 sm:p-10 md:p-14">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-teal-300" />
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                    Why teams switch to QMPulse
                  </h2>
                </div>
                <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10">
                  {STATS.map((s) => (
                    <div key={s.label}>
                      <div className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-sky-400">
                        <span className="stat-value" data-value={s.value}>
                          0
                        </span>
                        {s.suffix}
                      </div>
                      <p className="mt-2 text-sm text-slate-300/80 leading-snug">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-slate-400 border-t border-white/10 pt-8">
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-300" /> Audit trail on every action
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-teal-300" /> Integrates with Redmine
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-teal-300" /> Audit-ready Excel exports
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ CTA */}
          <section className="cta-section relative py-28 md:py-40 px-5 sm:px-6">
            <div className="cta-block mx-auto max-w-3xl text-center">
              <Activity className="mx-auto w-12 h-12 text-teal-300" strokeWidth={2.5} />
              <h2 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
                Feel the pulse.
              </h2>
              <p className="mt-5 text-lg text-slate-300/90">
                Sign in and see your delivery's live heartbeat — requirements, tests,
                defects, risks and go-live plans, beating in one place.
              </p>
              <button
                onClick={goLogin}
                className="group mt-10 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-400 to-sky-500 px-10 py-4 text-lg font-semibold text-[#04070f] shadow-xl shadow-teal-500/25 hover:shadow-teal-400/40 hover:scale-[1.03] transition-all"
              >
                Sign in to QMPulse
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </section>

          {/* ------------------------------------------------ footer */}
          <footer className="relative z-10 border-t border-white/5 py-8 px-6">
            <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                QMPulse — Quality Management Pulse
              </span>
              <span>© 2026 QMPulse. One pulse — from requirement to go-live.</span>
            </div>
          </footer>
        </main>
      </div>
    </ReactLenis>
  );
};

export default QMPulseLanding;
