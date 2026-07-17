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
  Bell,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  ClipboardList,
  Code2,
  FileCheck,
  FileSpreadsheet,
  FlaskConical,
  GitBranch,
  History,
  Lightbulb,
  Lock,
  PlayCircle,
  Rocket,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import PulseScene from "@/components/landing/PulseScene";
import { scrollState } from "@/components/landing/scrollState";
import { PulseLogo } from "@/components/PulseLogo";

gsap.registerPlugin(ScrollTrigger);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const PERSONAS = [
  {
    tag: "Project & PMO",
    title: "Own the milestone",
    icon: BarChart3,
    desc: "Open the milestone, plan environments and capacity, then drive it all the way to close — watching schedule health, SPI and slippage in real time.",
  },
  {
    tag: "Functional Analysts",
    title: "Sharper requirements",
    icon: ClipboardList,
    desc: "Author requirements, catch the gaps with AI, and peer-approve each other's work — no one ever signs off their own.",
  },
  {
    tag: "Developers",
    title: "Build in context",
    icon: Code2,
    desc: "Pick up approved work with full requirement context, build, and flip to “For QA Test” — with defects synced straight back to Redmine.",
  },
  {
    tag: "QA Engineers",
    title: "Prove every path",
    icon: PlayCircle,
    desc: "Author test cases during the build, execute per environment, and evidence every result against every requirement.",
  },
  {
    tag: "Leadership",
    title: "The pulse at a glance",
    icon: ShieldCheck,
    desc: "First-pass rate, stability and schedule performance across every project — the readiness of every release, on one screen.",
  },
];

// The eight beats of a milestone — used for both the ECG ribbon (short label +
// colour) and the detailed vertical flow below it.
const PHASES = [
  {
    step: "01",
    short: "Plan",
    title: "Plan the milestone",
    owner: "PMO",
    icon: Calendar,
    color: "#a78bfa",
    desc: "Every cycle starts with the PMO. They create the milestone — scope, target dates and test environments — and the teams involved are notified the moment the clock starts.",
    mods: ["Milestones", "Configuration", "PM Dashboard"],
  },
  {
    step: "02",
    short: "Requirements",
    title: "Author requirements",
    owner: "FA",
    icon: ClipboardList,
    color: "#c084fc",
    desc: "Functional Analysts capture the requirements for the milestone. The AI Requirement Analyzer works alongside the author and reviewing FAs, flagging vague or untestable specs before they spread.",
    mods: ["Requirements", "AI Requirement Analyzer"],
  },
  {
    step: "03",
    short: "Review",
    title: "Peer-approve",
    owner: "FA",
    icon: FileCheck,
    color: "#f0abfc",
    desc: "A second FA reviews and approves each requirement — never its own author, and only from within the same project. Segregation of duties is enforced, not assumed.",
    mods: ["Requirement approval", "Same-project reviewer"],
  },
  {
    step: "04",
    short: "Develop",
    title: "Assign & build",
    owner: "Dev Lead · Dev",
    icon: Code2,
    color: "#818cf8",
    desc: "The Dev Lead is notified to assign approved requirements across the team. Developers build and flip each item to “For QA Test” when it's ready — while the QA Lead is notified in parallel to start planning tests.",
    mods: ["Task assignment", "Status: For QA Test", "Notifications"],
  },
  {
    step: "05",
    short: "Test design",
    title: "Author test cases",
    owner: "QA",
    icon: FlaskConical,
    color: "#38bdf8",
    desc: "In parallel with development, QA writes test cases mapped to each requirement — by hand or AI-assisted — so the moment a build lands, the tests are already waiting.",
    mods: ["Test Cases", "AI Authoring", "Traceability"],
  },
  {
    step: "06",
    short: "QA testing",
    title: "Execute testing",
    owner: "QA",
    icon: PlayCircle,
    color: "#2dd4bf",
    desc: "Once a developer hands a ticket to QA, execution runs per environment. Pass, fail and blocked update live; defects are raised straight from the failing step and pushed back to Dev through Redmine.",
    mods: ["Execution Dashboard", "Defects", "Redmine write-back"],
  },
  {
    step: "07",
    short: "Track",
    title: "Close testing & track",
    owner: "QA",
    icon: BarChart3,
    color: "#22d3ee",
    desc: "QA ends testing and updates their tasks against the milestone. Is it 100% clean, or are blockers still open? The milestone tells the truth at a glance — for everyone watching.",
    mods: ["Milestones", "Tasks", "QA Analytics"],
  },
  {
    step: "08",
    short: "UAT & Go-live",
    title: "UAT, close & learn",
    owner: "UAT · PMO",
    icon: Rocket,
    color: "#34d399",
    desc: "UAT runs to sign-off. The PMO marks UAT complete, then completes and closes the milestone — and lessons learned are captured so the next cycle starts sharper than the last.",
    mods: ["UAT sign-off", "Milestone close", "Lessons learned"],
  },
];

