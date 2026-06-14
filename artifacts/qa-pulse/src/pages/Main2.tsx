import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { ReactLenis } from "@studio-freight/react-lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  Bot,
  ShieldCheck,
  BarChart3,
  Workflow,
  ListChecks,
  BrainCircuit,
  Bug,
  Zap,
  CheckCircle2,
  XCircle,
  ArrowRight,
  LayoutDashboard,
  TestTube,
  Sparkles,
  CheckCircle,
} from "lucide-react";

// 1. Import your downloaded animated icons from itshover.com here
import { AnimatedQALogo } from "@/components/icons/animated";

// Register GSAP Plugin
gsap.registerPlugin(ScrollTrigger);

const Main2: React.FC = () => {
  const [, setLocation] = useLocation();
  const [activeAiStep, setActiveAiStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLoginClick = () => {
    setLocation("/login");
  };

  // Simulate AI workflow steps looping
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAiStep((prev) => (prev + 1) % 4);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // --- FRAMER MOTION VARIANTS ---
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  // --- GSAP SCROLL ANIMATIONS ---
  useGSAP(
    () => {
      // 1. Hero Reveal Animation
      const tl = gsap.timeline();
      tl.from(".hero-pill", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out", delay: 0.2 })
        .from(".hero-title span", { y: 40, opacity: 0, duration: 1, stagger: 0.15, ease: "power4.out" }, "-=0.6")
        .from(".hero-desc", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.6")
        .from(".hero-btn", { scale: 0.9, opacity: 0, duration: 0.5, ease: "back.out(1.5)" }, "-=0.4")
        .from(".hero-mockup", { y: 100, opacity: 0, duration: 1.2, ease: "power4.out" }, "-=0.8");

      // 2. Parallax Scrubbing on Hero Mockup
      gsap.to(".hero-mockup", {
        y: -80,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero-section",
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      });

      // 3. Background Glow Parallax
      gsap.utils.toArray(".bg-glow-effect").forEach((glow: any) => {
        gsap.to(glow, {
          y: 150,
          scale: 1.1,
          scrollTrigger: {
            trigger: glow.parentElement,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      // 4. Stats Reveal
      gsap.from(".stat-card", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".stats-section",
          start: "top 85%",
        },
      });

      // 5. Comparison Cards
      gsap.from(".compare-bad", {
        x: -50,
        opacity: 0,
        duration: 1,
        ease: "power4.out",
        scrollTrigger: {
          trigger: ".compare-section",
          start: "top 70%",
        },
      });
      gsap.from(".compare-good", {
        x: 50,
        opacity: 0,
        duration: 1,
        ease: "power4.out",
        scrollTrigger: {
          trigger: ".compare-section",
          start: "top 70%",
        },
      });
    },
    { scope: containerRef }
  );

  const aiWorkflowSteps = [
    { text: "Analyzing Requirement REQ-1042...", icon: <BrainCircuit className="w-4 h-4 text-indigo-500" /> },
    { text: "Generating Edge Cases...", icon: <Sparkles className="w-4 h-4 text-amber-500" /> },
    { text: "Writing 5 Test Cases...", icon: <TestTube className="w-4 h-4 text-blue-500" /> },
    { text: "Saved to Repository", icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
  ];

  return (
    <ReactLenis root options={{ lerp: 0.05, smoothWheel: true }}>
      <div ref={containerRef} className="min-h-screen bg-[#F8FAFC] text-slate-700 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">

        {/* --- NAVIGATION --- */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[100px] bg-blue-400/10 rounded-full blur-[40px] pointer-events-none z-0" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                <AnimatedQALogo className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg md:text-xl font-bold text-slate-900 tracking-tight truncate">
                QA Pulse
              </span>
            </div>
            <button
              onClick={handleLoginClick}
              className="px-4 py-2 text-sm font-medium text-white rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
            >
              Login
            </button>
          </div>
        </nav>

        {/* --- HERO SECTION --- */}
        {/* Reduced top padding from pt-28/md:pt-32 to pt-20/md:pt-24 to remove the awkward empty space */}
        <section className="hero-section pt-20 md:pt-24 pb-16 md:pb-20 px-4 sm:px-6 relative">
          <div className="bg-glow-effect absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[800px] md:h-[800px] bg-blue-400/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none z-0" />

          <div className="max-w-7xl mx-auto text-center relative z-10">
            <div className="hero-content">
              <span className="hero-pill inline-block py-1 px-3 rounded-full bg-blue-50 border border-blue-200 text-xs sm:text-sm font-medium text-blue-600 mb-6 shadow-sm">
                Introducing AI Intelligence Hub
              </span>
              <h1 className="hero-title text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6 md:mb-8 leading-tight text-slate-900 overflow-hidden">
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-slate-950 via-slate-900 to-blue-600">
                  Smarter QA, Better Releases.
                </span>
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-slate-950 via-slate-900 to-blue-600">
                  Powered by AI.
                </span>
              </h1>
              <p className="hero-desc text-base sm:text-lg md:text-xl text-slate-600 max-w-3xl mx-auto mb-8 md:mb-10 leading-relaxed px-2">
                Transform your daily workflow with the premier internal web-based QA management platform. Centralize requirement intake and automate test case creation.
              </p>
              <div className="hero-btn flex justify-center">
                <button
                  onClick={handleLoginClick}
                  className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center shadow-sm hover:scale-105 transition-transform"
                >
                  Get Started <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>

            {/* Hero Mockup */}
            <div className="hero-mockup mt-12 md:mt-16 mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl overflow-hidden min-h-[550px] sm:min-h-[500px] md:aspect-video relative flex items-center justify-center">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] z-0"></div>

              <div className="absolute inset-2 sm:inset-4 bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex z-10 flex-row text-left">
                {/* Sidebar */}
                <div className="w-14 md:w-48 shrink-0 bg-slate-50 border-r border-slate-100 p-2 md:p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-6 mt-2 md:mt-0 md:px-2">
                    <AnimatedQALogo className="w-5 h-5 shrink-0" />
                    <span className="font-bold text-slate-800 hidden md:block">QA Pulse</span>
                  </div>
                  {[
                    { icon: <LayoutDashboard className="w-5 h-5 md:w-4 md:h-4" />, label: "Dashboard", active: true },
                    { icon: <ListChecks className="w-5 h-5 md:w-4 md:h-4" />, label: "Requirements", active: false },
                    { icon: <TestTube className="w-5 h-5 md:w-4 md:h-4" />, label: "Test Cases", active: false },
                    { icon: <BrainCircuit className="w-5 h-5 md:w-4 md:h-4" />, label: "AI Hub", active: false },
                  ].map((item, idx) => (
                    <div key={idx} className={`flex items-center justify-center md:justify-start gap-3 p-2 md:px-3 md:py-2 rounded-md text-sm font-medium transition-colors ${item.active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`}>
                      {item.icon}
                      <span className="hidden md:block">{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 overflow-y-auto bg-white">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0 pb-2 border-b border-slate-100">
                    <div>
                      <h2 className="text-base md:text-lg font-bold text-slate-800">Welcome to QA Pulse,</h2>
                      <p className="text-[10px] md:text-xs text-slate-500">Project Alpha - Release 1.2</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                    <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100">
                      <p className="text-[10px] md:text-xs text-slate-500 font-medium">Test Execution</p>
                      <h3 className="text-lg md:text-2xl font-bold text-slate-800">84%</h3>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: "84%" }} transition={{ duration: 1.5, delay: 0.8 }} className="bg-blue-500 h-full rounded-full" />
                      </div>
                    </div>
                  </div>

                  {/* AI Live Feed inside Mockup */}
                  <div className="mt-4 bg-slate-900 rounded-lg p-3 md:p-4 flex flex-col h-48 md:h-full overflow-hidden relative shadow-inner">
                    <div className="flex items-center gap-2 mb-2 md:mb-4">
                      <BrainCircuit className="w-3 h-3 md:w-4 md:h-4 text-indigo-400" />
                      <h4 className="text-xs md:text-sm font-bold text-white">AI Intelligence Hub</h4>
                    </div>
                    <div className="flex-1 relative overflow-y-auto scrollbar-hide">
                      <AnimatePresence mode="popLayout">
                        {aiWorkflowSteps.slice(0, activeAiStep + 1).map((step, index) => (
                          <motion.div key={index} initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.3 }} className="bg-white/10 backdrop-blur-md rounded border border-white/10 p-1.5 md:p-2 mb-2 flex items-center gap-2 md:gap-3">
                            <div className="p-1 md:p-1.5 bg-white/10 rounded-md shrink-0">
                              {step.icon}
                            </div>
                            <span className="text-[10px] md:text-xs font-medium text-slate-200 truncate">{step.text}</span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- PLATFORM OVERVIEW SECTION --- */}
        <section className="py-16 md:py-24 px-4 sm:px-6 relative">
          <div className="bg-glow-effect absolute left-1/4 top-1/2 -translate-y-1/2 w-[300px] h-[300px] md:w-[600px] md:h-[600px] bg-blue-300/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none z-0" />

          <div className="max-w-7xl mx-auto relative z-10">
            <div className="text-center mb-10 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">
                A Unified QA Ecosystem
              </h2>
              <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Centralize requirement intake, automate test case creation, and gain clear visibility into team productivity and progress across manual and automation workflows.
              </p>
            </div>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
            >
              {[
                {
                  icon: <ListChecks />,
                  title: "Requirement Management",
                  desc: "Redmine integration, user stories, and strict traceability.",
                },
                {
                  icon: <ShieldCheck />,
                  title: "Test Management",
                  desc: "Centralized test case repository with version control.",
                },
                {
                  icon: <Workflow />,
                  title: "QA Operations",
                  desc: "Task assignment, block tracking, and progress monitoring.",
                },
                {
                  icon: <BarChart3 />,
                  title: "Reporting & Analytics",
                  desc: "Real-time metrics, coverage analysis, and defect trends.",
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  variants={fadeIn}
                  className="p-5 md:p-6 rounded-2xl bg-white shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 hover:border-blue-300 hover:shadow-md transition-all cursor-default"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 mb-4 md:mb-6">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {feature.desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* --- AI-POWERED FEATURES SECTION --- */}
        <section className="ai-section py-16 md:py-24 px-4 sm:px-6 relative">
          <div className="bg-glow-effect absolute right-1/4 top-1/2 -translate-y-1/2 w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-blue-400/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none z-0" />

          <div className="max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row gap-10 md:gap-16 items-center">
            {/* Left Side Content */}
            <div className="flex-1 w-full text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">
                Meet your new <br className="hidden md:block" />
                <span className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">AI Intelligence Hub</span>
              </h2>
              <p className="text-base md:text-lg text-slate-600 mb-6 md:mb-8 leading-relaxed max-w-lg mx-auto md:mx-0">
                QA Pulse uses advanced conversational AI to eliminate repetitive tasks. Analyze vague requirements, generate edge cases instantly, and synthesize weekly performance summaries without breaking a sweat.
              </p>
              <ul className="space-y-4 max-w-md mx-auto md:mx-0 text-left">
                {[
                  "AI Test Case & Data Generator",
                  "Coverage Gap Analysis",
                  "Duplicate Checker & Search",
                  "Weekly Summaries"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm md:text-base text-slate-700 font-medium">
                    <div className="w-5 h-5 rounded-full border border-blue-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Side - Static 2x2 Grid */}
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
              {[
                { icon: <BrainCircuit className="w-6 h-6" />, title: "Requirement Analysis" },
                { icon: <Bot className="w-6 h-6" />, title: "Test Case Generation" },
                { icon: <Bug className="w-6 h-6" />, title: "Defect Classification" },
                { icon: <Zap className="w-6 h-6" />, title: "Risk Prediction" },
              ].map((card, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:border-blue-400 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all flex flex-col items-start gap-4"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 blur-[30px] rounded-full group-hover:bg-blue-100 transition-colors" />
                  <div className="text-blue-600 shrink-0 relative z-10">
                    {card.icon}
                  </div>
                  <h4 className="text-slate-800 font-semibold text-lg relative z-10 leading-tight">
                    {card.title}
                  </h4>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* --- ANALYTICS & DASHBOARD SHOWCASE --- */}
        <section className="stats-section py-16 md:py-24 px-4 sm:px-6 relative">
           <div className="bg-glow-effect absolute left-1/2 bottom-0 -translate-x-1/2 w-[400px] h-[300px] bg-blue-300/10 rounded-full blur-[80px] pointer-events-none z-0" />

          <div className="max-w-7xl mx-auto relative z-10">
            <div className="text-center mb-10 md:mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">
                Enterprise-Grade Visibility
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { label: "Sprint Quality Score", value: "98%", trend: "+2.4%" },
                { label: "Executed Tests", value: "1,248", trend: "+12%" },
                { label: "Automation Coverage", value: "64%", trend: "+5%" },
                { label: "Defect Density", value: "1.2", trend: "-0.4%" },
              ].map((stat, i) => (
                <div key={i} className="stat-card p-5 md:p-6 rounded-[20px] bg-white border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col justify-between">
                  <p className="text-xs md:text-sm text-slate-500 mb-2 font-medium">{stat.label}</p>
                  <div className="flex items-baseline justify-between sm:justify-start sm:gap-3">
                    <h4 className="text-2xl md:text-3xl font-bold text-slate-900">{stat.value}</h4>
                    <span className={`text-xs font-bold ${stat.trend.startsWith("+") ? "text-emerald-600" : "text-blue-600"}`}>
                      {stat.trend}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- WHY QA PULSE (COMPARISON) --- */}
        <section className="compare-section py-16 md:py-24 px-4 sm:px-6 relative">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">
              Traditional vs. QA Pulse
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-7xl mx-auto text-left">

              <div className="compare-bad p-6 md:p-8 rounded-[24px] bg-red-50/50 border border-red-100 relative z-10">
                <h3 className="text-lg md:text-xl font-bold text-red-700 mb-5 md:mb-6 flex items-center gap-2">
                  <XCircle className="w-5 h-5 shrink-0" /> Traditional QA
                </h3>
                <ul className="space-y-3 md:space-y-4">
                  {["Manual, repetitive test creation", "Disconnected tools and scattered data", "Slow reporting requiring meetings"].map((item, i) => (
                    <li key={i} className="flex items-start md:items-center gap-3 text-sm md:text-base text-slate-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5 md:mt-0" /> <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="compare-good p-6 md:p-8 rounded-[24px] bg-white border border-slate-100 relative shadow-[0_4px_20px_rgb(0,0,0,0.03)] z-10">
                <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-blue-200/30 blur-[40px] pointer-events-none" />
                <h3 className="text-lg md:text-xl font-bold text-blue-700 mb-5 md:mb-6 flex items-center gap-2 relative z-10">
                  <CheckCircle2 className="w-5 h-5 shrink-0" /> QA Pulse
                </h3>
                <ul className="space-y-3 md:space-y-4 relative z-10">
                  {["AI-assisted rapid test generation", "Unified platform with Redmine sync", "Real-time PMO & Admin dashboards"].map((item, i) => (
                    <li key={i} className="flex items-start md:items-center gap-3 text-sm md:text-base text-slate-800 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5 md:mt-0" /> <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        </section>

      </div>
    </ReactLenis>
  );
};

export default Main2;