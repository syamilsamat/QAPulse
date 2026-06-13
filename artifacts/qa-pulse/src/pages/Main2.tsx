import React from "react";
import { motion } from "framer-motion";
import { useLocation } from 'wouter';
import {
  Bot,
  ShieldCheck,
  BarChart3,
  Workflow,
  ListChecks,
  Zap,
  BrainCircuit,
  Bug,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";

const Main2: React.FC = () => {
  // REPLACE IT WITH THIS:
  const [, setLocation] = useLocation();

  const handleLoginClick = () => {
    // Navigate to the login route configured in App.tsx
    setLocation('/login');
  };

  // Animation variants
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-200 font-sans selection:bg-blue-500/30">
      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              QA Pulse
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Documentation
            </button>
            <button className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Features
            </button>
            <button
              onClick={handleLoginClick}
              className="px-4 py-2 text-sm font-medium bg-white text-black rounded-full hover:bg-slate-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={fadeIn}>
            <span className="inline-block py-1 px-3 rounded-full bg-white/5 border border-white/10 text-sm text-blue-400 mb-6">
              ✨ Introducing AI Intelligence Hub
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-8 leading-tight">
              Smarter QA. Faster Releases. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
                Powered by AI.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              Transform your daily workflow with the premier internal web-based
              QA management platform. Centralize requirement intake, automate
              test case creation, and gain unprecedented PMO visibility.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleLoginClick}
                className="px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-slate-200 transition-colors shadow-lg flex items-center gap-2"
              >
                Get Started <ArrowRight className="w-4 h-4" />
              </button>
              <button className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-full hover:bg-white/10 transition-colors">
                View Dashboard
              </button>
            </div>
          </motion.div>

          {/* Hero Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-16 mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#111] shadow-2xl overflow-hidden aspect-video relative flex items-center justify-center bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]"
          >
            {/* Abstract representation of a dashboard */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
            <div className="text-center">
              <BarChart3 className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 font-mono text-sm">
                Interactive Dashboard Rendered Here
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- PLATFORM OVERVIEW SECTION --- */}
      <section className="py-24 bg-[#0d0d0d] border-t border-white/5 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              A Unified QA Ecosystem
            </h2>
            <p className="text-slate-400">
              Everything you need to orchestrate quality assurance, from
              requirements to release.
            </p>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
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
                className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* --- AI-POWERED FEATURES SECTION --- */}
      <section className="py-24 px-6 relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Meet your new{" "}
                <span className="text-indigo-400">AI Intelligence Hub</span>
              </h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                QA Pulse uses advanced conversational AI to eliminate repetitive
                tasks. Analyze vague requirements, generate edge cases
                instantly, and synthesize weekly performance summaries without
                breaking a sweat.
              </p>
              <ul className="space-y-4">
                {[
                  "AI Test Case & Data Generator",
                  "AI Coverage Gap Analysis",
                  "Duplicate Checker & Natural Language Search",
                  "Weekly Performance Summaries",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-slate-300"
                  >
                    <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4">
              {[
                { icon: <BrainCircuit />, title: "Requirement Analysis" },
                { icon: <Bot />, title: "Test Case Generation" },
                { icon: <Bug />, title: "Defect Classification" },
                { icon: <Zap />, title: "Risk Prediction" },
              ].map((card, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 shadow-[0_0_30px_rgba(79,70,229,0.1)] relative overflow-hidden group hover:border-indigo-500/50 transition-colors"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/20 blur-[30px] rounded-full group-hover:bg-indigo-500/40 transition-colors" />
                  <div className="text-indigo-400 mb-4">{card.icon}</div>
                  <h4 className="text-white font-medium">{card.title}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- QA WORKFLOW VISUALIZATION --- */}
      <section className="py-24 bg-[#0d0d0d] px-6 border-y border-white/5 overflow-x-auto">
        <div className="max-w-7xl mx-auto min-w-[800px]">
          <h2 className="text-center text-2xl font-bold text-white mb-12">
            The AI-Assisted Workflow
          </h2>
          <div className="flex items-center justify-between relative">
            {/* Connecting line */}
            <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-y-1/2 z-0" />

            {[
              "Requirements",
              "AI Analysis",
              "Test Creation",
              "Execution",
              "Reporting",
              "Release",
            ].map((step, i) => (
              <div
                key={i}
                className="relative z-10 flex flex-col items-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-[#1a1a1a] border border-white/20 flex items-center justify-center text-white shadow-xl">
                  {i + 1}
                </div>
                <span className="text-sm font-medium text-slate-400">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- ANALYTICS & DASHBOARD SHOWCASE --- */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">
              Enterprise-Grade Visibility
            </h2>
            <p className="text-slate-400">
              Dedicated PMO views, weekly progress tracking, and individual
              performance metrics.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "Sprint Quality Score", value: "98%", trend: "+2.4%" },
              { label: "Executed Tests", value: "1,248", trend: "+12%" },
              { label: "Automation Coverage", value: "64%", trend: "+5%" },
              { label: "Defect Density", value: "1.2", trend: "-0.4%" },
            ].map((stat, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-white/5 border border-white/10"
              >
                <p className="text-sm text-slate-400 mb-2">{stat.label}</p>
                <div className="flex items-baseline gap-3">
                  <h4 className="text-3xl font-bold text-white">
                    {stat.value}
                  </h4>
                  <span
                    className={`text-xs font-medium ${stat.trend.startsWith("+") ? "text-green-400" : "text-blue-400"}`}
                  >
                    {stat.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- WHY QA PULSE (COMPARISON) --- */}
      <section className="py-24 bg-gradient-to-b from-[#0a0a0a] to-[#0d0d0d] px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-white mb-16">
            Traditional vs. QA Pulse
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Traditional */}
            <div className="p-8 rounded-2xl bg-red-950/10 border border-red-900/30">
              <h3 className="text-xl font-semibold text-red-400 mb-6 flex items-center gap-2">
                <XCircle className="w-5 h-5" /> Traditional QA
              </h3>
              <ul className="space-y-4">
                {[
                  "Manual, repetitive test creation",
                  "Disconnected tools and scattered data",
                  "Slow reporting requiring meetings",
                  "Limited PMO visibility",
                  "Hard to identify test coverage gaps",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-slate-400"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/50" />{" "}
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* QA Pulse */}
            <div className="p-8 rounded-2xl bg-blue-900/10 border border-blue-500/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[40px] pointer-events-none" />
              <h3 className="text-xl font-semibold text-blue-400 mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> QA Pulse
              </h3>
              <ul className="space-y-4">
                {[
                  "AI-assisted rapid test generation",
                  "Unified platform with Redmine sync",
                  "Real-time PMO & Admin dashboards",
                  "Intelligent recommendations & coverage",
                  "Shared team activity calendars",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-slate-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{" "}
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- CALL TO ACTION --- */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0d0d] to-[#050505] z-0" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-[100%] blur-[100px] pointer-events-none z-0" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Transform Your QA Process Today
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Empower your engineering teams with intelligent test management,
            automated insights, and enterprise-grade analytics.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleLoginClick}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-full transition-colors shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            >
              Start Testing Now
            </button>
            <button className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-full hover:bg-white/10 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="border-t border-white/10 bg-[#050505] pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-blue-500" />
              <span className="text-xl font-bold text-white tracking-tight">
                QA Pulse
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Smarter QA. Faster Releases. Powered by AI.
            </p>
            <p className="text-xs text-slate-600">v1.0.0-MVP</p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  AI Intelligence Hub
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  PMO Dashboard
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Redmine Integration
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  API Reference
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Release Notes
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Community
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  Contact Admin
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-400 transition-colors">
                  System Status
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-slate-600">
          <p>
            © {new Date().getFullYear()} QA Pulse Internal Operations. All
            rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Main2;