// ECG ribbon path — one coloured spike per phase, growing in amplitude toward
// the final go-live peak. viewBox 640×96, baseline y=48, 8 segments of 80px.
const RIBBON_SEGS = [
  { d: "M0 48 L44 48 L52 37 L60 59 L68 48 L80 48", color: "#a78bfa" },
  { d: "M80 48 L124 48 L132 35 L140 61 L148 48 L160 48", color: "#c084fc" },
  { d: "M160 48 L204 48 L212 33 L220 62 L228 48 L240 48", color: "#f0abfc" },
  { d: "M240 48 L284 48 L292 31 L300 63 L308 48 L320 48", color: "#818cf8" },
  { d: "M320 48 L364 48 L372 29 L380 64 L388 48 L400 48", color: "#38bdf8" },
  { d: "M400 48 L444 48 L452 27 L460 65 L468 48 L480 48", color: "#2dd4bf" },
  { d: "M480 48 L524 48 L532 25 L540 65 L548 48 L560 48", color: "#22d3ee" },
  { d: "M560 48 L604 48 L612 14 L620 48 L640 48", color: "#34d399" },
];

const THROUGHOUT = [
  {
    icon: Bell,
    title: "Notifications",
    desc: "Every hand-off pings the people who need to act — PMO, FA, Dev Lead, QA Lead and their teams. Nobody waits on an email that never comes.",
  },
  {
    icon: ShieldAlert,
    title: "Risk register",
    desc: "Risks are logged, scored and tracked from the milestone's first day to its last — visible right beside the plan the whole way through.",
  },
  {
    icon: Lightbulb,
    title: "Lessons learned",
    desc: "When the milestone closes, what worked and what slipped is captured — turning every release into fuel for the next.",
  },
];

const CAP_GROUPS = [
  {
    icon: Calendar,
    title: "Plan & Govern",
    items: [
      { name: "Milestones & sprints", desc: "Scoped projects, environments and target dates with live schedule health." },
      { name: "Resources & capacity", desc: "See who's loaded, who's free, and where the next bottleneck is forming." },
      { name: "Risk register", desc: "Log, score and track risks with owners and mitigation, right beside the plan." },
    ],
  },
  {
    icon: FlaskConical,
    title: "Build & Test",
    items: [
      { name: "Test-case library", desc: "Versioned cases with steps, expected results and module mapping." },
      { name: "Execution tracking", desc: "Live pass / fail / blocked per run, per module, per environment." },
      { name: "Defect management", desc: "Raise from a failing step; drive CAPA and Pareto from full status history." },
    ],
  },
  {
    icon: BarChart3,
    title: "Analyze & Report",
    items: [
      { name: "PM dashboard", desc: "SPI, first-pass and stability, plus a plan-vs-actual phase timeline." },
      { name: "QA analytics", desc: "Trends across milestones — quality signals leadership can act on." },
      { name: "Verdict reports", desc: "One-click PMO summaries, verdict emails and styled Excel exports." },
    ],
  },
  {
    icon: ShieldCheck,
    title: "Platform",
    items: [
      { name: "Role-based access", desc: "15 roles across 5 departments — everyone sees exactly their slice." },
      { name: "Full audit log", desc: "Every change captured with a complete, searchable history trail." },
      { name: "Redmine + AI", desc: "Two-way tracker sync and an AI hub woven through the whole flow." },
    ],
  },
];

