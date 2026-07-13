import React, { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ReactLenis } from "@studio-freight/react-lenis";
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
  FileSpreadsheet,
  GitBranch,
  Layers,
  PlayCircle,
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

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Test Case Library",
    desc: "Author, organise and version every test case — steps, expected results and modules in one searchable library.",
  },
  {
    icon: PlayCircle,
    title: "Execution Tracking",
    desc: "Live pass / fail / blocked counts per run, per module, per ticket. Watch a release's heartbeat in real time.",
  },
  {
    icon: Bug,
    title: "Defect Management",
    desc: "Raise defects straight from a failing step, then drive CAPA and Pareto analysis from the full status history.",
  },
  {
    icon: GitBranch,
    title: "Deep Redmine Sync",
    desc: "Tickets, projects and custom fields flow both ways. Your tracker and your QA workspace never drift apart.",
  },
  {
    icon: Bot,
    title: "AI-Assisted Authoring",
    desc: "Draft test cases from requirements in seconds, with AI-assisted flags so reviewers always know the origin.",
  },
  {
    icon: BarChart3,
    title: "PMO Report Portal",
    desc: "Module-level summaries, verdict emails and styled Excel exports — reporting that builds itself.",
  },
];

const STEPS = [
  {
    icon: Layers,
    step: "01",
    title: "Plan",
    desc: "Pull requirements and Redmine tickets into scoped projects with milestones and assigned resources.",
  },
  {
    icon: ClipboardList,
    step: "02",
    title: "Author",
    desc: "Build the test case library — by hand or with AI assistance — mapped to modules and requirements.",
  },
  {
    icon: PlayCircle,
    step: "03",
    title: "Execute",
    desc: "Run execution files per ticket. Every status change is audited for traceability and CAPA.",
  },
  {
    icon: FileSpreadsheet,
    step: "04",
    title: "Report",
    desc: "One click to verdict emails, PMO dashboards and review-logged Excel deliverables.",
  },
];

const STATS = [
  { value: 100, suffix: "%", label: "traceability, from requirement to verdict" },
  { value: 6, suffix: "", label: "role-based portals in a single platform" },
  { value: 40, suffix: "%", label: "less time spent assembling reports" },
  { value: 1, suffix: "", label: "source of truth for your whole QA operation" },
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
                Workflow
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
              Quality Management Pulse
            </div>

            <h1 className="mt-8 text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              <span className="hero-line block">The pulse of your</span>
              <span className="hero-line block bg-gradient-to-r from-teal-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
                product quality.
              </span>
            </h1>

            <p className="hero-desc mt-7 max-w-2xl text-lg md:text-xl text-slate-300/90 leading-relaxed">
              QMPulse unifies test cases, execution runs, defects and PMO reporting into one
              live heartbeat — so your team always knows exactly how healthy the release is.
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
                  Everything your QA team runs on
                </h2>
                <p className="mt-4 text-lg text-slate-300/90">
                  Six systems your team juggles today, beating as one.
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

          {/* ------------------------------------------------ workflow */}
          <section id="workflow" className="relative py-24 md:py-32 px-5 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <div className="reveal text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
                  Workflow
                </p>
                <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
                  From plan to verdict
                </h2>
              </div>

              <div className="workflow-list relative mt-14 md:mt-20">
                {/* animated spine — left rail on mobile, centered on desktop */}
                <div className="workflow-spine absolute left-5 md:left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-teal-400 via-cyan-400/60 to-transparent" />

                <div className="space-y-12 md:space-y-20">
                  {STEPS.map((s, i) => (
                    <div
                      key={s.step}
                      className={`workflow-item relative flex items-center pl-14 md:pl-0 md:gap-16 ${
                        i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                      }`}
                    >
                      <div className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-5 sm:p-7">
                        <div className="flex items-center gap-3">
                          <span className="text-teal-300">
                            <s.icon className="w-6 h-6" />
                          </span>
                          <h3 className="text-xl sm:text-2xl font-semibold">{s.title}</h3>
                        </div>
                        <p className="mt-3 text-[15px] leading-relaxed text-slate-300/85">
                          {s.desc}
                        </p>
                      </div>
                      {/* node on the spine */}
                      <span className="absolute left-5 md:left-1/2 -translate-x-1/2 grid place-items-center w-10 h-10 md:w-12 md:h-12 rounded-full border border-teal-400/40 bg-[#04070f] text-xs md:text-sm font-bold text-teal-300 shadow-lg shadow-teal-500/20">
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
                    <Workflow className="w-4 h-4 text-teal-300" /> Redmine-native integration
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Bot className="w-4 h-4 text-teal-300" /> AI-assisted test authoring
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
                Sign in and see the live heartbeat of your product quality — test cases,
                executions, defects and reports, beating in one place.
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
              <span>© 2026 QMPulse. The pulse of your product quality.</span>
            </div>
          </footer>
        </main>
      </div>
    </ReactLenis>
  );
};

export default QMPulseLanding;
