import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
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
  AlertCircle,
  Sparkles,
  Activity,
  CheckCircle,
} from "lucide-react";

// 1. Import your downloaded animated icons from itshover.com here
import { AnimatedQALogo } from "@/components/icons/animated";

const Main2: React.FC = () => {
  const [, setLocation] = useLocation();
  const [activeAiStep, setActiveAiStep] = useState(0);

  const handleLoginClick = () => {
    // Navigate to the login route configured in App.tsx
    setLocation("/login");
  };

  // Simulate AI workflow steps looping in the dashboard mockup
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAiStep((prev) => (prev + 1) % 4);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

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

  const aiWorkflowSteps = [
    {
      text: "Analyzing Requirement REQ-1042...",
      icon: <BrainCircuit className="w-4 h-4 text-indigo-500" />,
    },
    {
      text: "Generating Edge Cases...",
      icon: <Sparkles className="w-4 h-4 text-amber-500" />,
    },
    {
      text: "Writing 5 Test Cases...",
      icon: <TestTube className="w-4 h-4 text-blue-500" />,
    },
    {
      text: "Saved to Repository",
      icon: <CheckCircle className="w-4 h-4 text-emerald-500" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
              <AnimatedQALogo className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg md:text-xl font-bold text-slate-900 tracking-tight truncate">
              QA Pulse
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={handleLoginClick}
              className="px-4 py-2 text-sm font-medium text-white rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-28 pb-16 md:pt-32 md:pb-20 px-4 sm:px-6 relative overflow-hidden">
        {/* Soft background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[800px] md:h-[800px] bg-blue-400/10 rounded-full blur-[80px] md:blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={fadeIn}>
            <span className="inline-block py-1 px-3 rounded-full bg-blue-50 border border-blue-200 text-xs sm:text-sm font-medium text-blue-600 mb-6 shadow-sm">
              Introducing AI Intelligence Hub
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-6 md:mb-8 leading-tight text-slate-900">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center">
                Smarter QA, Better Releases. <br className="hidden sm:block" />
              </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center">
                Powered by AI.
              </span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-3xl mx-auto mb-8 md:mb-10 leading-relaxed px-2">
              Transform your daily workflow with the premier internal web-based
              QA management platform. Centralize requirement intake and automate
              test case creation.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleLoginClick}
                className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-semibold rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
              >
                Get Started <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          </motion.div>

          {/* Hero Mockup (Live Dashboard Render) */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-12 md:mt-16 mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl overflow-hidden min-h-[550px] sm:min-h-[500px] md:aspect-video relative flex items-center justify-center"
          >
            {/* Background texture */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] z-0"></div>

            {/* Inner Dashboard Layout */}
            <div className="absolute inset-2 sm:inset-4 bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex z-10 flex-row text-left">
              {/* Sidebar */}
              <div className="w-14 md:w-48 shrink-0 bg-slate-50 border-r border-slate-100 p-2 md:p-4 flex flex-col gap-2">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-6 mt-2 md:mt-0 md:px-2">
                  <AnimatedQALogo className="w-5 h-5 shrink-0" />
                  <span className="font-bold text-slate-800 hidden md:block">
                    QA Pulse
                  </span>
                </div>
                {[
                  {
                    icon: <LayoutDashboard className="w-5 h-5 md:w-4 md:h-4" />,
                    label: "Dashboard",
                    active: true,
                  },
                  {
                    icon: <ListChecks className="w-5 h-5 md:w-4 md:h-4" />,
                    label: "Requirements",
                    active: false,
                  },
                  {
                    icon: <TestTube className="w-5 h-5 md:w-4 md:h-4" />,
                    label: "Test Cases",
                    active: false,
                  },
                  {
                    icon: <BrainCircuit className="w-5 h-5 md:w-4 md:h-4" />,
                    label: "AI Hub",
                    active: false,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-center md:justify-start gap-3 p-2 md:px-3 md:py-2 rounded-md text-sm font-medium transition-colors ${
                      item.active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {item.icon}
                    <span className="hidden md:block">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Main Content Area */}
              <div className="flex-1 p-3 sm:p-4 md:p-6 flex flex-col gap-4 overflow-y-auto bg-white">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0 pb-2 border-b border-slate-100">
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-800">
                      Welcome to QA Pulse,
                    </h2>
                    <p className="text-[10px] md:text-xs text-slate-500">
                      Project Alpha - Release 1.2
                    </p>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 self-end sm:self-auto">
                    <span className="text-[10px] md:text-xs font-medium text-slate-500 hidden sm:block">
                      Last updated: Just now
                    </span>
                    <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center">
                      <span className="text-[10px] md:text-xs font-bold text-slate-600">
                        QA
                      </span>
                    </div>
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100"
                  >
                    <div className="flex justify-between items-start mb-1 md:mb-2">
                      <p className="text-[10px] md:text-xs text-slate-500 font-medium">
                        Test Execution
                      </p>
                      <Activity className="w-3 h-3 md:w-4 md:h-4 text-blue-500" />
                    </div>
                    <h3 className="text-lg md:text-2xl font-bold text-slate-800">
                      84%
                    </h3>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "84%" }}
                        transition={{ duration: 1.5, delay: 0.8 }}
                        className="bg-blue-500 h-full rounded-full"
                      />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100"
                  >
                    <div className="flex justify-between items-start mb-1 md:mb-2">
                      <p className="text-[10px] md:text-xs text-slate-500 font-medium">
                        Active Blockers
                      </p>
                      <AlertCircle className="w-3 h-3 md:w-4 md:h-4 text-red-500" />
                    </div>
                    <h3 className="text-lg md:text-2xl font-bold text-slate-800">
                      2
                    </h3>
                    <p className="text-[10px] md:text-xs text-red-500 font-medium mt-1 tracking-tight">
                      Requires attention
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-indigo-50 p-3 md:p-4 rounded-lg border border-indigo-100 relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-12 h-12 md:w-16 md:h-16 bg-indigo-200/50 rounded-bl-full -z-0" />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-1 md:mb-2">
                        <p className="text-[10px] md:text-xs text-indigo-700 font-medium">
                          AI Insights
                        </p>
                        <Sparkles className="w-3 h-3 md:w-4 md:h-4 text-indigo-500" />
                      </div>
                      <h3 className="text-lg md:text-2xl font-bold text-indigo-900">
                        12
                      </h3>
                      <p className="text-[10px] md:text-xs text-indigo-600 font-medium mt-1 tracking-tight">
                        Suggestions generated
                      </p>
                    </div>
                  </motion.div>
                </div>

                {/* Lower Section: Chart & AI Feed */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 pb-4 md:pb-0">
                  {/* Mock Chart Area */}
                  <div className="lg:col-span-2 bg-white border border-slate-100 rounded-lg p-3 md:p-4 flex flex-col h-40 md:h-full min-h-[160px]">
                    <h4 className="text-xs md:text-sm font-bold text-slate-700 mb-2 md:mb-4">
                      Weekly Execution Trend
                    </h4>
                    <div className="flex-1 flex items-end gap-1 sm:gap-2 md:gap-4 pb-1 md:pb-2">
                      {[40, 70, 45, 90, 65, 85, 100].map((height, i) => (
                        <div
                          key={i}
                          className="flex-1 flex flex-col justify-end items-center group"
                        >
                          <motion.div
                            initial={{ height: "0%" }}
                            animate={{ height: `${height}%` }}
                            transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                            className="w-full bg-blue-100 group-hover:bg-blue-200 rounded-t-sm relative transition-colors"
                          >
                            <motion.div
                              initial={{ height: "0%" }}
                              animate={{ height: `${height * 0.8}%` }}
                              transition={{ duration: 1, delay: 0.8 + i * 0.1 }}
                              className="absolute bottom-0 w-full bg-blue-500 rounded-t-sm"
                            />
                          </motion.div>
                          <span className="text-[8px] md:text-[10px] text-slate-400 mt-1 md:mt-2">
                            D{i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Live Feed */}
                  <div className="bg-slate-900 rounded-lg p-3 md:p-4 flex flex-col h-48 md:h-full overflow-hidden relative shadow-inner">
                    <div className="flex items-center gap-2 mb-2 md:mb-4">
                      <BrainCircuit className="w-3 h-3 md:w-4 md:h-4 text-indigo-400" />
                      <h4 className="text-xs md:text-sm font-bold text-white">
                        AI Intelligence Hub
                      </h4>
                    </div>

                    <div className="flex-1 relative overflow-y-auto scrollbar-hide">
                      <AnimatePresence mode="popLayout">
                        {aiWorkflowSteps
                          .slice(0, activeAiStep + 1)
                          .map((step, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, x: -20, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ duration: 0.3 }}
                              className="bg-white/10 backdrop-blur-md rounded border border-white/10 p-1.5 md:p-2 mb-2 flex items-center gap-2 md:gap-3"
                            >
                              <div className="p-1 md:p-1.5 bg-white/10 rounded-md shrink-0">
                                {React.cloneElement(step.icon, {
                                  className:
                                    "w-3 h-3 md:w-4 md:h-4 " +
                                    step.icon.props.className,
                                })}
                              </div>
                              <span className="text-[10px] md:text-xs font-medium text-slate-200 truncate">
                                {step.text}
                              </span>
                            </motion.div>
                          ))}
                      </AnimatePresence>

                      {/* Typing indicator */}
                      <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="flex items-center gap-1 mt-2 px-1 md:px-2"
                      >
                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-indigo-400 rounded-full" />
                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-indigo-400 rounded-full" />
                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-indigo-400 rounded-full" />
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- PLATFORM OVERVIEW SECTION --- */}
      <section className="py-16 md:py-24 bg-white border-t border-slate-200 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">
              A Unified QA Ecosystem
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Everything you need to orchestrate quality assurance, from
              requirements to release.
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
                className="p-5 md:p-6 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-default"
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
      <section className="py-16 md:py-24 px-4 sm:px-6 relative bg-slate-50">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-blue-200/40 rounded-full blur-[80px] md:blur-[100px] pointer-events-none" />
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-10 md:gap-12 items-center">
            <div className="flex-1 w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-black to-blue-600 bg-clip-text text-transparent">
                Meet your new
                <br />
                AI Intelligence Hub
              </h2>
              <p className="text-base md:text-lg text-slate-600 mb-6 md:mb-8 leading-relaxed">
                QA Pulse uses advanced conversational AI to eliminate repetitive
                tasks. Analyze vague requirements, generate edge cases
                instantly, and synthesize weekly performance summaries without
                breaking a sweat.
              </p>
              <ul className="space-y-3 md:space-y-4">
                {[
                  "AI Test Case & Data Generator",
                  "AI Coverage Gap Analysis",
                  "Duplicate Checker & Natural Language Search",
                  "Weekly Performance Summaries",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start md:items-center gap-3 text-sm md:text-base text-slate-700 font-medium"
                  >
                    <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5 md:mt-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { icon: <BrainCircuit />, title: "Requirement Analysis" },
                { icon: <Bot />, title: "Test Case Generation" },
                { icon: <Bug />, title: "Defect Classification" },
                { icon: <Zap />, title: "Risk Prediction" },
              ].map((card, i) => (
                <div
                  key={i}
                  className="p-5 md:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-400 hover:shadow-md transition-all flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-blue-100 blur-[30px] rounded-full group-hover:bg-blue-200 transition-colors" />
                  <div className="text-blue-600 sm:mb-4 shrink-0">
                    {card.icon}
                  </div>
                  <h4 className="text-slate-800 font-medium">{card.title}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- QA WORKFLOW VISUALIZATION --- */}
      <section className="py-16 md:py-24 bg-white px-4 sm:px-6 border-y border-slate-200">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-slate-900 mb-8 md:mb-12">
            The AI-Assisted Workflow
          </h2>
          <div className="overflow-x-auto pb-4 scrollbar-hide">
            <div className="min-w-[600px] md:min-w-[800px] flex items-center justify-between relative px-2">
              {/* Connecting line */}
              <div className="absolute top-1/2 left-4 right-4 h-[2px] bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 -translate-y-1/2 z-0" />

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
                  className="relative z-10 flex flex-col items-center gap-2 md:gap-3"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 shadow-sm font-semibold text-sm md:text-base">
                    {i + 1}
                  </div>
                  <span className="text-xs md:text-sm font-medium text-slate-600 text-center w-20">
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- ANALYTICS & DASHBOARD SHOWCASE --- */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3 md:mb-4">
              Enterprise-Grade Visibility
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Dedicated Higher Manager views, weekly progress tracking, and
              individual performance metrics.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {[
              { label: "Sprint Quality Score", value: "98%", trend: "+2.4%" },
              { label: "Executed Tests", value: "1,248", trend: "+12%" },
              { label: "Automation Coverage", value: "64%", trend: "+5%" },
              { label: "Defect Density", value: "1.2", trend: "-0.4%" },
            ].map((stat, i) => (
              <div
                key={i}
                className="p-5 md:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between"
              >
                <p className="text-xs md:text-sm text-slate-500 mb-2 font-medium">
                  {stat.label}
                </p>
                <div className="flex items-baseline justify-between sm:justify-start sm:gap-3">
                  <h4 className="text-2xl md:text-3xl font-bold text-slate-900">
                    {stat.value}
                  </h4>
                  <span
                    className={`text-xs font-bold ${
                      stat.trend.startsWith("+")
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
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
      <section className="py-16 md:py-24 bg-gradient-to-b from-white to-slate-100 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-900 mb-10 md:mb-16">
            Traditional vs. QA Pulse
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* Traditional */}
            <div className="p-6 md:p-8 rounded-2xl bg-red-50/50 border border-red-200">
              <h3 className="text-lg md:text-xl font-bold text-red-700 mb-5 md:mb-6 flex items-center gap-2">
                <XCircle className="w-5 h-5 shrink-0" /> Traditional QA
              </h3>
              <ul className="space-y-3 md:space-y-4">
                {[
                  "Manual, repetitive test creation",
                  "Disconnected tools and scattered data",
                  "Slow reporting requiring meetings",
                  "Limited PMO visibility",
                  "Hard to identify test coverage gaps",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start md:items-center gap-3 text-sm md:text-base text-slate-700"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5 md:mt-0" />{" "}
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* QA Pulse */}
            <div className="p-6 md:p-8 rounded-2xl bg-blue-50/50 border border-blue-200 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-blue-200/30 blur-[40px] pointer-events-none" />
              <h3 className="text-lg md:text-xl font-bold text-blue-700 mb-5 md:mb-6 flex items-center gap-2 relative z-10">
                <CheckCircle2 className="w-5 h-5 shrink-0" /> QA Pulse
              </h3>
              <ul className="space-y-3 md:space-y-4 relative z-10">
                {[
                  "AI-assisted rapid test generation",
                  "Unified platform with Redmine sync",
                  "Real-time PMO & Admin dashboards",
                  "Intelligent recommendations & coverage",
                  "Shared team activity calendars",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start md:items-center gap-3 text-sm md:text-base text-slate-800 font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1.5 md:mt-0" />{" "}
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- CALL TO ACTION --- */}
      <section className="py-20 md:py-32 px-4 sm:px-6 relative overflow-hidden bg-slate-50">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-100 to-white z-0" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[800px] md:h-[400px] bg-blue-400/20 rounded-[100%] blur-[80px] md:blur-[100px] pointer-events-none z-0" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-4 md:mb-6 leading-tight">
            Transform Your QA Process Today
          </h2>
          <p className="text-base md:text-xl text-slate-600 mb-8 md:mb-10 max-w-2xl mx-auto">
            Empower your engineering teams with intelligent test management,
            automated insights, and enterprise-grade analytics.
          </p>
          <div className="flex items-center justify-center">
            <button
              onClick={handleLoginClick}
              className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-semibold rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            >
              Start Testing Now
            </button>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="border-t border-slate-200 bg-white pt-12 md:pt-16 pb-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-10 md:mb-12">
          <div className="col-span-1 sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <AnimatedQALogo className="w-5 h-5" />
              <span className="text-xl font-bold text-slate-900 tracking-tight">
                QA Pulse
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-6 max-w-xs">
              Smarter QA, Better Releases. Powered by AI.
            </p>
            <p className="text-xs text-slate-400 font-medium">v1.0.0-MVP</p>
          </div>

          <div>
            <h4 className="text-slate-900 font-semibold mb-3 md:mb-4">
              Product
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  AI Intelligence Hub
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  PMO Dashboard
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Redmine Integration
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-semibold mb-3 md:mb-4">
              Resources
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  API Reference
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Release Notes
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Community
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-semibold mb-3 md:mb-4">
              Support
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  Contact Admin
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-blue-600 transition-colors">
                  System Status
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-slate-200 pt-6 md:pt-8 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 text-xs text-slate-500 font-medium text-center md:text-left">
          <p>
            © {new Date().getFullYear()} QA Pulse Internal Operations. All
            rights reserved.
          </p>
          <div className="flex space-x-4 md:space-x-6">
            <a href="#" className="hover:text-slate-900 transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-slate-900 transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Main2;