const BACKBONE = [
  {
    icon: GitBranch,
    title: "Deep Redmine sync",
    lead: "QMPulse doesn't replace Redmine — it makes it flow. Tickets, projects and custom fields move both ways, so your tracker and your quality workspace never drift apart.",
    points: [
      "Import requirements and tickets, hierarchy intact",
      "Push defects and status changes straight back",
      "Insert-only sync — nothing gets clobbered",
      "Custom-field mapping across both systems",
    ],
  },
  {
    icon: Bot,
    title: "The AI Hub",
    lead: "AI is woven through the lifecycle, not tacked on the side — flagging risk early, drafting the tedious parts, and answering questions in plain language.",
    points: [
      "Requirement Analyzer — catches vague, untestable specs",
      "AI test-case generation from requirements",
      "QA Copilot — ask anything about your workspace",
      "Requirement Chat — converse with your specs",
    ],
  },
];

const GOVERNANCE = [
  {
    icon: ShieldCheck,
    title: "Role-based access",
    desc: "15 roles across FA, PM, Dev, QA and leadership — each with a purpose-built view and the permissions to match.",
  },
  {
    icon: History,
    title: "Full audit trail",
    desc: "Every requirement, test, defect and verdict change is logged and searchable — nothing happens off the record.",
  },
  {
    icon: Share2,
    title: "End-to-end traceability",
    desc: "Requirement → test → execution → defect → verdict. Follow any thread in either direction, instantly.",
  },
  {
    icon: Lock,
    title: "On-prem ready",
    desc: "Deploy inside your own network. Verdict emails, Excel exports and reporting run entirely on your terms.",
  },
];

