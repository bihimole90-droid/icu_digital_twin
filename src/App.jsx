import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Network,
  RefreshCw,
  Search,
  ShieldPlus,
  Sparkles,
  Stethoscope,
  TerminalSquare,
  GitCompare,
  FileSearch,
  Eye,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  getNetwork,
  getPatients,
  getRecommendation,
  getStats,
  runSimulation as triggerSimulation,
} from "./api/api";

const NAV_ITEMS = [
  { key: "overview", label: "System Core", icon: LayoutDashboard },
  { key: "simulation", label: "Simulation", icon: Sparkles },
  { key: "recommendations", label: "Protocol Recs", icon: ShieldPlus },
  { key: "compare", label: "Simulation Delta", icon: GitCompare },
  { key: "network", label: "Outbreak Network", icon: Network },
];

const STATUS_COLORS = {
  CRITICAL: {
    badge: "bg-neon-pink/10 text-neon-pink ring-neon-pink/50",
    accent: "from-[#fca5a5] to-[#dc2626]",
    border: "border-neon-pink/30",
    glow: "shadow-[0_0_15px_rgba(255,0,102,0.15)] hover:shadow-[0_0_30px_rgba(255,0,102,0.4)]",
    text: "text-neon-pink glow-text-pink"
  },
  MODERATE: {
    badge: "bg-neon-amber/10 text-neon-amber ring-neon-amber/50",
    accent: "from-[#fbbf24] to-[#fbbf24]",
    border: "border-neon-amber/30",
    glow: "shadow-sm hover:shadow-[0_0_30px_rgba(255,176,0,0.4)]",
    text: "text-neon-amber glow-text-amber"
  },
  STABLE: {
    badge: "bg-neon-cyan/10 text-neon-cyan ring-neon-cyan/50",
    accent: "from-[#38bdf8] to-[#0284c7]",
    border: "border-neon-cyan/30",
    glow: "shadow-[0_0_15px_rgba(0,240,255,0.15)] hover:shadow-[0_0_30px_rgba(0,240,255,0.4)]",
    text: "text-neon-cyan glow-text-cyan"
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

function App() {
  const [started, setStarted] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [livePatients, setLivePatients] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  const [liveNetworkData, setLiveNetworkData] = useState(null);
  const [simulationHistory, setSimulationHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sitrepLog, setSitrepLog] = useState(["[SYSTEM] Matrix initialized. Awaiting simulation cycles."]);

  const patients = historyIndex >= 0 && simulationHistory[historyIndex] ? simulationHistory[historyIndex].patients : livePatients;
  const stats = historyIndex >= 0 && simulationHistory[historyIndex] ? simulationHistory[historyIndex].stats : liveStats;
  const networkData = historyIndex >= 0 && simulationHistory[historyIndex] ? simulationHistory[historyIndex].networkData : liveNetworkData;
  const isHistorical = historyIndex >= 0;

  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedPatientRecommendation, setSelectedPatientRecommendation] = useState(null);
  const [simulationMessage, setSimulationMessage] = useState("");
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [selectedDossierPatient, setSelectedDossierPatient] = useState(null);
  const [loading, setLoading] = useState({
    initial: false,
    simulation: false,
    recommendation: false,
  });
  const [error, setError] = useState("");

  const handleManualOverride = (id) => {
    if (isHistorical) return; 
    setLivePatients(prev => prev.map(p => 
      p.id === id ? { ...p, status: 'STABLE', infected: 0, override: true } : p
    ));
    setSitrepLog(prev => [`[OVERRIDE] Entity ${id} forcefully stabilized via Triage Override protocol.`, ...prev].slice(0, 50));
    setSelectedDossierPatient(prev => prev && prev.id === id ? { ...prev, status: 'STABLE', infected: 0 } : prev);
  };

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );

  useEffect(() => {
    if (!started) return;
    void loadDashboardData();
  }, [started]);

  useEffect(() => {
    if (!selectedPatientId || !started) return;
    if (activeView !== "recommendations" && activeView !== "retry") return;
    void loadRecommendation(selectedPatientId);
  }, [activeView, selectedPatientId, started]);

  useEffect(() => {
    if (!simulationMessage) return;
    const timer = window.setTimeout(() => setSimulationMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [simulationMessage]);

  async function loadDashboardData() {
    setLoading((current) => ({ ...current, initial: true }));
    setError("");

    try {
      const [patientPayload, statsPayload] = await Promise.all([getPatients(), getStats()]);
      const patientList = normalizePatients(patientPayload);

      setLivePatients(patientList);
      setLiveStats(statsPayload ?? null);
      setSelectedPatientId((current) => {
        if (current && patientList.some((pat) => pat.id === current)) return current;
        return patientList[0]?.id ?? null;
      });

      let netGraph = null;
      try {
        const graph = await getNetwork();
        netGraph = normalizeNetwork(graph, patientList);
        setLiveNetworkData(netGraph);
      } catch {
        netGraph = buildFallbackNetwork(patientList);
        setLiveNetworkData(netGraph);
      }
      return { patientList, statsPayload, netGraph };
    } catch {
      setError("Unable to connect to the ICU backend. Check that VITE_API_BASE points to the deployed API.");
    } finally {
      setLoading((current) => ({ ...current, initial: false }));
    }
  }

  async function runSimulation() {
    if (isHistorical) return;
    setBaselineSnapshot({ patients: [...livePatients], summary: { ...summary } });
    
    const historicalFrame = {
        patients: [...livePatients],
        stats: liveStats ? JSON.parse(JSON.stringify(liveStats)) : null,
        networkData: liveNetworkData ? JSON.parse(JSON.stringify(liveNetworkData)) : null,
        timestamp: new Date().toLocaleTimeString()
    };

    setLoading((current) => ({ ...current, simulation: true }));
    try {
      const result = await triggerSimulation();
      setSimulationMessage(result?.message ?? "Simulation step completed");
      
      const newData = await loadDashboardData();
      if (!newData) return;
      
      setSimulationHistory(prev => [...prev, historicalFrame]);
      
      const prevInfected = historicalFrame.patients.filter(p=>p.infected===1).length;
      const newInfectedCount = newData.patientList.filter(p=>p.infected===1).length;
      const infectedDelta = newInfectedCount - prevInfected;
      
      let msg = "";
      if (infectedDelta > 0) msg = `[ALERT] Contagion spread. ${infectedDelta} new infections detected.`;
      else if (infectedDelta < 0) msg = `[RECOVERY] Protocol effective. ${Math.abs(infectedDelta)} entities stabilized.`;
      else msg = `[STATUS] Containment holding at current baseline.`;
      
      setSitrepLog(prev => [msg, ...prev].slice(0, 50));

    } finally {
      setLoading((current) => ({ ...current, simulation: false }));
    }
  }

  async function loadRecommendation(patientId) {
    setLoading((current) => ({ ...current, recommendation: true }));
    try {
      const payload = await getRecommendation(patientId);
      setSelectedPatientRecommendation(payload);
    } catch {
      setSelectedPatientRecommendation(null);
    } finally {
      setLoading((current) => ({ ...current, recommendation: false }));
    }
  }

  const summary = useMemo(() => {
    const totalPatients = patients.length;
    const infectedCount = patients.filter((patient) => patient.infected === 1).length;
    const grouped = patients.reduce(
      (accumulator, patient) => {
        const key = patient.status ?? "UNKNOWN";
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
      },
      { CRITICAL: 0, MODERATE: 0, STABLE: 0 },
    );

    const total = stats?.total ?? totalPatients;
    const infected = stats?.infected ?? infectedCount;
    const critical = stats?.status_distribution?.CRITICAL ?? grouped.CRITICAL ?? 0;
    const moderate = stats?.status_distribution?.MODERATE ?? grouped.MODERATE ?? 0;
    const stable = stats?.status_distribution?.STABLE ?? grouped.STABLE ?? 0;

    return {
      totalPatients: total,
      infectedCount: infected,
      stableCount: stable,
      moderateCount: moderate,
      criticalCount: critical,
      infectionRate: total ? Math.round((infected / total) * 100) : 0,
      dominantStatus: [
        { label: "CRITICAL", value: critical },
        { label: "MODERATE", value: moderate },
        { label: "STABLE", value: stable },
      ].sort((left, right) => right.value - left.value)[0]?.label ?? "UNKNOWN",
    };
  }, [patients, stats]);

  const chartData = [
    { name: "Critical", value: summary.criticalCount, color: "#dc2626" },
    { name: "Moderate", value: summary.moderateCount, color: "#fbbf24" },
    { name: "Stable", value: summary.stableCount, color: "#0284c7" },
  ].filter((item) => item.value > 0);

  return (
    <div className="min-h-screen text-slate-800 bg-core-950 font-body relative">
      <AnimatePresence>
        {selectedDossierPatient && (
          <DossierModal
            key="dossier-modal"
            patient={selectedDossierPatient}
            onClose={() => setSelectedDossierPatient(null)}
            onManualOverride={handleManualOverride}
            isHistorical={isHistorical}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {!started ? (
          <LandingPage key="landing" onStart={() => setStarted(true)} />
        ) : (
          <DashboardShell
            key="dashboard"
            activeView={activeView}
            error={error}
            loading={loading}
            onRefresh={loadDashboardData}
            onSelectView={setActiveView}
            onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
            sidebarCollapsed={sidebarCollapsed}
            simulationMessage={simulationMessage}
            onManualOverride={handleManualOverride}
            sitrepLog={sitrepLog}
            simulationHistory={simulationHistory}
            historyIndex={historyIndex}
            setHistoryIndex={setHistoryIndex}
            isHistorical={isHistorical}
          >
            <AnimatePresence mode="wait">
              {activeView === "overview" && (
                <OverviewView
                  key="overview"
                  chartData={chartData}
                  patients={patients}
                  selectedPatientId={selectedPatientId}
                  summary={summary}
                  onPatientSelect={setSelectedPatientId}
                  onInspect={setSelectedDossierPatient}
                  sitrepLog={sitrepLog}
                />
              )}
              {activeView === "simulation" && (
                <SimulationView
                  key="sim"
                  loading={loading.simulation}
                  patients={patients}
                  summary={summary}
                  onPatientSelect={setSelectedPatientId}
                  onInspect={setSelectedDossierPatient}
                  onRunSimulation={runSimulation}
                />
              )}
              {activeView === "recommendations" && (
                <RecommendationView
                  key="rec"
                  loading={loading.recommendation}
                  patients={patients}
                  recommendation={selectedPatientRecommendation}
                  selectedPatient={selectedPatient}
                  selectedPatientId={selectedPatientId}
                  onPatientSelect={setSelectedPatientId}
                  onInspect={setSelectedDossierPatient}
                />
              )}
              {activeView === "compare" && (
                <ComparisonView key="compare" prev={baselineSnapshot} curr={{ patients, summary }} />
              )}
              {activeView === "network" && <NetworkView key="network" networkData={networkData} patients={patients} />}
            </AnimatePresence>
          </DashboardShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function LandingNav({ onStart }) {
  return (
    <motion.nav 
      initial={{ y: -100 }} animate={{ y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed top-0 inset-x-0 z-50 h-20 border-b border-white/10 bg-core-950/80 backdrop-blur-xl flex items-center px-6 lg:px-12"
    >
      <div className="flex items-center gap-2 max-w-[90rem] mx-auto w-full justify-between">
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-5 h-5 text-neon-cyan" />
          <span className="font-display font-bold text-lg tracking-widest text-white uppercase glow-text-cyan hidden sm:block">ICU DIGITAL TWIN</span>
          <span className="font-display font-bold text-lg tracking-widest text-white uppercase glow-text-cyan sm:hidden">ICU DT</span>
        </div>
        <div className="hidden lg:flex gap-8 font-tech text-[10px] sm:text-xs tracking-widest text-slate-300">
           <a href="#hero" className="hover:text-neon-cyan transition uppercase">Intake</a>
           <a href="#capabilities" className="hover:text-neon-cyan transition uppercase">Capabilities</a>
           <a href="#architecture" className="hover:text-neon-cyan transition uppercase">Architecture</a>
        </div>
        <div>
           <button onClick={onStart} className="rounded border border-neon-cyan/50 px-5 py-2 font-tech text-[10px] sm:text-xs uppercase tracking-widest text-neon-cyan shadow-[0_0_15px_rgba(0,240,255,0.1)] hover:bg-neon-cyan/10 transition cursor-pointer">Initialize Hub</button>
        </div>
      </div>
    </motion.nav>
  );
}

function FeatureDetailCard({ icon: Icon, title, desc, tone }) {
  const tborder = tone === 'pink' ? 'border-neon-pink/30 hover:border-neon-pink' : tone === 'amber' ? 'border-neon-amber/30 hover:border-neon-amber' : 'border-neon-cyan/30 hover:border-neon-cyan';
  const tshadow = tone === 'pink' ? 'shadow-neon-pink' : tone === 'amber' ? 'shadow-sm' : 'shadow-neon-cyan';
  const bgglow = tone === 'pink' ? 'bg-neon-pink/5' : tone === 'amber' ? 'bg-neon-amber/5' : 'bg-neon-cyan/5';
  const textClr = tone === 'pink' ? 'text-neon-pink glow-text-pink' : tone === 'amber' ? 'text-neon-amber glow-text-amber' : 'text-neon-cyan glow-text-cyan';
  return (
    <motion.div variants={fadeUp} className={`group flex flex-col rounded-2xl glass-panel p-8 border transition-all duration-300 ${tborder} hover:-translate-y-2`}>
       <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 border ${tborder} ${bgglow} ${tshadow}`}><Icon className={`w-6 h-6 ${textClr}`} /></div>
       <h3 className={`font-display text-2xl font-bold mb-4 uppercase tracking-wider ${textClr}`}>{title}</h3>
       <p className="font-tech text-sm leading-7 text-slate-300">{desc}</p>
    </motion.div>
  );
}

function LandingPage({ onStart }) {
  return (
    <div className="relative h-screen bg-core-950 text-slate-800 overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-thin">
      <LandingNav onStart={onStart} />
      
      <motion.div
        id="hero"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: "blur(20px)", scale: 1.05 }} transition={{ duration: 0.8 }}
        className="relative flex min-h-screen pt-20 z-10 pb-20 items-center border-b border-white/10"
      >
      <div className="grid-bg-container">
        <div className="grid-bg opacity-30" />
      </div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-neon-pink/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-24">
        <div className="grid min-h-[calc(100vh-8rem)] items-center gap-16 lg:grid-cols-2">

          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="relative max-w-2xl">
            <motion.div variants={fadeUp} className="inline-flex items-center rounded-full border border-neon-cyan/40 bg-neon-cyan/5 px-4 py-2 text-[11px] font-tech uppercase tracking-[0.3em] text-neon-cyan shadow-neon-cyan">
              <TerminalSquare className="w-3 h-3 mr-2" /> ICU Digital Twin Core
            </motion.div>
            <motion.h1 variants={fadeUp} className="mt-8 text-balance font-display text-5xl font-bold uppercase tracking-tight text-white sm:text-6xl lg:text-7xl glow-text-cyan">
              Sentinel: <br /><span className="text-neon-pink glow-text-pink">ICU Outbreak Monitor</span>
            </motion.h1>

            <motion.div variants={fadeUp} className="mt-8 max-w-xl rounded-[1.8rem] border border-neon-cyan/20 bg-core-900/60 p-8 backdrop-blur-xl shadow-glass">
              <p className="text-lg text-slate-400 font-tech">
                &gt; SYSTEM ONLINE. INITIATING TRACKING.
              </p>
              <ul className="mt-6 space-y-4 text-sm leading-7 text-slate-300 font-tech">
                <li className="flex gap-4">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-sm bg-neon-cyan animate-pulse-fast shadow-neon-cyan" />
                  <span>Live telemetry of patient states, SOFA scores, and vector propagation.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-sm bg-neon-pink shadow-neon-pink" />
                  <span>Protocol recommendation engine activated for tactical antibiotics.</span>
                </li>
                <li className="flex gap-4">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-sm bg-neon-amber shadow-neon-amber" />
                  <span>Simulated twin execution core to predict mutation and spread.</span>
                </li>
              </ul>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-6">
              <button
                className="group relative inline-flex items-center gap-3 rounded-none bg-neon-cyan/10 border border-neon-cyan px-8 py-4 text-sm font-tech font-bold uppercase tracking-widest text-neon-cyan transition-all duration-300 hover:bg-neon-cyan hover:text-core-900 shadow-neon-cyan"
                onClick={onStart}
                type="button"
              >
                Engage Core
                <ArrowRight className="h-5 w-5 transition duration-300 group-hover:translate-x-2" />
              </button>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
              <HeroMetric label="Network" value="Secure" color="cyan" />
              <HeroMetric label="Data Flow" value="Active" color="amber" />
              <HeroMetric label="Mode" value="Live" color="pink" />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
            className="hidden lg:flex justify-center items-center relative"
          >
            {/* Sci-Fi Decorative UI Ring */}
            <div className="absolute w-[32rem] h-[32rem] rounded-full border border-dashed border-neon-cyan/20 animate-[spin_40s_linear_infinite]" />
            <div className="absolute w-[24rem] h-[24rem] rounded-full border border-neon-pink/20 animate-[spin_30s_linear_infinite_reverse]" />

            <div className="glass-panel p-8 w-[28rem] rounded-2xl rotate-3 shadow-panel">
              <div className="flex justify-between items-center mb-6">
                <span className="font-tech text-neon-cyan uppercase text-xs tracking-widest">Active nodes</span>
                <span className="flex space-x-2">
                  <span className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse"></span>
                  <span className="w-2 h-2 rounded-full bg-neon-pink"></span>
                </span>
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="h-12 bg-core-900 rounded border border-core-600 flex items-center px-4 overflow-hidden relative">
                    <motion.div
                      className="absolute top-0 left-0 h-full bg-neon-cyan/10"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.random() * 60 + 30}%` }}
                      transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
                    />
                    <div className="font-tech text-xs text-slate-400 z-10 w-full flex justify-between">
                      <span>ENTITY_00{i + 1}</span>
                      <span className={i === 1 ? "text-neon-pink" : "text-neon-cyan"}>{i === 1 ? "CRITICAL" : "STABLE"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </motion.div>

      {/* Capabilities Section */}
      <div id="capabilities" className="relative w-full px-6 py-24 sm:px-10 lg:px-24 bg-core-950/90 backdrop-blur-md border-t border-white/10 z-10 text-center sm:text-left">
        <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="max-w-[80rem] mx-auto">
          <div className="mb-16 text-center">
             <h2 className="font-display text-4xl md:text-5xl font-bold uppercase tracking-widest text-white mb-4">Core System <span className="text-neon-cyan glow-text-cyan">Capabilities</span></h2>
             <p className="font-tech text-slate-300 max-w-2xl mx-auto text-sm leading-7">The platform unifies disparate biometric feeds into a singular vector map, applying deterministic simulation logic to identify patient risk.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureDetailCard icon={Activity} title="Predictive Sim" desc="Executes real-time digital twin steps utilizing the active baseline snapshot. Foresees pathogen mutation waves and patient severity spikes before they breach the ward." tone="cyan" />
            <FeatureDetailCard icon={Network} title="Neural Mapping" desc="Arranges entities into dense Sunflower Phyllotaxis visualisations, exposing the hidden transmission routes of nosocomial infections flawlessly." tone="pink" />
            <FeatureDetailCard icon={ShieldPlus} title="Protocol Engine" desc="Algorithmically calculates custom antibiotic and intervention payloads tailored to each subject based on detected pathogen profiles and SOFA quotients." tone="amber" />
          </div>
        </motion.div>
      </div>

      {/* Architecture Section */}
      <div id="architecture" className="relative w-full px-6 py-24 sm:px-10 lg:px-24 bg-[#010204] z-10">
        <div className="max-w-[80rem] mx-auto flex flex-col md:flex-row gap-16 items-center">
          <div className="md:w-1/2">
             <h2 className="font-display text-4xl font-bold uppercase tracking-widest text-white mb-6">Built for <span className="text-neon-amber glow-text-amber">Resilience</span></h2>
             <p className="font-tech text-slate-300 text-sm leading-8 mb-8">
               Engineered around robust state machines and dynamic API bridging that pipes JSON telemetry straight to the visual layer. Framer Motion governs DOM-physics, guaranteeing zero-latency animations even during high-density outbreak renders.
             </p>
             <button onClick={onStart} className="rounded bg-neon-amber/5 border border-neon-amber px-8 py-4 font-tech text-xs font-bold uppercase tracking-[0.2em] text-neon-amber hover:bg-neon-amber hover:text-core-950 shadow-sm hover:shadow-sm transition duration-300 cursor-pointer">
               Spin Up Cluster
             </button>
          </div>
          <div className="md:w-1/2 w-full glass-panel p-2 rounded-2xl border-neon-amber/10 opacity-80 pointer-events-none">
             <div className="h-72 bg-core-950 rounded-xl flex flex-col items-center justify-center border border-white/10 relative overflow-hidden p-6 text-center">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neon-amber/5 to-transparent blur-xl" />
                <div className="font-tech text-neon-cyan/50 text-[10px] tracking-widest mb-4 z-10">
                   SYSTEM_ARCHITECTURE_VISUAL<br/>-- [ NODE LOCKED ] --
                </div>
                <div className="flex gap-4 z-10">
                   <div className="w-12 h-12 border border-neon-cyan/20 rounded-full flex items-center justify-center bg-neon-cyan/5 text-neon-cyan"><Search className="w-4 h-4"/></div>
                   <div className="w-12 h-12 border border-neon-amber/20 rounded-full flex items-center justify-center bg-neon-amber/5 text-neon-amber"><Activity className="w-4 h-4"/></div>
                   <div className="w-12 h-12 border border-neon-pink/20 rounded-full flex items-center justify-center bg-neon-pink/5 text-neon-pink"><Network className="w-4 h-4"/></div>
                </div>
             </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-12 border-t border-white/10 bg-core-950/60 backdrop-blur flex flex-col items-center justify-center font-tech text-[10px] text-slate-400 tracking-widest uppercase text-center gap-4">
         <div className="flex items-center gap-2">
           <TerminalSquare className="w-4 h-4 text-slate-300" />
           <span>ICU Digital Twin &copy; 2026.</span>
         </div>
         <p>Data feeds verified. Vectors secured.</p>
      </footer>
    </div>
  );
}

function HeroMetric({ label, value, color }) {
  const colorMap = {
    cyan: "text-neon-cyan border-neon-cyan/30",
    pink: "text-neon-pink border-neon-pink/30",
    amber: "text-neon-amber border-neon-amber/30",
  };

  return (
    <div className={`border-l-2 pl-4 py-1 ${colorMap[color]}`}>
      <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-slate-300">{label}</p>
      <p className={`mt-2 font-tech text-xl font-bold uppercase tracking-widest ${colorMap[color].split(' ')[0]} glow-text-${color}`}>{value}</p>
    </div>
  );
}

function DashboardShell({
  activeView,
  children,
  error,
  loading,
  onRefresh,
  onSelectView,
  onToggleSidebar,
  sidebarCollapsed,
  simulationMessage,
  simulationHistory,
  historyIndex,
  setHistoryIndex,
  isHistorical
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex min-h-screen overflow-hidden bg-core-950 font-body"
    >
      <div className="grid-bg-container"><div className="grid-bg opacity-10" /></div>

      <motion.aside
        animate={{ width: sidebarCollapsed ? 80 : 280 }}
        className="relative z-20 flex shrink-0 flex-col border-r border-neon-cyan/20 bg-core-950/80 backdrop-blur-2xl"
      >
        <div className="relative flex items-center justify-between border-b border-neon-cyan/20 px-5 py-6">
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-neon-cyan/70">Terminal</p>
                <h2 className="mt-1 font-display text-lg font-bold text-white tracking-widest">ICU_OS</h2>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            className="rounded border border-neon-cyan/30 bg-neon-cyan/5 p-2 text-neon-cyan transition hover:bg-neon-cyan/20 hover:shadow-neon-cyan"
            onClick={onToggleSidebar}
            type="button"
          >
            {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="relative flex-1 space-y-3 px-4 py-6 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = key === activeView;
            return (
              <button
                key={key}
                className={`relative flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left transition-all duration-300 overflow-hidden font-tech text-xs uppercase tracking-widest ${isActive
                    ? "text-core-950 bg-neon-cyan shadow-neon-cyan font-bold"
                    : "text-slate-300 hover:bg-neon-cyan/10 hover:text-neon-cyan hover:border-neon-cyan/50 border border-transparent"
                  }`}
                onClick={() => onSelectView(key)}
                type="button"
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-core-950" : ""}`} />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>
      </motion.aside>

      <main className="relative z-10 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
          <motion.header variants={fadeUp} initial="hidden" animate="visible" className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-neon-cyan">live connection standard</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-white tracking-tight">
                  {NAV_ITEMS.find(i => i.key === activeView)?.label || "Dashboard"}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <AnimatePresence>
                  {simulationMessage && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-2 rounded border border-emerald-600/50 bg-emerald-600/10 px-4 py-2 text-xs font-tech text-emerald-600 uppercase shadow-[0_0_15px_rgba(57,255,20,0.1)]">
                      <Sparkles className="h-4 w-4" />
                      {simulationMessage}
                    </motion.div>
                  )}
                  {error && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-2 rounded border border-neon-pink/50 bg-neon-pink/10 px-4 py-2 text-xs font-tech text-neon-pink uppercase shadow-neon-pink">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  className="group inline-flex items-center gap-2 rounded border border-neon-cyan/40 bg-neon-cyan/5 px-5 py-2.5 text-xs font-tech font-bold uppercase tracking-widest text-neon-cyan transition hover:bg-neon-cyan hover:shadow-neon-cyan hover:text-core-950"
                  onClick={onRefresh}
                  type="button"
                >
                  <RefreshCw className={`h-4 w-4 ${loading.initial ? "animate-spin" : "group-hover:rotate-180 transition duration-500"}`} />
                  Sync
                </button>
              </div>
            </div>
          </motion.header>

          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="pb-24"
          >
            {children}
          </motion.div>
        </div>
      </main>

      {simulationHistory && simulationHistory.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 lg:pl-10 p-4 z-50 bg-gradient-to-t from-core-950 via-core-950/90 to-transparent pointer-events-none">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-4 bg-core-950/90 border border-neon-cyan/40 p-4 rounded-xl backdrop-blur-md pointer-events-auto shadow-[0_0_20px_rgba(0,240,255,0.15)] flex-1 w-full">
            <div className="text-neon-cyan/70 font-tech uppercase text-xs tracking-widest min-w-max flex flex-col items-center">
              <span>Time Delta</span>
              <span className="text-white font-bold glow-text-cyan mt-1">{historyIndex === -1 ? 'LIVE' : `T-${simulationHistory.length - historyIndex}`}</span>
            </div>
            <input 
              type="range" 
              className="w-full h-1 bg-neon-cyan/20 rounded-lg appearance-none cursor-pointer accent-neon-cyan hover:accent-white transition"
              min={0}
              max={simulationHistory.length}
              value={historyIndex === -1 ? simulationHistory.length : historyIndex}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val === simulationHistory.length) setHistoryIndex(-1);
                else setHistoryIndex(val);
              }}
            />
            <div className="text-neon-pink/70 font-tech uppercase text-xs tracking-widest min-w-max text-right">
              {isHistorical ? <span className="animate-pulse text-neon-pink glow-text-pink font-bold">HISTORICAL</span> : <span className="text-neon-cyan glow-text-cyan font-bold">LIVE SYNC</span>}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function OverviewView({ chartData, patients, selectedPatientId, summary, onPatientSelect, onInspect, sitrepLog }) {
  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[repeat(3,minmax(0,1fr))_1.1fr]">
        <StatCard label="Total Nodes" value={summary.totalPatients} tone="cyan" delay={0.1} />
        <StatCard label="Vectors Active" value={summary.infectedCount} tone="pink" delay={0.2} />
        <StatCard label="Prop. Rate" value={`${summary.infectionRate}%`} tone="amber" delay={0.3} />
        <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-5 border border-neon-cyan/20">
          <div className="mb-2">
            <p className="text-xs font-tech uppercase tracking-widest text-slate-300">Status Mix</p>
            <p className="mt-1 text-sm font-tech text-neon-cyan glow-text-cyan">Peak: {summary.dominantStatus}</p>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" innerRadius={45} outerRadius={65} paddingAngle={5} stroke="none">
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#0284c7", borderRadius: "8px", fontFamily: "Space Mono" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[350px,1fr]">
        <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-6 border-neon-cyan/20 h-full flex flex-col">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-neon-cyan/10 pb-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white tracking-wider glow-text-cyan flex items-center gap-2">
                <TerminalSquare className="w-5 h-5 text-neon-cyan" /> SITREP Console
              </h2>
            </div>
            <div className="rounded border border-neon-cyan/30 bg-neon-cyan/5 px-4 py-2 text-[10px] font-tech uppercase text-neon-cyan tracking-widest animate-pulse">
              LIVE NARRATIVE FEED
            </div>
          </div>
          <div className="flex-1 bg-[#050914] rounded-xl border border-neon-cyan/10 p-4 overflow-y-auto scrollbar-thin shadow-inner font-tech text-xs tracking-widest leading-6 max-h-80">
            {sitrepLog && sitrepLog.length > 0 ? (
              sitrepLog.map((log, i) => (
                <div key={i} className={`mb-3 pb-3 border-b border-white/5 ${log.includes('[ALERT]') ? 'text-neon-pink' : log.includes('[RECOVERY]') ? 'text-neon-cyan' : log.includes('[OVERRIDE]') ? 'text-neon-amber' : 'text-slate-400'}`}>
                  <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span> {log}
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic">SYSTEM INITIALIZED. WAITING FOR PATTERN DEVIATION...</div>
            )}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-6 border-neon-cyan/20 h-full">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-neon-cyan/10 pb-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white tracking-wider glow-text-cyan">Entity Database</h2>
            </div>
            <div className="rounded border border-neon-pink/30 bg-neon-pink/5 px-4 py-2 text-xs font-tech uppercase text-slate-300">
              Focus: <span className="font-bold text-neon-pink glow-text-pink">{selectedPatientId ?? "NULL"}</span>
            </div>
          </div>
          <PatientGrid patients={patients} selectedPatientId={selectedPatientId} onPatientSelect={onPatientSelect} onInspect={onInspect} columns="grid-cols-1 xl:grid-cols-2" />
        </motion.div>
      </div>
    </motion.section>
  );
}

function StatCard({ label, tone, value, delay }) {
  const config = {
    cyan: "border-neon-cyan/40 text-neon-cyan shadow-[inset_0_0_20px_rgba(0,240,255,0.05)]",
    pink: "border-neon-pink/40 text-neon-pink shadow-[inset_0_0_20px_rgba(255,0,102,0.05)]",
    amber: "border-neon-amber/40 text-neon-amber shadow-[inset_0_0_20px_rgba(255,176,0,0.05)]",
  };

  return (
    <motion.div variants={fadeUp} className={`rounded-2xl border bg-core-900/50 p-6 backdrop-blur ${config[tone]} relative overflow-hidden group hover:bg-core-900 transition-colors`}>
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20 bg-${tone}-500 transform translate-x-1/2 -translate-y-1/2 group-hover:opacity-40 transition-opacity`} />
      <p className="text-[10px] font-tech uppercase tracking-[0.2em] text-slate-300">{label}</p>
      <p className="mt-4 font-tech text-5xl font-bold tracking-tight glow-text-cyan" >{value}</p>
    </motion.div>
  );
}

function PatientGrid({ patients, selectedPatientId, onPatientSelect, onInspect, columns = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3" }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  if (!patients.length) {
    return <EmptyState title="Datastream Empty" description="Awaiting entity payload from backend..." />;
  }

  const filteredPatients = patients.filter(p => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (searchQuery && !p.id.includes(searchQuery)) return false;
    return true;
  });

  const visiblePatients = filteredPatients.slice(0, 48); // Prevent rendering thousands of DOM elements

  return (
    <div className="space-y-6">
      <PatientFilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className={`grid gap-5 ${columns}`}>
        {visiblePatients.map((patient) => (
          <PatientCard
            key={patient.id}
            patient={patient}
            selected={selectedPatientId === patient.id}
            onSelect={() => onPatientSelect?.(patient.id)}
            onInspect={onInspect ? () => onInspect(patient) : undefined}
          />
        ))}
      </motion.div>
    </div>
  );
}

function PatientFilterBar({ searchQuery, setSearchQuery, statusFilter, setStatusFilter }) {
  const filters = ["ALL", "CRITICAL", "MODERATE", "STABLE"];

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 w-full bg-[#0b121e] p-2 rounded-xl border border-white/10 shadow-inner">
      <div className="relative flex-1 w-full flex items-center">
        <Search className="absolute left-4 w-4 h-4 text-slate-300" />
        <input
          type="text"
          className="w-full bg-core-900 border border-white/10 rounded-lg py-3 pl-11 pr-4 text-sm font-tech text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan transition"
          placeholder="Search ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
        {filters.map((f) => {
          const isActive = statusFilter === f;
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-5 py-3 rounded-lg text-xs font-tech font-bold uppercase transition ${isActive ? 'bg-[#0b2434] text-neon-cyan border border-neon-cyan/50 shadow-[0_0_15px_rgba(0,240,255,0.1)]' : 'bg-core-900 text-slate-300 border border-white/10 hover:border-white/20 hover:text-slate-400'}`}
            >
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PatientCard({ patient, selected, onSelect, onInspect }) {
  const palette = STATUS_COLORS[patient.status] ?? STATUS_COLORS.STABLE;

  return (
    <motion.button
      variants={fadeUp}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`group relative overflow-hidden rounded-xl border bg-core-900/80 p-5 text-left transition-all duration-300 ${selected ? `border-[${palette.accent.split('-')[1]}] ring-1 ring-current ${palette.glow}` : palette.border
        } hover:border-current hover:shadow-lg`}
      onClick={onSelect}
      type="button"
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${palette.accent}`} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-slate-300">Patient ID</p>
          <div className="mt-1 font-tech text-xl font-bold text-white flex items-center gap-2">
            [{patient.id}]
            {onInspect && (
              <button
                onClick={(e) => { e.stopPropagation(); onInspect(); }}
                className="rounded bg-core-950 p-1.5 text-slate-300 hover:bg-neon-cyan/20 hover:text-neon-cyan transition border border-white/10 hover:border-neon-cyan/50 ml-1"
                title="Open Dossier"
                type="button"
              >
                <FileSearch className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <span className={`rounded px-2 py-1 text-[10px] font-tech font-bold uppercase tracking-wider border flex-shrink-0 ${palette.badge}`}>{patient.status}</span>
      </div>

      <dl className="mt-6 grid gap-3 text-xs font-tech text-slate-300">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <dt>Vector State</dt>
          <dd className={patient.infected ? "font-bold text-neon-pink glow-text-pink" : "font-bold text-neon-cyan"}>
            {patient.infected ? "INFECTED" : "UNINFECTED"}
          </dd>
        </div>
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <dt>Strain</dt>
          <dd className="font-bold text-white">{patient.infected ? patient.bacteria ?? "UNKNOWN" : "N/A"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Treatment</dt>
          <dd className="font-bold text-neon-amber text-right max-w-[50%] truncate">{patient.antibiotic ?? "NULL"}</dd>
        </div>
      </dl>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <MiniMetric label="SOF" value={formatMetric(patient.sofa)} />
        <MiniMetric label="LAC" value={formatMetric(patient.lactate)} />
        <MiniMetric label="SEV" value={formatMetric(patient.severity)} />
      </div>
    </motion.button>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="flex flex-col justify-center rounded border border-neon-cyan/20 bg-neon-cyan/5 px-1 py-1.5 text-center overflow-hidden">
      <p className="text-[8px] sm:text-[9px] font-tech uppercase tracking-wider text-neon-cyan/70 truncate leading-tight">{label}</p>
      <p className="mt-0.5 font-tech text-[10px] sm:text-xs font-bold text-white truncate leading-tight">{value}</p>
    </div>
  );
}

function SimulationView({ loading, patients, summary, onPatientSelect, onRunSimulation, onInspect }) {
  const highlightedPatients = patients.filter((patient) => patient.infected || patient.status === "CRITICAL");

  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={fadeUp} className="glass-panel-pink rounded-2xl p-6 border-neon-pink/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white glow-text-pink">Execution Core</h2>
            <p className="mt-2 max-w-2xl text-xs font-tech text-slate-300">
              Trigger predictive twin step to observe mutational spread.
            </p>
          </div>
          <button
            className="group relative inline-flex items-center justify-center gap-3 rounded bg-neon-pink px-8 py-3 text-sm font-tech font-bold uppercase tracking-widest text-core-950 transition hover:bg-core-900 hover:shadow-neon-pink"
            onClick={onRunSimulation}
            type="button"
          >
            <Sparkles className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            EXECUTE STEP
          </button>
        </div>
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-6 border-neon-cyan/20">
          <div className="mb-6">
            <h3 className="font-display text-xl font-bold text-white">Priority Watchlist</h3>
            <p className="mt-1 text-xs font-tech text-slate-300">High severity targets isolated for monitoring.</p>
          </div>
          <PatientGrid patients={highlightedPatients.length ? highlightedPatients : patients} onPatientSelect={onPatientSelect} onInspect={onInspect} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2" />
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-2xl border border-neon-cyan/30 bg-core-900 overflow-hidden relative shadow-neon-cyan p-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.05)_0%,transparent_100%)] pointer-events-none" />
          <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-neon-cyan">Global System Pulse</p>
          <div className="mt-8 space-y-4 font-tech text-sm">
            <PulseRow label="CRITICAL ENTITIES" value={summary.criticalCount} color="pink" />
            <PulseRow label="MODERATE ENTITIES" value={summary.moderateCount} color="amber" />
            <PulseRow label="STABLE ENTITIES" value={summary.stableCount} color="cyan" />
            <div className="h-px bg-neon-cyan/20 my-4" />
            <PulseRow label="TOTAL INFECTED" value={summary.infectedCount} color="pink" />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}

function PulseRow({ label, value, color }) {
  const textClr = color === 'pink' ? 'text-neon-pink glow-text-pink' : color === 'amber' ? 'text-neon-amber glow-text-amber' : 'text-neon-cyan glow-text-cyan';
  return (
    <div className={`flex items-center justify-between border-b border-white/10 pb-2 ${textClr}`}>
      <span>[{label}]</span>
      <span className="font-bold text-lg">{value}</span>
    </div>
  );
}

function RecommendationView({ loading, patients, recommendation, selectedPatient, selectedPatientId, onPatientSelect, onInspect }) {
  const randomizedPatients = useMemo(() => {
    return [...patients].sort(() => Math.random() - 0.5);
  }, [patients]);

  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-6 xl:grid-cols-[1fr,1fr]">
      <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-6 border-neon-cyan/20">
        <div className="mb-6">
          <h2 className="font-display text-xl font-bold text-white">Patient ID Selector</h2>
          <p className="mt-1 text-xs font-tech text-slate-300">Lock onto a patient ID to compute counter-measures.</p>
        </div>
        <PatientGrid patients={randomizedPatients} selectedPatientId={selectedPatientId} onPatientSelect={onPatientSelect} onInspect={onInspect} columns="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2" />
      </motion.div>

      <motion.div variants={fadeUp} className="glass-panel rounded-2xl p-8 border-neon-amber/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-amber/10 blur-3xl rounded-full" />
        <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-neon-amber">Counter-Measure Compute</p>
        <h3 className="mt-4 font-tech text-3xl font-bold text-white glow-text-amber">
          Patient ID: [{selectedPatient ? selectedPatient.id : "NULL"}]
        </h3>

        <div className="mt-8 rounded-xl border border-neon-amber/20 bg-core-900/80 p-6 shadow-neon-amber">
          {loading ? (
            <div className="flex animate-pulse space-x-4">
              <div className="h-4 bg-neon-amber/20 rounded w-3/4"></div>
            </div>
          ) : selectedPatient ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="mb-6">
                <p className="text-[10px] font-tech uppercase tracking-[0.2em] text-neon-amber/70">Computed Protocol</p>
                <p className="mt-2 font-display text-4xl font-bold text-neon-amber glow-text-amber break-words">
                  {extractRecommendationLabel(recommendation)}
                </p>
              </div>
              <div className="grid gap-4 text-xs font-tech text-slate-400">
                <InfoRow label="ACTIVE MEASURE" value={selectedPatient.antibiotic ?? "NULL"} />
                <InfoRow label="DETECTED STRAIN" value={selectedPatient.bacteria ?? "NONE"} color={selectedPatient.infected ? "text-neon-pink" : ""} />
                <InfoRow label="SEV INDEX" value={formatMetric(selectedPatient.severity)} />
              </div>
            </motion.div>
          ) : (
            <EmptyState title="Awaiting Patient ID Lock" description="Select a node to formulate response." />
          )}
        </div>
      </motion.div>
    </motion.section>
  );
}

function NetworkView({ networkData, patients }) {
  const fallbackData = useMemo(() => buildFallbackNetwork(patients), [patients]);
  const graph = networkData?.nodes?.length ? networkData : fallbackData;
  const analytics = useMemo(() => buildNetworkAnalytics(graph, patients), [graph, patients]);

  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="glass-panel rounded-2xl p-6 border-neon-cyan/20">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-neon-cyan/20 pb-4">
        <div>
          <h2 className="font-tech text-2xl font-bold text-white glow-text-cyan">Outbreak Network Map</h2>
          <p className="mt-2 text-xs font-tech text-slate-300 uppercase">Tracing geometric contact spread among entities.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3 relative z-10">
        <NetworkStat label="Nodes" value={analytics.nodeCount} color="cyan" />
        <NetworkStat label="Edges" value={analytics.edgeCount} color="amber" />
        <NetworkStat label="Hotspots" value={analytics.infectedNodeCount} color="pink" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr,0.5fr] h-[600px]">
        <motion.div variants={fadeUp} className="h-full">
          <DenseNetworkGraph patients={patients} networkData={graph} />
        </motion.div>
        <motion.div variants={fadeUp} className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin">
          <NetworkInsights analytics={analytics} />
        </motion.div>
      </div>
    </motion.section>
  );
}

function ComparisonView({ prev, curr }) {
  if (!prev) {
    return (
      <motion.section variants={fadeUp} initial="hidden" animate="visible" className="flex h-full items-center justify-center p-6">
        <EmptyState title="No Baseline Available" description="Run a simulation step first to capture a comparison snapshot." />
      </motion.section>
    );
  }

  const pSum = prev.summary;
  const cSum = curr.summary;

  const dInfected = cSum.infectedCount - pSum.infectedCount;
  const dCritical = cSum.criticalCount - pSum.criticalCount;
  const dModerate = cSum.moderateCount - pSum.moderateCount;
  const dStable = cSum.stableCount - pSum.stableCount;

  // Clinical Averages & Ratios
  const calcAvg = (patients, key) => patients.length ? patients.reduce((acc, p) => acc + (Number(p[key]) || 0), 0) / patients.length : 0;
  const dSofa = calcAvg(curr.patients, "sofa") - calcAvg(prev.patients, "sofa");
  const dLac = calcAvg(curr.patients, "lactate") - calcAvg(prev.patients, "lactate");
  const dSev = calcAvg(curr.patients, "severity") - calcAvg(prev.patients, "severity");

  const cInfRate = cSum.totalPatients ? (cSum.infectedCount / cSum.totalPatients * 100) : 0;
  const pInfRate = pSum.totalPatients ? (pSum.infectedCount / pSum.totalPatients * 100) : 0;
  const dInfRate = cInfRate - pInfRate;

  // Track Frequencies (Strains / Antibiotics)
  const calcFreq = (patients, key, filterInfected = false) => patients.reduce((acc, p) => {
    if (!filterInfected || p.infected) {
      const val = p[key] && p[key] !== "N/A" ? p[key] : "UNKNOWN";
      acc[val] = (acc[val] || 0) + 1;
    }
    return acc;
  }, {});

  // Strains
  const currStrains = calcFreq(curr.patients, "bacteria", true);
  const prevStrains = calcFreq(prev.patients, "bacteria", true);
  const strainKeys = Array.from(new Set([...Object.keys(currStrains), ...Object.keys(prevStrains)]));
  const strainDeltas = strainKeys.map(k => {
    const c = currStrains[k] || 0;
    const p = prevStrains[k] || 0;
    return { name: k, curr: c, prev: p, diff: c - p };
  }).filter(s => s.diff !== 0).sort((a, b) => b.diff - a.diff);

  // Protocols (Antibiotics)
  const currAnti = calcFreq(curr.patients, "antibiotic");
  const prevAnti = calcFreq(prev.patients, "antibiotic");
  const antiKeys = Array.from(new Set([...Object.keys(currAnti), ...Object.keys(prevAnti)]));
  const antiDeltas = antiKeys.map(k => {
    const c = currAnti[k] || 0;
    const p = prevAnti[k] || 0;
    return { name: k, curr: c, prev: p, diff: c - p };
  }).filter(s => s.diff !== 0).sort((a, b) => b.diff - a.diff);

  // Track Individual Entity Shifts
  const prevMap = new Map(prev.patients.map(p => [p.id, p]));

  // Severity Spikes (Largest numeric worsening/improvement)
  const sevShifts = curr.patients.map(p => {
    const old = prevMap.get(p.id);
    if (!old) return null;
    return { id: p.id, oldSev: old.severity || 0, currSev: p.severity || 0, diff: (p.severity || 0) - (old.severity || 0) };
  }).filter(s => s && Math.abs(s.diff) > 0.1).sort((a, b) => b.diff - a.diff);
  const worstSpikes = sevShifts.slice(0, 10);

  // Status Shifts
  const statusScore = { CRITICAL: 3, MODERATE: 2, STABLE: 1, UNKNOWN: 0 };
  const deltaPatients = curr.patients.filter(p => {
    const pRecord = prevMap.get(p.id);
    return pRecord && pRecord.status !== p.status;
  }).map(p => {
    const oldP = prevMap.get(p.id);
    const scoreDiff = statusScore[p.status || "UNKNOWN"] - statusScore[oldP.status || "UNKNOWN"];
    return { ...p, oldStatus: oldP.status, scoreDiff };
  }).sort((a, b) => b.scoreDiff - a.scoreDiff);

  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      <div className="flex items-center gap-4 border-b border-neon-cyan/20 pb-4">
        <GitCompare className="h-6 w-6 text-neon-cyan" />
        <div>
          <h2 className="font-tech text-2xl font-bold text-white glow-text-cyan">Simulation Delta Analytics</h2>
          <p className="mt-1 text-xs font-tech text-slate-300 uppercase">Multi-Dimensional Differential Processing [PRE vs POST]</p>
        </div>
      </div>

      <div>
        <h3 className="font-tech text-sm uppercase tracking-widest text-slate-300 mb-4">Macro Status Variances</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <DeltaPanel title="INFECTED Spread" val={cSum.infectedCount} base={pSum.infectedCount} diff={dInfected} inverted />
          <DeltaPanel title="CRITICAL Shift" val={cSum.criticalCount} base={pSum.criticalCount} diff={dCritical} inverted />
          <DeltaPanel title="MODERATE Shift" val={cSum.moderateCount} base={pSum.moderateCount} diff={dModerate} inverted />
          <DeltaPanel title="STABLE Shift" val={cSum.stableCount} base={pSum.stableCount} diff={dStable} />
        </div>
      </div>

      <div>
        <h3 className="font-tech text-sm uppercase tracking-widest text-slate-300 mb-4 mt-6">Systemic Metric Differentials</h3>
        <div className="grid gap-4 md:grid-cols-4">
          <ClinicalDeltaPanel title="Infection Density (%)" val={cInfRate} diff={dInfRate} inverted />
          <ClinicalDeltaPanel title="Avg Severity Range" val={calcAvg(curr.patients, "severity")} diff={dSev} inverted />
          <ClinicalDeltaPanel title="Organ Failure Quotient" val={calcAvg(curr.patients, "sofa")} diff={dSofa} inverted />
          <ClinicalDeltaPanel title="Avg Lactate Build-up" val={calcAvg(curr.patients, "lactate")} diff={dLac} inverted />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4 mt-6">

        {/* Pathogens */}
        <div className="glass-panel rounded-2xl p-6 border-neon-pink/20 relative z-10 flex flex-col h-full shadow-[0_0_15px_rgba(255,0,102,0.05)]">
          <h3 className="font-tech text-xs uppercase tracking-widest text-neon-pink glow-text-pink mb-4">Pathogen Bloom</h3>
          {strainDeltas.length === 0 ? (
            <p className="text-xs font-tech text-slate-300">No microbial expansions detected.</p>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin max-h-80">
              {strainDeltas.map(s => (
                <div key={s.name} className="flex justify-between items-center rounded bg-core-900 border border-white/10 p-3">
                  <span className="font-tech text-[10px] text-white max-w-[60%] truncate">{s.name}</span>
                  <div className="flex items-center gap-3 font-tech text-xs font-bold">
                    <span className="text-slate-300">{s.prev}&rarr;{s.curr}</span>
                    <span className={`w-8 text-right ${s.diff > 0 ? "text-neon-pink glow-text-pink" : "text-neon-cyan"}`}>{s.diff > 0 ? "+" : ""}{s.diff}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Antibiotics */}
        <div className="glass-panel rounded-2xl p-6 border-neon-amber/20 relative z-10 flex flex-col h-full shadow-[0_0_15px_rgba(255,176,0,0.05)]">
          <h3 className="font-tech text-xs uppercase tracking-widest text-neon-amber mb-4">Protocol Adjustments</h3>
          {antiDeltas.length === 0 ? (
            <p className="text-xs font-tech text-slate-300">No treatments altered across payload.</p>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin max-h-80">
              {antiDeltas.map(s => (
                <div key={s.name} className="flex justify-between items-center rounded bg-core-900 border border-white/10 p-3">
                  <span className="font-tech text-[10px] text-white max-w-[60%] truncate">{s.name}</span>
                  <div className="flex items-center gap-3 font-tech text-xs font-bold">
                    <span className="text-slate-300">{s.prev}&rarr;{s.curr}</span>
                    <span className={`w-8 text-right ${s.diff > 0 ? "text-neon-amber glow-text-amber" : "text-slate-300"}`}>{s.diff > 0 ? "+" : ""}{s.diff}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Severity Spikes */}
        <div className="glass-panel rounded-2xl p-6 border-neon-cyan/20 relative z-10 flex flex-col h-full">
          <h3 className="font-tech text-xs uppercase tracking-widest text-slate-300 mb-4">High Volatility (Spikes)</h3>
          {worstSpikes.length === 0 ? (
            <p className="text-xs font-tech text-slate-300">No drastic severity fluctuations.</p>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin max-h-80">
              {worstSpikes.map(s => (
                <div key={s.id} className="flex justify-between items-center rounded bg-core-900 border border-white/10 p-3">
                  <span className="font-tech text-xs text-white">[{s.id}]</span>
                  <div className="flex items-center gap-3 font-tech text-xs font-bold">
                    <span className="text-slate-300">{s.oldSev.toFixed(1)}&rarr;{s.currSev.toFixed(1)}</span>
                    <span className={`w-10 text-right ${s.diff > 0 ? "text-neon-pink glow-text-pink" : "text-neon-cyan"}`}>{s.diff > 0 ? "+" : ""}{s.diff.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Deteriorations */}
        <div className="glass-panel rounded-2xl p-6 border-neon-cyan/20 relative z-10 flex flex-col h-full">
          <h3 className="font-tech text-xs uppercase tracking-widest text-slate-300 mb-4">Entity Hard-Shifts</h3>
          {deltaPatients.length === 0 ? (
            <p className="text-xs font-tech text-slate-300">No status bounds breached.</p>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin max-h-80">
              {deltaPatients.map(p => (
                <div key={p.id} className="rounded border border-white/10 bg-core-900 p-4 font-tech flex justify-between items-center transition hover:border-white/30">
                  <span className="text-white font-bold text-xs">[{p.id}]</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-300">{p.oldStatus}</span>
                    <ArrowRight className="h-3 w-3 text-slate-300" />
                    <span className={p.scoreDiff > 0 ? "text-neon-pink glow-text-pink" : "text-neon-cyan glow-text-cyan"}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </motion.section>
  );
}

function ClinicalDeltaPanel({ title, val, diff, inverted = false }) {
  const isGood = inverted ? diff < 0 : diff > 0;
  const color = Math.abs(diff) < 0.01 ? "text-slate-300" : isGood ? "text-neon-cyan glow-text-cyan" : "text-neon-pink glow-text-pink";
  const sign = diff > 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-neon-amber/20 bg-[#060b13] p-5 shadow-[0_0_15px_rgba(255,176,0,0.1)] relative z-10">
      <p className="text-[10px] font-tech uppercase tracking-widest text-neon-amber/70">{title}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="font-display text-3xl font-bold text-white">{val.toFixed(2)}</span>
        <span className={`font-tech text-lg font-bold ${color}`}>{sign}{diff.toFixed(2)}</span>
      </div>
    </div>
  );
}

function DeltaPanel({ title, val, base, diff, inverted = false }) {
  const isGood = inverted ? diff < 0 : diff > 0;
  const color = diff === 0 ? "text-slate-300" : isGood ? "text-neon-cyan glow-text-cyan" : "text-neon-pink glow-text-pink";
  const sign = diff > 0 ? "+" : "";

  return (
    <div className="rounded-xl border border-neon-cyan/20 bg-[#060b13] p-5 shadow-neon-cyan relative z-10">
      <p className="text-[10px] font-tech uppercase tracking-widest text-slate-300">{title}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="font-display text-4xl font-bold text-white">{val}</span>
        <span className={`font-tech text-xl font-bold ${color}`}>{sign}{diff}</span>
      </div>
      <p className="mt-2 text-[10px] font-tech text-slate-300 bg-core-900 rounded p-1 inline-block">Baseline: {base}</p>
    </div>
  );
}

function DenseNetworkGraph({ patients, networkData }) {
  const displayNodes = patients;
  const R = 2.5;
  const c = 6.5;
  const CENTER_X = 500;
  const CENTER_Y = 500;

  const [searchQuery, setSearchQuery] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [layoutMode, setLayoutMode] = useState("SPIRAL");
  const tf = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const gRef = useRef(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const idMap = useMemo(() => {
    const map = new Map();
    const wardCounts = { 0:0, 1:0, 2:0, 3:0 };
    
    displayNodes.forEach((patient, i) => {
      let x, y;
      if (layoutMode === "SPIRAL") {
        const angle = i * 137.508 * (Math.PI / 180);
        const r = c * Math.sqrt(i);
        x = CENTER_X + r * Math.cos(angle);
        y = CENTER_Y + r * Math.sin(angle);
      } else {
        const idNum = parseInt(patient.id, 10) || i;
        const wardId = idNum % 4; // 4 quadrants simulating 4 wards
        const count = wardCounts[wardId]++;
        
        const cols = 20; // 20 beds wide
        const spacing = 18; 
        const row = Math.floor(count / cols);
        const col = count % cols;
        
        const wardWidth = cols * spacing;
        const offsetX = (wardId % 2 === 0) ? -280 : 280;
        const offsetY = (wardId < 2) ? -200 : 200;
        
        x = CENTER_X + offsetX - (wardWidth/2) + col * spacing;
        y = CENTER_Y + offsetY - 100 + row * spacing;
      }
      map.set(String(patient.id), { x, y, patient });
    });
    return map;
  }, [displayNodes, layoutMode]);

  const activeLinks = useMemo(() => {
    if (!searchQuery || !networkData?.links) return [];
    return networkData.links.filter(link => 
      String(link.source) === searchQuery || String(link.target) === searchQuery
    ).map(link => ({
      ...link,
      sourcePos: idMap.get(String(link.source)),
      targetPos: idMap.get(String(link.target))
    })).filter(link => link.sourcePos && link.targetPos);
  }, [searchQuery, networkData, idMap]);

  const activeNodeIds = useMemo(() => {
    if (!searchQuery || !activeLinks.length) return null;
    const ids = new Set([searchQuery]);
    activeLinks.forEach(l => {
      ids.add(String(l.source));
      ids.add(String(l.target));
    });
    return ids;
  }, [searchQuery, activeLinks]);

  const updateTransform = () => {
    if (gRef.current) {
      gRef.current.setAttribute("transform", `translate(${tf.current.pan.x + 500}, ${tf.current.pan.y + 500}) scale(${tf.current.zoom}) translate(-500, -500)`);
    }
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    tf.current.pan.x += dx;
    tf.current.pan.y += dy;
    dragStart.current = { x: e.clientX, y: e.clientY };
    requestAnimationFrame(updateTransform);
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e) => {
    const zoomSensitivity = 0.001;
    tf.current.zoom = Math.max(0.5, Math.min(tf.current.zoom * (1 - e.deltaY * zoomSensitivity), 20));
    setZoomLevel(tf.current.zoom);
    requestAnimationFrame(updateTransform);
  };

  const showLabels = zoomLevel >= 3.5;

  // Sync initial transform
  useEffect(() => {
    updateTransform();
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-neon-cyan/20 bg-[#060b13] relative shadow-neon-cyan h-full w-full flex items-center justify-center">
      <div className="absolute top-4 left-4 z-10 rounded-xl bg-core-950/90 p-4 border border-white/10 backdrop-blur shadow-[0_4px_20px_rgba(0,240,255,0.15)]">
        <div className="flex items-center gap-2 text-white font-tech font-bold text-sm mb-3">
          <Network className="w-4 h-4 text-neon-cyan" /> Infection Spread Network
        </div>
        <div className="flex items-center gap-4 text-xs font-tech text-slate-300">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" style={{ boxShadow: "0 0 10px rgba(239, 68, 68, 0.8)" }} /> Infected</div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#64748b]" /> Uninfected</div>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 font-tech font-bold text-lg">
        <div className="flex bg-core-950/90 rounded-lg border border-neon-cyan/30 backdrop-blur overflow-hidden mb-2">
          <button onClick={() => setLayoutMode("SPIRAL")} className={`px-3 py-2 text-[10px] uppercase transition ${layoutMode === "SPIRAL" ? "bg-neon-cyan text-core-900" : "text-neon-cyan hover:bg-neon-cyan/10"}`}>Spiral</button>
          <button onClick={() => setLayoutMode("FLOORPLAN")} className={`px-3 py-2 text-[10px] uppercase transition ${layoutMode === "FLOORPLAN" ? "bg-neon-pink text-core-900" : "text-neon-pink hover:bg-neon-pink/10"}`}>Ward</button>
        </div>
        <button onClick={() => { tf.current.zoom = Math.min(tf.current.zoom * 1.4, 20); setZoomLevel(tf.current.zoom); updateTransform(); }} className="w-10 h-10 flex items-center justify-center self-end bg-core-950/90 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 backdrop-blur">+</button>
        <button onClick={() => { tf.current.zoom = 1; tf.current.pan = { x: 0, y: 0 }; setZoomLevel(1); updateTransform(); }} className="w-10 h-10 flex items-center justify-center self-end bg-core-950/90 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 backdrop-blur text-sm">RST</button>
        <button onClick={() => { tf.current.zoom = Math.max(tf.current.zoom / 1.4, 0.5); setZoomLevel(tf.current.zoom); updateTransform(); }} className="w-10 h-10 flex items-center justify-center self-end bg-core-950/90 rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 backdrop-blur">-</button>
      </div>

      <div className="absolute bottom-6 w-full flex flex-col items-center z-10 pointer-events-none gap-2">
        <div className="pointer-events-auto flex items-center gap-2 bg-core-950/90 rounded-full border border-neon-cyan/30 p-2 pl-4 backdrop-blur shadow-[0_4px_20px_rgba(0,240,255,0.15)]">
          <Search className="w-4 h-4 text-neon-cyan" />
          <input 
            type="text" 
            placeholder="Search Entity ID (e.g. 15)" 
            className="bg-transparent border-none outline-none text-white font-tech text-sm w-48 placeholder:text-slate-500 placeholder:uppercase uppercase"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
          />
          {searchQuery && (
            <span className="font-tech text-[10px] text-neon-cyan bg-neon-cyan/10 px-2 py-1 rounded-full uppercase tracking-widest mr-1 border border-neon-cyan/20">
              {activeLinks.length} Links
            </span>
          )}
        </div>
        {activeNodeIds && (
          <div className="pointer-events-auto bg-core-950/90 border border-neon-cyan/20 rounded-xl p-3 backdrop-blur max-w-[80%] max-h-32 overflow-y-auto scrollbar-thin shadow-neon-cyan flex flex-wrap gap-2 justify-center">
            {[...activeNodeIds].filter(id => id !== searchQuery).map(id => (
              <span key={id} className="font-tech text-[9px] px-2 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded text-neon-cyan uppercase">LINKED: {id}</span>
            ))}
          </div>
        )}
      </div>

      <div
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <svg className="w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
          <defs>
          </defs>
          <g ref={gRef}>
            {activeLinks.map((link, i) => (
              <line key={`link-${i}`} x1={link.sourcePos.x} y1={link.sourcePos.y} x2={link.targetPos.x} y2={link.targetPos.y} stroke="rgba(0, 240, 255, 0.4)" strokeWidth={1} />
            ))}
            {displayNodes.map((patient) => {
              const pos = idMap.get(String(patient.id));
              if (!pos) return null;
              const { x, y } = pos;

              const infected = patient.infected === true || patient.infected === 1;
              const isSearching = activeNodeIds !== null;
              const isActive = isSearching ? activeNodeIds.has(String(patient.id)) : true;
              const isTarget = isSearching && String(patient.id) === searchQuery;
              
              const fillClr = infected ? "#ef4444" : "#64748b";
              const opacityClass = isActive ? "opacity-100" : "opacity-10";
              const strokeColor = isTarget ? "#ffb000" : "none";
              const strokeWidth = isTarget ? 1.5 : 0;

              return (
                <g key={patient.id} className={opacityClass}>
                  {infected && <circle cx={x} cy={y} fill={fillClr} r={R * 2.5} className="opacity-30" />}
                  <circle cx={x} cy={y} fill={fillClr} r={R} stroke={strokeColor} strokeWidth={strokeWidth} />
                  {(isActive || showLabels) && (
                    <text fill={isTarget ? "#ffb000" : "#cbd5e1"} fontFamily="Space Mono, monospace" fontSize={isTarget ? "3.5" : "2.5"} fontWeight="bold" textAnchor="middle" dy="0.3" x={x} y={y - (isTarget ? 5 : 4.5)} className="select-none pointer-events-none">
                      {patient.id}
                    </text>
                  )}
                  <title>Entity ID: {patient.id} | Status: {infected ? "INFECTED" : "UNINFECTED"}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function NetworkStat({ label, value, color }) {
  const textClr = color === 'pink' ? 'text-neon-pink' : color === 'amber' ? 'text-neon-amber' : 'text-neon-cyan';
  return (
    <div className={`rounded border border-${textClr.split('-')[1]}/30 bg-core-900/5 px-4 py-3 text-center`}>
      <p className="text-[10px] font-tech uppercase tracking-widest text-slate-300">{label}</p>
      <p className={`mt-1 font-tech text-2xl font-bold ${textClr}`}>{value}</p>
    </div>
  );
}

function NetworkInsights({ analytics }) {
  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-neon-cyan/20 bg-core-900/50 p-6">
        <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-neon-cyan mb-4">Transmission Burden</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.topConnectors} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(0, 240, 255, 0.1)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: 'Space Mono' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(0,240,255,0.05)" }} contentStyle={{ backgroundColor: "#ffffff", borderColor: "#0284c7", fontFamily: "Space Mono" }} />
              <Bar dataKey="degree" radius={[4, 4, 0, 0]}>
                {analytics.topConnectors.map((entry) => (
                  <Cell key={entry.id} fill={entry.infected ? "#dc2626" : "#0284c7"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded border border-dashed border-neon-cyan/30 bg-neon-cyan/5 p-8 text-center grid place-content-center h-40">
      <p className="font-tech text-sm font-bold text-neon-cyan uppercase tracking-widest glow-text-cyan">{title}</p>
      <p className="mt-2 text-xs font-tech text-slate-300 uppercase">{description}</p>
    </div>
  );
}

function InfoRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 py-2">
      <span className="text-slate-300 tracking-wider">[{label}]</span>
      <span className={`font-bold ${color || 'text-white'}`}>{value}</span>
    </div>
  );
}

function MetricPanel({ emphasis = false, label, value }) {
  return (
    <div className={`rounded-xl border p-6 font-tech ${emphasis ? "border-neon-amber/50 shadow-[inset_0_0_20px_rgba(255,176,0,0.1)] bg-neon-amber/5" : "border-neon-cyan/20 bg-core-900/50"}`}>
      <p className={`text-[10px] uppercase tracking-widest ${emphasis ? 'text-neon-amber' : 'text-slate-300'}`}>{label}</p>
      <p className={`mt-4 text-xl font-bold uppercase leading-relaxed ${emphasis ? 'text-neon-amber glow-text-amber' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function extractRecommendationLabel(recommendation) {
  if (!recommendation) return "NULL";
  if (typeof recommendation === "string") return recommendation;
  return recommendation.recommended ?? recommendation.recommended_antibiotic ?? recommendation.antibiotic ?? recommendation.recommendation ?? "NULL";
}

function formatMetric(value) {
  if (typeof value !== "number") return "N/A";
  return value.toFixed(2);
}

function buildFallbackNetwork(patients) {
  const nodes = patients.slice(0, 10).map((patient) => ({
    id: patient.id, label: `[${patient.id}]`, infected: patient.infected,
  }));
  const links = nodes.slice(1).map((node, index) => ({ source: nodes[index].id, target: node.id }));
  return { nodes, links };
}

function buildNetworkAnalytics(graph, patients) {
  const links = graph.links ?? [];
  const degreeMap = new Map();
  const patientMap = new Map(patients.map((patient) => [patient.id, patient]));

  graph.nodes.forEach(n => degreeMap.set(n.id, 0));
  links.forEach(l => {
    degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1);
  });

  const topConnectors = graph.nodes
    .map(n => ({
      id: n.id, label: `[${String(n.id).slice(-3)}]`, degree: degreeMap.get(n.id) ?? 0,
      infected: (patientMap.get(n.id)?.infected ?? n.infected ?? 0) === 1,
    }))
    .sort((a, b) => b.degree - a.degree).slice(0, 6);

  const infectedNodeCount = graph.nodes.filter(n => (patientMap.get(n.id)?.infected ?? n.infected ?? 0) === 1).length;
  return {
    nodeCount: graph.nodes.length, edgeCount: links.length, infectedNodeCount, topConnectors,
  };
}

function normalizePatients(payload) {
  if (Array.isArray(payload)) return payload.map((p, i) => ({ ...p, id: String(p.id ?? i), infected: Number(p.infected ?? 0) }));
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload).map(([id, p]) => ({ ...p, id: String(id), infected: Number(p.infected ?? 0) }));
}

function normalizeNetwork(payload, patients) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return buildFallbackNetwork(patients);
  const patientMap = new Map(patients.map(p => [p.id, p]));
  const nodeIds = new Set();
  const links = [];

  Object.entries(payload).forEach(([sourceId, targets]) => {
    const source = String(sourceId);
    nodeIds.add(source);
    if (Array.isArray(targets)) {
      targets.forEach(targetId => {
        const target = String(targetId);
        nodeIds.add(target);
        links.push({ source, target });
      });
    }
  });

  const nodes = Array.from(nodeIds).map(id => ({ id, label: `[${id}]`, infected: patientMap.get(id)?.infected ?? 0 }));
  return { nodes, links };
}

function DossierModal({ patient, onClose, onManualOverride, isHistorical }) {
  if (!patient) return null;

  const statusTone = patient.status === "CRITICAL" ? "pink" : patient.status === "MODERATE" ? "amber" : "cyan";
  const glowShadow = patient.status === "CRITICAL" ? "shadow-[0_0_50px_rgba(255,0,102,0.15)]" : patient.status === "MODERATE" ? "shadow-[0_0_50px_rgba(255,176,0,0.15)]" : "shadow-[0_0_50px_rgba(0,240,255,0.15)]";
  const borderTone = patient.status === "CRITICAL" ? "border-neon-pink/50" : patient.status === "MODERATE" ? "border-neon-amber/50" : "border-neon-cyan/50";
  const textTone = patient.status === "CRITICAL" ? "text-neon-pink glow-text-pink" : patient.status === "MODERATE" ? "text-neon-amber glow-text-amber" : "text-neon-cyan glow-text-cyan";
  const fillTone = patient.status === "CRITICAL" ? "#dc2626" : patient.status === "MODERATE" ? "#fbbf24" : "#0284c7";

  const data = [
    { subject: 'Severity (SEV)', A: patient.severity || 0, fullMark: 15 },
    { subject: 'Organ Fail (SOF)', A: patient.sofa || 0, fullMark: 15 },
    { subject: 'Lactate (LAC)', A: patient.lactate || 0, fullMark: 10 },
    { subject: 'Heart Strain (HR)', A: (patient.severity || 0) * 0.8, fullMark: 15 },
    { subject: 'Infection Risk', A: patient.infected ? 10 : 2, fullMark: 10 }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#f8fafc]/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-4xl overflow-hidden rounded-2xl border ${borderTone} bg-core-950 p-8 ${glowShadow} relative`}
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-300 hover:text-white transition cursor-pointer">
          <Eye className="w-6 h-6" />
        </button>

        <div className="mb-6 flex flex-col md:flex-row justify-between md:items-end border-b border-white/10 pb-6">
          <div>
            <p className="text-[10px] font-tech uppercase tracking-[0.3em] text-slate-300">Subject Dossier Payload</p>
            <h2 className={`mt-1 font-tech text-5xl font-bold ${textTone}`}>[{patient.id}]</h2>
          </div>
          <div className="mt-4 md:mt-0 text-right font-tech">
            <div className="text-sm text-slate-300">Class Target: <span className={`${textTone} font-bold ml-2`}>{patient.status}</span></div>
            <div className="text-sm text-slate-300 mt-1">Vector State: <span className={`font-bold ml-2 ${patient.infected ? "text-neon-pink glow-text-pink" : "text-neon-cyan"}`}>{patient.infected ? "INFECTED" : "UNINFECTED"}</span></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr,300px] gap-8 items-center">

          <div className="h-[400px] w-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-core-800/30 to-transparent rounded-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                <PolarGrid stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Space Mono' }} />
                <PolarRadiusAxis angle={90} domain={[0, 15]} tick={false} axisLine={false} />
                <Radar name="Vitals" dataKey="A" stroke={fillTone} strokeWidth={2} fill={fillTone} fillOpacity={0.3} isAnimationActive={true} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: fillTone, fontFamily: "Space Mono", fontSize: 12, borderRadius: 8, boxShadow: `0 0 10px ${fillTone}40` }} itemStyle={{ color: fillTone, fontWeight: 'bold' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-4 font-tech text-sm self-start w-full">
            <div className="bg-[#0b121e] border border-white/10 p-5 rounded-xl shadow-inner">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300 block mb-2">Detected Strain</span>
              <span className="text-white font-bold text-lg">{patient.bacteria || "N/A"}</span>
            </div>

            <div className="bg-[#0b121e] border border-white/10 p-5 rounded-xl shadow-inner">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300 block mb-2">Active Protocol</span>
              <span className="text-white font-bold text-lg">{patient.antibiotic || "N/A"}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div className="bg-[#0b121e] py-4 rounded-xl border border-white/10 shadow-inner">
                <span className="block text-[10px] tracking-widest text-slate-300 mb-1">SOF</span>
                <span className="text-white font-display text-2xl font-bold">{Number(patient.sofa || 0).toFixed(1)}</span>
              </div>
              <div className="bg-[#0b121e] py-4 rounded-xl border border-white/10 shadow-inner">
                <span className="block text-[10px] tracking-widest text-slate-300 mb-1">LAC</span>
                <span className="text-white font-display text-2xl font-bold">{Number(patient.lactate || 0).toFixed(1)}</span>
              </div>
              <div className="bg-[#0b121e] py-4 rounded-xl border border-white/10 shadow-inner">
                <span className="block text-[10px] tracking-widest text-slate-300 mb-1">SEV</span>
                <span className="text-white font-display text-2xl font-bold">{Number(patient.severity || 0).toFixed(1)}</span>
              </div>
            </div>
            {!isHistorical && onManualOverride && (
              <div className="mt-8">
                <button
                  onClick={() => onManualOverride(patient.id)}
                  disabled={patient.status === 'STABLE' && patient.infected === false && patient.override}
                  className={`w-full py-4 rounded-xl font-display text-sm font-bold uppercase tracking-widest transition-all duration-300 ${
                    patient.override
                      ? 'bg-core-900 border-2 border-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-[#0b121e] border-2 border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-core-950 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                  }`}
                >
                  {patient.override ? 'Override Executed' : 'Execute Triage Override'}
                </button>
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </motion.div>
  );
}

export default App;

