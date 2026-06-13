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
import {
  AnimatedQALogo,
} from "@/components/icons/animated";

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
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans selection:bg-blue-500/30">
      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm">
              <AnimatedQALogo className="w-5 h-5"/>
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">
              QA Pulse
            </span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={handleLoginClick}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden">
        {/* Soft background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-400/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={fadeIn}>
            <span className="inline-block py-1 px-3 rounded-full bg-blue-50 border border-blue-200 text-sm font-medium text-blue-600 mb-6 shadow-sm">
              Introducing AI Intelligence Hub
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight bg-gradient-to-r from-slate-950 via-slate-900 to-blue-600 bg-clip-text text-transparent">
              Smarter QA. Better Releases. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm">
                Powered by AI.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto mb-10 leading-relaxed">
              Transform your daily workflow with the premier internal web-based
              QA management platform. Centralize requirement intake and automate
              test case creation.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleLoginClick}
                className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
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
            className="mt-16 mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl overflow-hidden aspect-video relative flex items-center justify-center"
          >
            {/* Background texture */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] z-0"></div>

            {/* Inner Dashboard Layout */}
            <div className="absolute inset-4 bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden flex z-10 flex-row text-left">
              {/* Sidebar */}
              <div className="w-16 md:w-48 bg-slate-50 border-r border-slate-100 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-6 px-2">
                  <AnimatedQALogo className="w-4 h-4"/>
                  <span className="font-bold text-slate-800 hidden md:block">
                    QA Pulse
                  </span>
                </div>
                {[
                  {
                    icon: <LayoutDashboard className="w-4 h-4" />,
                    label: "Dashboard",
                    active: true,
                  },
                  {
                    icon: <ListChecks className="w-4 h-4" />,
                    label: "Requirements",
                    active: false,
                  },
                  {
                    icon: <TestTube className="w-4 h-4" />,
                    label: "Test Cases",
                    active: false,
                  },
                  {
                    icon: <BrainCircuit className="w-4 h-4" />,
                    label: "AI Hub",
                    active: false,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${item.active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {item.icon}
                    <span className="hidden md:block">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Main Content Area */}
              <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-hidden bg-white">
                {/* Header */}
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      Welcome to QA Pulse,
                    </h2>
                    <p className="text-xs text-slate-500">
                      Project Alpha - Release 1.2
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500 hidden sm:block">
                      Last updated: Just now
                    </span>
                    <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center">
                      <span className="text-xs font-bold text-slate-600">
                        QA
                      </span>
                    </div>
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-3 gap-3 md:gap-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-xs text-slate-500 font-medium">
                        Test Execution
                      </p>
                      <Activity className="w-4 h-4 text-blue-500" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-slate-800">
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
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-xs text-slate-500 font-medium">
                        Active Blockers
                      </p>
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-slate-800">
                      2
                    </h3>
                    <p className="text-xs text-red-500 font-medium mt-1 tracking-tight">
                      Requires attention
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-indigo-50 p-3 md:p-4 rounded-lg border border-indigo-100 relative overflow-hidden"
                  >
                    <div className="absolute right-0 top-0 w-16 h-16 bg-indigo-200/50 rounded-bl-full -z-0" />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-xs text-indigo-700 font-medium">
                          AI Insights
                        </p>
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold text-indigo-900">
                        12
                      </h3>
                      <p className="text-xs text-indigo-600 font-medium mt-1 tracking-tight">
                        Suggestions generated
                      </p>
                    </div>
                  </motion.div>
                </div>

                {/* Lower Section: Chart & AI Feed */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
                  {/* Mock Chart Area */}
                  <div className="md:col-span-2 bg-white border border-slate-100 rounded-lg p-4 flex flex-col h-full">
                    <h4 className="text-sm font-bold text-slate-700 mb-4">
                      Weekly Execution Trend
                    </h4>
                    <div className="flex-1 flex items-end gap-2 md:gap-4 pb-2">
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
                          <span className="text-[10px] text-slate-400 mt-2">
                            D{i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Live Feed */}
                  <div className="bg-slate-900 rounded-lg p-4 flex flex-col h-full overflow-hidden relative shadow-inner hidden md:flex">
                    <div className="flex items-center gap-2 mb-4">
                      <BrainCircuit className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-sm font-bold text-white">
                        AI Intelligence Hub
                      </h4>
                    </div>

                    <div className="flex-1 relative">
                      <AnimatePresence mode="popLayout">
                        {aiWorkflowSteps
                          .slice(0, activeAiStep + 1)
                          .map((step, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, x: -20, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ duration: 0.3 }}
                              className="bg-white/10 backdrop-blur-md rounded border border-white/10 p-2 mb-2 flex items-center gap-3"
                            >
                              <div className="p-1.5 bg-white/10 rounded-md">
                                {step.icon}
                              </div>
                              <span className="text-xs font-medium text-slate-200">
                                {step.text}
                              </span>
                            </motion.div>
                          ))}
                      </AnimatePresence>

                      {/* Typing indicator */}
                      <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="flex items-center gap-1 mt-2 px-2"
                      >
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
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
      <section className="py-24 bg-white border-t border-slate-200 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              A Unified QA Ecosystem
            </h2>
            <p className="text-slate-600">
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
                className="p-6 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-default"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* --- AI-POWERED FEATURES SECTION --- */}
      <section className="py-24 px-6 relative bg-slate-50">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-200/40 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Meet your new{" "}
                <span className="text-indigo-600">AI Intelligence Hub</span>
              </h2>
              <p className="text-slate-600 text-lg mb-8 leading-relaxed">
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
                    className="flex items-center gap-3 text-slate-700 font-medium"
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
                  className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm relative overflow-hidden group hover:border-indigo-400 hover:shadow-md transition-all"
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-100 blur-[30px] rounded-full group-hover:bg-indigo-200 transition-colors" />
                  <div className="text-indigo-600 mb-4">{card.icon}</div>
                  <h4 className="text-slate-800 font-medium">{card.title}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- QA WORKFLOW VISUALIZATION --- */}
      <section className="py-24 bg-white px-6 border-y border-slate-200 overflow-x-auto">
        <div className="max-w-7xl mx-auto min-w-[800px]">
          <h2 className="text-center text-2xl font-bold text-slate-900 mb-12">
            The AI-Assisted Workflow
          </h2>
          <div className="flex items-center justify-between relative">
            {/* Connecting line */}
            <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-slate-300 to-transparent -translate-y-1/2 z-0" />

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
                <div className="w-12 h-12 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 shadow-sm font-semibold">
                  {i + 1}
                </div>
                <span className="text-sm font-medium text-slate-600">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- ANALYTICS & DASHBOARD SHOWCASE --- */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Enterprise-Grade Visibility
            </h2>
            <p className="text-slate-600">
              Dedicated Higher Manager views, weekly progress tracking, and individual
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
                className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm"
              >
                <p className="text-sm text-slate-500 mb-2 font-medium">
                  {stat.label}
                </p>
                <div className="flex items-baseline gap-3">
                  <h4 className="text-3xl font-bold text-slate-900">
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
      <section className="py-24 bg-gradient-to-b from-white to-slate-100 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">
            Traditional vs. QA Pulse
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Traditional */}
            <div className="p-8 rounded-2xl bg-red-50/50 border border-red-200">
              <h3 className="text-xl font-bold text-red-700 mb-6 flex items-center gap-2">
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
                    className="flex items-center gap-3 text-slate-700"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{" "}
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* QA Pulse */}
            <div className="p-8 rounded-2xl bg-blue-50/50 border border-blue-200 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/30 blur-[40px] pointer-events-none" />
              <h3 className="text-xl font-bold text-blue-700 mb-6 flex items-center gap-2">
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
                    className="flex items-center gap-3 text-slate-800 font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />{" "}
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --- CALL TO ACTION --- */}
      <section className="py-32 px-6 relative overflow-hidden bg-slate-50">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-100 to-white z-0" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-400/20 rounded-[100%] blur-[100px] pointer-events-none z-0" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Transform Your QA Process Today
          </h2>
          <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
            Empower your engineering teams with intelligent test management,
            automated insights, and enterprise-grade analytics.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleLoginClick}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-600 flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            >
              Start Testing Now
            </button>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="border-t border-slate-200 bg-white pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <AnimatedQALogo className="w-5 h-5" />
              <span className="text-xl font-bold text-slate-900 tracking-tight">
                QA Pulse
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Smarter QA. Better Releases. Powered by AI.
            </p>
            <p className="text-xs text-slate-400 font-medium">v1.0.0-MVP</p>
          </div>

          <div>
            <h4 className="text-slate-900 font-semibold mb-4">Product</h4>
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
            <h4 className="text-slate-900 font-semibold mb-4">Resources</h4>
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
            <h4 className="text-slate-900 font-semibold mb-4">Support</h4>
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

        <div className="max-w-7xl mx-auto border-t border-slate-200 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 font-medium">
          <p>
            © {new Date().getFullYear()} QA Pulse Internal Operations. All
            rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
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