const STATS = [
  { value: 100, suffix: "%", label: "traceability, from requirement to go-live" },
  { value: 8, suffix: "", label: "lifecycle stages, from PMO plan to PMO close" },
  { value: 15, suffix: "", label: "roles governed by one access matrix" },
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

      // Generic reveals (personas, capabilities, backbone, governance, headers)
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

      // Card grids stagger in as a group
      gsap.utils.toArray<HTMLElement>(".stagger-grid").forEach((grid) => {
        gsap.fromTo(
          grid.querySelectorAll(".stagger-item"),
          { y: 60, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: grid, start: "top 82%" },
          },
        );
      });

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

        {/* soft vignette so text stays readable over the scene */}
        <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(4,7,15,0.8)_100%)]" />

        {/* ------------------------------------------------ nav */}
        <header className="fixed top-0 inset-x-0 z-50">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between rounded-b-2xl backdrop-blur-md bg-[#04070f]/50 border-b border-white/5">
            <PulseLogo size="md" />
            <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
              <a href="#teams" className="hover:text-teal-300 transition-colors">Teams</a>
              <a href="#lifecycle" className="hover:text-teal-300 transition-colors">The Flow</a>
              <a href="#platform" className="hover:text-teal-300 transition-colors">Platform</a>
              <a href="#trust" className="hover:text-teal-300 transition-colors">Governance</a>
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
              Quality Management Pulse
            </div>

            <h1 className="mt-8 text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              <span className="hero-line block">From first requirement</span>
              <span className="hero-line block bg-gradient-to-r from-teal-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
                to final verdict.
              </span>
            </h1>

            <p className="hero-desc mt-7 max-w-2xl text-lg md:text-xl text-slate-300/90 leading-relaxed">
              QMPulse unifies functional analysis, planning, development, QA and PMO reporting
              into one traceable flow — so every team feels the same pulse, in real time, from
              intake to sign-off.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full max-w-xs sm:max-w-none sm:w-auto">
              <button
                onClick={goLogin}
                className="hero-cta group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-teal-400 to-sky-500 px-8 py-3.5 text-base font-semibold text-[#04070f] shadow-xl shadow-teal-500/25 hover:shadow-teal-400/40 hover:scale-[1.03] transition-all"
              >
                Start the flow
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#lifecycle"
                className="hero-cta inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 py-3.5 text-base font-medium hover:bg-white/10 transition-colors"
              >
                See the lifecycle
              </a>
            </div>

            <div className="hero-cta mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-500 font-mono tracking-wide">
              <span><b className="font-semibold text-slate-300">5</b> teams</span>
              <span><b className="font-semibold text-slate-300">8</b> lifecycle stages</span>
              <span><b className="font-semibold text-slate-300">1</b> source of truth</span>
              <span>Redmine-synced</span>
              <span>AI-accelerated</span>
            </div>

            <div className="hero-scroll-hint absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-1 text-slate-400 text-xs tracking-widest uppercase whitespace-nowrap">
              Follow the pulse
              <ChevronDown className="w-5 h-5 animate-bounce" />
            </div>
          </section>

          {/* ------------------------------------------------ personas */}
          <section id="teams" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="reveal max-w-2xl mx-auto text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  Built for the whole delivery org
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  Five teams. One source of truth.
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  QMPulse isn't a QA tool bolted onto a tracker. It's the shared heartbeat every
                  role works from — each with the view they need, all on the same live data.
                </p>
              </div>

              <div className="stagger-grid mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {PERSONAS.map((p) => (
                  <div
                    key={p.tag}
                    className="stagger-item group rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 hover:border-teal-400/40 hover:bg-white/[0.07] hover:-translate-y-1.5 transition-all duration-300"
                  >
                    <span className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-teal-400/20 to-sky-500/20 border border-teal-400/20 text-teal-300 group-hover:scale-110 transition-transform">
                      <p.icon className="w-5 h-5" />
                    </span>
                    <p className="mt-4 text-[11px] font-mono uppercase tracking-[0.12em] text-teal-300">
                      {p.tag}
                    </p>
                    <h3 className="mt-1.5 text-lg font-semibold">{p.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300/80">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ lifecycle / the flow */}
          <section id="lifecycle" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <div className="reveal text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  The flow
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  One milestone, one continuous heartbeat.
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  The PMO opens it, the PMO closes it — and in between, every team hands off
                  cleanly, gets notified at each beat, and works from the same live data. Risk is
                  tracked start to finish.
                </p>
              </div>

              {/* ECG pulse strip — one coloured spike per phase, drawn on scroll */}
              <div className="pulse-strip reveal mt-14">
                <svg viewBox="0 0 640 96" className="w-full block" aria-hidden="true">
                  <line x1="0" y1="48" x2="640" y2="48" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  {RIBBON_SEGS.map((s, i) => (
                    <path
                      key={i}
                      className="pulse-seg"
                      d={s.d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  <circle cx="612" cy="14" r="4" fill="#34d399" />
                </svg>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-y-2 text-center mt-2">
                  {PHASES.map((p) => (
                    <span
                      key={p.step}
                      className="text-[10px] sm:text-[11px] font-semibold tracking-wide leading-tight px-1"
                      style={{ color: p.color }}
                    >
                      {p.short}
                    </span>
                  ))}
                </div>
              </div>

              {/* Detailed vertical flow */}
              <div className="workflow-list relative mt-16 md:mt-24">
                {/* animated spine — left rail on mobile, centered on desktop */}
                <div className="workflow-spine absolute left-5 md:left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-purple-400 via-teal-400/60 to-emerald-400/40" />

                <div className="space-y-12 md:space-y-20">
                  {PHASES.map((s, i) => (
                    <div
                      key={s.step}
                      className={`workflow-item relative flex items-stretch pl-14 md:pl-0 md:gap-16 ${
                        i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                      }`}
                    >
                      <div className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-5 sm:p-7">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span style={{ color: s.color }}>
                            <s.icon className="w-6 h-6" />
                          </span>
                          <h3 className="text-xl sm:text-2xl font-semibold">{s.title}</h3>
                          <span
                            className="ml-auto text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ backgroundColor: `${s.color}1f`, color: s.color }}
                          >
                            {s.owner}
                          </span>
                        </div>
                        <p className="mt-3 text-[15px] leading-relaxed text-slate-300/85">
                          {s.desc}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {s.mods.map((m) => (
                            <span
                              key={m}
                              className="text-[11px] text-slate-400 border border-white/10 rounded-full px-2 py-0.5"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* node on the spine */}
                      <span
                        className="absolute left-5 md:left-1/2 -translate-x-1/2 top-6 md:top-1/2 md:-translate-y-1/2 grid place-items-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#04070f] text-xs md:text-sm font-bold"
                        style={{ border: `1px solid ${s.color}66`, color: s.color }}
                      >
                        {s.step}
                      </span>
                      <div className="hidden md:block flex-1" />
                    </div>
                  ))}
                </div>
              </div>

              {/* cross-cutting: runs through the whole milestone */}
              <div className="reveal mt-14 md:mt-20 md:ml-16 rounded-2xl border border-dashed border-teal-400/25 bg-teal-400/[0.03] p-6 sm:p-7">
                <p className="text-center text-[11px] font-mono uppercase tracking-[0.18em] text-teal-300 mb-6">
                  Running through every beat
                </p>
                <div className="grid gap-6 sm:grid-cols-3">
                  {THROUGHOUT.map((t) => (
                    <div key={t.title} className="flex gap-3">
                      <t.icon className="w-5 h-5 text-teal-300 shrink-0 mt-0.5" />
                      <div>
                        <b className="text-[15px] font-semibold">{t.title}</b>
                        <p className="mt-1 text-sm leading-relaxed text-slate-300/80">{t.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ capabilities */}
          <section id="platform" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="reveal max-w-2xl mx-auto text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  The platform
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  Everything the release needs — in one place.
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  Twelve capabilities, four disciplines, zero spreadsheets flying around on email.
                </p>
              </div>

              <div className="stagger-grid mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {CAP_GROUPS.map((g) => (
                  <div
                    key={g.title}
                    className="stagger-item rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6"
                  >
                    <div className="flex items-center gap-2.5 pb-4 mb-1 border-b border-white/10">
                      <g.icon className="w-5 h-5 text-teal-300" />
                      <span className="text-lg font-semibold">{g.title}</span>
                    </div>
                    {g.items.map((it) => (
                      <div key={it.name} className="flex gap-2.5 py-3">
                        <Check className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" strokeWidth={3} />
                        <div>
                          <b className="text-[15px] font-semibold">{it.name}</b>
                          <p className="mt-0.5 text-sm leading-relaxed text-slate-300/75">{it.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ backbone: redmine + ai */}
          <section className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="reveal max-w-2xl mx-auto text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  The backbone
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  Redmine-synced. AI-accelerated.
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  Two forces run through every stage: your tracker stays the system of record, and
                  AI removes the busywork between the beats.
                </p>
              </div>

              <div className="stagger-grid mt-14 grid gap-5 md:grid-cols-2">
                {BACKBONE.map((b) => (
                  <div
                    key={b.title}
                    className="stagger-item relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-7 sm:p-8"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(58,245,200,0.08),transparent_60%)]" />
                    <span className="relative grid place-items-center w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400/20 to-sky-500/20 border border-teal-400/20 text-teal-300">
                      <b.icon className="w-6 h-6" />
                    </span>
                    <h3 className="relative mt-5 text-2xl font-semibold">{b.title}</h3>
                    <p className="relative mt-2.5 text-[15px] leading-relaxed text-slate-300/85">
                      {b.lead}
                    </p>
                    <ul className="relative mt-5 space-y-2.5">
                      {b.points.map((pt) => (
                        <li key={pt} className="flex gap-2.5 text-sm text-slate-300/85">
                          <Check className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" strokeWidth={3} />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------ governance */}
          <section id="trust" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="reveal max-w-2xl mx-auto text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  Trust &amp; control
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  Enterprise-grade by default.
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  When quality is the product, the platform that measures it has to be accountable too.
                </p>
              </div>

              <div className="stagger-grid mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {GOVERNANCE.map((g) => (
                  <div
                    key={g.title}
                    className="stagger-item rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6"
                  >
                    <span className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-violet-400/20 to-sky-500/20 border border-violet-400/25 text-violet-300">
                      <g.icon className="w-5 h-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold">{g.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300/80">{g.desc}</p>
                  </div>
                ))}
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
                    Why teams run on QMPulse
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
                    <GitBranch className="w-4 h-4 text-teal-300" /> Redmine-native, two-way sync
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Bot className="w-4 h-4 text-teal-300" /> AI woven through every stage
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-teal-300" /> Audit-ready Excel &amp; verdict exports
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
                From the first requirement to the final verdict, QMPulse keeps every team beating as
                one. Sign in and see your delivery come alive.
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
              <span>© 2026 QMPulse. From requirement to verdict, one living heartbeat.</span>
            </div>
          </footer>
        </main>
      </div>
    </ReactLenis>
  );
};

export default QMPulseLanding;
