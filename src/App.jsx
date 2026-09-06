import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, FolderKanban, Map as MapIcon, Bell, Share2, MessageSquare,
  Search, ChevronRight, AlertTriangle, CheckCircle2, X, FileText, ShieldAlert,
  ArrowUpRight, ArrowDownRight, Send, Download, IndianRupee,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Seeded RNG so the demo dataset is stable across reloads                */
/* ---------------------------------------------------------------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260905);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

/* ---------------------------------------------------------------------- */
/* Reference data                                                         */
/* ---------------------------------------------------------------------- */
const CONSTITUENCIES = [
  "Madurai", "Coimbatore", "Chennai North", "Salem", "Tiruchirappalli",
  "Erode", "Thanjavur", "Vellore", "Tirunelveli", "Dindigul",
];
const MPS = {
  "Madurai": "S. Venkatesan", "Coimbatore": "P. Arjun", "Chennai North": "K. Meenakshi",
  "Salem": "R. Balaji", "Tiruchirappalli": "M. Selvi", "Erode": "T. Karthik",
  "Thanjavur": "A. Dhanam", "Vellore": "N. Suresh", "Tirunelveli": "G. Lakshmi",
  "Dindigul": "V. Murugan",
};
const CATEGORIES = ["Road", "Drinking Water", "Sanitation", "Education", "Health", "Electricity", "Community Hall"];
const CONTRACTORS = [
  "Amaravathi Infra Pvt Ltd", "Kaveri Builders", "SRM Construction Co",
  "Vaigai Engineering Works", "Shakti Roadways", "Lotus Civil Contractors",
  "Bharat Nirman Associates", "Ganga Infra Solutions", "Sri Balaji Constructions",
  "Nandhini Projects Pvt Ltd",
];
const STATUS = ["Sanctioned", "In Progress", "Delayed", "Completed"];

/* ---------------------------------------------------------------------- */
/* Synthetic project generation (with deliberately injected anomalies,    */
/* mirroring how the real MPLAD risk engine would be trained/tested)      */
/* ---------------------------------------------------------------------- */
function generateProjects(count = 64) {
  const projects = [];
  for (let i = 0; i < count; i++) {
    const constituency = pick(CONSTITUENCIES);
    const category = pick(CATEGORIES);
    const contractor = pick(CONTRACTORS);
    const sanctioned = randInt(8, 80) * 100000; // 8L - 80L
    const anomalyRoll = rng();
    const isAnomalous = anomalyRoll < 0.28;

    let financialProgress, physicalProgress, status, overdueDays, rushUtilization;
    const daysSinceSanction = randInt(30, 900);

    if (isAnomalous) {
      // Inject one of three anomaly archetypes
      const archetype = rng();
      if (archetype < 0.34) {
        // Fund-rush: high financial spend, low physical progress
        financialProgress = randInt(70, 98);
        physicalProgress = randInt(10, 40);
        rushUtilization = true;
        status = "In Progress";
        overdueDays = randInt(0, 20);
      } else if (archetype < 0.67) {
        // Delay archetype: stalled physical progress, way overdue
        physicalProgress = randInt(15, 45);
        financialProgress = randInt(20, 50);
        status = "Delayed";
        overdueDays = randInt(45, 210);
        rushUtilization = false;
      } else {
        // Cost/contractor concentration archetype
        financialProgress = randInt(55, 90);
        physicalProgress = randInt(45, 80);
        status = "In Progress";
        overdueDays = randInt(0, 30);
        rushUtilization = rng() < 0.4;
      }
    } else {
      physicalProgress = randInt(30, 100);
      financialProgress = Math.min(100, physicalProgress + randInt(-8, 12));
      status = physicalProgress >= 98 ? "Completed" : physicalProgress < 20 ? "Sanctioned" : "In Progress";
      overdueDays = 0;
      rushUtilization = false;
    }

    projects.push({
      id: `MPLAD-${(1000 + i)}`,
      title: `${category} improvement — ${constituency} Ward ${randInt(1, 40)}`,
      constituency,
      mp: MPS[constituency],
      category,
      contractor,
      sanctioned,
      financialProgress,
      physicalProgress,
      status,
      overdueDays,
      rushUtilization,
      daysSinceSanction,
      district: constituency,
    });
  }
  return projects;
}

/* ---------------------------------------------------------------------- */
/* Client-side risk engine — a transparent, weighted composite score      */
/* standing in for the Isolation Forest + XGBoost ensemble described in   */
/* the architecture. Every factor is explicit so the score is auditable.  */
/* ---------------------------------------------------------------------- */
function computeRisk(project, contractorCounts) {
  const factors = [];
  let score = 0;

  const gap = project.financialProgress - project.physicalProgress;
  if (gap >= 40) {
    score += 34;
    factors.push({ label: "Severe fund–progress mismatch", detail: `${gap} pt gap between financial (${project.financialProgress}%) and physical (${project.physicalProgress}%) progress — classic sign of funds drawn ahead of actual work.`, weight: 34 });
  } else if (gap >= 20) {
    score += 18;
    factors.push({ label: "Fund–progress mismatch", detail: `Financial progress is running ${gap} points ahead of physical progress.`, weight: 18 });
  }

  if (project.rushUtilization) {
    score += 20;
    factors.push({ label: "Year-end utilization rush pattern", detail: "Expenditure velocity spiked sharply relative to the project's historical drawdown rate — a common signature of funds being exhausted to avoid lapse rather than paced to actual work.", weight: 20 });
  }

  if (project.overdueDays > 150) {
    score += 26;
    factors.push({ label: "Severely overdue", detail: `${project.overdueDays} days past expected completion with no closure.`, weight: 26 });
  } else if (project.overdueDays > 45) {
    score += 14;
    factors.push({ label: "Overdue", detail: `${project.overdueDays} days past expected completion.`, weight: 14 });
  }

  const contractorAward = contractorCounts[project.contractor] || 1;
  if (contractorAward >= 5) {
    score += 18;
    factors.push({ label: "Contractor award concentration", detail: `${project.contractor} holds ${contractorAward} MPLAD awards across multiple constituencies — flagged for cartel-pattern review.`, weight: 18 });
  } else if (contractorAward >= 3) {
    score += 9;
    factors.push({ label: "Repeat contractor pattern", detail: `${project.contractor} has been awarded ${contractorAward} projects in this dataset.`, weight: 9 });
  }

  if (project.status === "Delayed") {
    score += 6;
    factors.push({ label: "Status: Delayed", detail: "Project is formally marked Delayed by the implementing agency.", weight: 6 });
  }

  score = Math.max(2, Math.min(98, Math.round(score + randInt(-3, 3))));

  let grade, gradeColor;
  if (score >= 75) { grade = "F"; gradeColor = "red"; }
  else if (score >= 55) { grade = "D"; gradeColor = "orange"; }
  else if (score >= 35) { grade = "C"; gradeColor = "amber"; }
  else if (score >= 18) { grade = "B"; gradeColor = "teal"; }
  else { grade = "A"; gradeColor = "emerald"; }

  if (factors.length === 0) {
    factors.push({ label: "No material anomalies detected", detail: "Financial and physical progress are tracking consistently and no contractor or timeline flags were triggered.", weight: 0 });
  }
  factors.sort((a, b) => b.weight - a.weight);

  return { score, grade, gradeColor, factors };
}

const GRADE_STYLES = {
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", bar: "bg-emerald-400" },
  teal: { text: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/30", bar: "bg-teal-400" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", bar: "bg-amber-400" },
  orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", bar: "bg-orange-400" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", bar: "bg-red-400" },
};

function inr(n) {
  return "₹" + (n / 100000).toFixed(1) + "L";
}

/* ---------------------------------------------------------------------- */
/* Small building blocks                                                  */
/* ---------------------------------------------------------------------- */
function RiskBadge({ grade, gradeColor, score, size = "sm" }) {
  const s = GRADE_STYLES[gradeColor];
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border ${s.border} ${s.bg} ${s.text} ${pad} font-mono font-semibold`}>
      {grade} · {score}
    </span>
  );
}

function Gauge({ score, gradeColor }) {
  const s = GRADE_STYLES[gradeColor];
  const angle = -90 + (score / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 60, cy = 60, r = 46;
  const x = cx + r * Math.cos(rad);
  const y = cy + r * Math.sin(rad);
  const colorMap = { emerald: "#34d399", teal: "#2dd4bf", amber: "#fbbf24", orange: "#fb923c", red: "#f87171" };
  return (
    <svg viewBox="0 0 120 75" className="w-40 h-auto">
      <path d="M 14 60 A 46 46 0 0 1 106 60" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
      <path
        d="M 14 60 A 46 46 0 0 1 106 60"
        fill="none" stroke={colorMap[gradeColor]} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * 144.5} 300`}
      />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3.5" fill="#e2e8f0" />
      <text x="60" y="68" textAnchor="middle" className="fill-slate-100" style={{ font: "700 16px 'IBM Plex Mono', monospace" }}>{score}</text>
    </svg>
  );
}

function KpiCard({ label, value, sub, icon: Icon, trend }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs uppercase tracking-wide">{label}</span>
        <Icon size={16} className="text-teal-400" />
      </div>
      <div className="font-mono text-2xl text-slate-50 font-semibold">{value}</div>
      {sub && (
        <div className={`flex items-center gap-1 text-xs ${trend === "down" ? "text-red-400" : "text-slate-500"}`}>
          {trend === "down" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {sub}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Project drawer (detail + explanation + report)                         */
/* ---------------------------------------------------------------------- */
function ProjectDrawer({ project, risk, onClose }) {
  const [showReport, setShowReport] = useState(false);
  if (!project) return null;

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const t = (i + 1) / 6;
    return {
      month: `M${i + 1}`,
      financial: Math.round(project.financialProgress * t * (0.85 + rng() * 0.3)),
      physical: Math.round(project.physicalProgress * t * (0.85 + rng() * 0.3)),
    };
  });

  const reportText =
`MPLAD RISK VERIFICATION MEMO
Generated by Sansad-Rakshak Risk Intelligence System

Project ID: ${project.id}
Title: ${project.title}
Constituency: ${project.constituency} (MP: ${project.mp})
Implementing Contractor: ${project.contractor}
Sanctioned Amount: ${inr(project.sanctioned)}

RISK ASSESSMENT: Grade ${risk.grade} — Score ${risk.score}/100

FLAGGED FACTORS:
${risk.factors.map((f, i) => `${i + 1}. ${f.label} — ${f.detail}`).join("\n")}

RECOMMENDED ACTION:
Field verification recommended within 15 working days. Officer should cross-check
physical progress against site photographs and reconcile expenditure vouchers
against the milestone schedule before next fund release.

This memo was auto-drafted from the risk engine's factor attribution and requires
officer review before formal action.`;

  const downloadReport = () => {
    const blob = new Blob([reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project.id}-inquiry-memo.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const s = GRADE_STYLES[risk.gradeColor];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-slate-950 border-l border-slate-800 h-full overflow-y-auto p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-200">
          <X size={20} />
        </button>

        <div className="text-xs text-teal-400 font-mono mb-1">{project.id}</div>
        <h2 className="text-xl text-slate-50 font-semibold mb-1">{project.title}</h2>
        <p className="text-slate-400 text-sm mb-4">{project.constituency} · MP {project.mp} · {project.category}</p>

        <div className="flex items-center gap-6 bg-slate-900 border border-slate-800 rounded-lg p-4 mb-5">
          <Gauge score={risk.score} gradeColor={risk.gradeColor} />
          <div>
            <div className={`text-sm font-semibold ${s.text} mb-1`}>Risk Grade {risk.grade}</div>
            <div className="text-slate-400 text-xs">Sanctioned {inr(project.sanctioned)}</div>
            <div className="text-slate-400 text-xs">Status: {project.status}</div>
            {project.overdueDays > 0 && <div className="text-red-400 text-xs">{project.overdueDays} days overdue</div>}
          </div>
        </div>

        <h3 className="text-slate-200 text-sm font-semibold mb-2">Why this score — factor attribution</h3>
        <div className="space-y-2 mb-5">
          {risk.factors.map((f, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-100 text-sm font-medium">{f.label}</span>
                {f.weight > 0 && <span className="text-xs font-mono text-slate-500">+{f.weight}</span>}
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">{f.detail}</p>
            </div>
          ))}
        </div>

        <h3 className="text-slate-200 text-sm font-semibold mb-2">Financial vs. physical progress</h3>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-5" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
              <Line type="monotone" dataKey="financial" stroke="#fb923c" strokeWidth={2} dot={false} name="Financial %" />
              <Line type="monotone" dataKey="physical" stroke="#2dd4bf" strokeWidth={2} dot={false} name="Physical %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <button
          onClick={() => setShowReport(true)}
          className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm rounded-lg py-2.5 transition-colors"
        >
          <FileText size={16} /> Generate inquiry memo
        </button>

        {showReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/70" onClick={() => setShowReport(false)} />
            <div className="relative bg-slate-900 border border-slate-800 rounded-lg max-w-lg w-full p-5">
              <pre className="text-slate-300 text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto font-mono">{reportText}</pre>
              <div className="flex gap-2 mt-4">
                <button onClick={downloadReport} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-semibold rounded px-3 py-2">
                  <Download size={14} /> Download .txt
                </button>
                <button onClick={() => setShowReport(false)} className="text-slate-400 text-sm px-3 py-2 hover:text-slate-200">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Contractor network graph — flags contractors spread across 3+          */
/* constituencies (cartel / clustering pattern)                           */
/* ---------------------------------------------------------------------- */
function ContractorGraph({ projects }) {
  const byContractor = {};
  projects.forEach((p) => {
    byContractor[p.contractor] = byContractor[p.contractor] || new Set();
    byContractor[p.contractor].add(p.constituency);
  });
  const contractors = Object.keys(byContractor);
  const W = 640, H = 460, cx = W / 2, cy = H / 2;
  const rInner = 90, rOuter = 200;

  const constPos = {};
  CONSTITUENCIES.forEach((c, i) => {
    const a = (i / CONSTITUENCIES.length) * 2 * Math.PI - Math.PI / 2;
    constPos[c] = { x: cx + rOuter * Math.cos(a), y: cy + rOuter * Math.sin(a) };
  });
  const contPos = {};
  contractors.forEach((c, i) => {
    const a = (i / contractors.length) * 2 * Math.PI - Math.PI / 2;
    contPos[c] = { x: cx + rInner * Math.cos(a), y: cy + rInner * Math.sin(a) };
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
        {contractors.map((c) =>
          [...byContractor[c]].map((constituency) => {
            const flagged = byContractor[c].size >= 3;
            return (
              <line
                key={c + constituency}
                x1={contPos[c].x} y1={contPos[c].y}
                x2={constPos[constituency].x} y2={constPos[constituency].y}
                stroke={flagged ? "#f87171" : "#334155"}
                strokeWidth={flagged ? 1.6 : 1}
                opacity={flagged ? 0.85 : 0.4}
              />
            );
          })
        )}
        {CONSTITUENCIES.map((c) => (
          <g key={c}>
            <circle cx={constPos[c].x} cy={constPos[c].y} r="6" fill="#0f172a" stroke="#2dd4bf" strokeWidth="1.5" />
            <text x={constPos[c].x} y={constPos[c].y - 11} textAnchor="middle" fontSize="10" fill="#94a3b8">{c}</text>
          </g>
        ))}
        {contractors.map((c) => {
          const flagged = byContractor[c].size >= 3;
          return (
            <g key={c}>
              <circle cx={contPos[c].x} cy={contPos[c].y} r={flagged ? 8 : 5.5} fill={flagged ? "#7f1d1d" : "#134e4a"} stroke={flagged ? "#f87171" : "#2dd4bf"} strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-900 border border-red-400 inline-block" /> Flagged contractor (3+ constituencies)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-900 border border-teal-400 inline-block" /> Normal contractor</span>
      </div>
      <div className="mt-3 space-y-1">
        {contractors.filter((c) => byContractor[c].size >= 3).map((c) => (
          <div key={c} className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1 inline-block mr-2">
            {c} — awarded in {byContractor[c].size} constituencies
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Simulated local AI assistant — answers by querying the same risk       */
/* engine output as the dashboard (no external API call).                 */
/* ---------------------------------------------------------------------- */
function answerQuestion(query, scored) {
  const q = query.toLowerCase();

  const byId = scored.find((p) => q.includes(p.id.toLowerCase()));
  if (byId) {
    return `${byId.id} (${byId.title}) is Grade ${byId.risk.grade}, score ${byId.risk.score}/100. Top factor: ${byId.risk.factors[0].label} — ${byId.risk.factors[0].detail}`;
  }

  const constituency = CONSTITUENCIES.find((c) => q.includes(c.toLowerCase()));
  if (constituency) {
    const local = scored.filter((p) => p.constituency === constituency);
    const avg = Math.round(local.reduce((s, p) => s + p.risk.score, 0) / local.length);
    const high = local.filter((p) => p.risk.score >= 55).length;
    return `${constituency} has ${local.length} tracked projects, average risk score ${avg}/100, and ${high} project(s) in D/F grade needing verification.`;
  }

  if (q.includes("highest risk") || q.includes("high risk") || q.includes("top risk")) {
    const top = [...scored].sort((a, b) => b.risk.score - a.risk.score).slice(0, 3);
    return "Highest-risk projects right now:\n" + top.map((p) => `• ${p.id} — ${p.constituency} — Grade ${p.risk.grade} (${p.risk.score})`).join("\n");
  }

  if (q.includes("delay")) {
    const delayed = scored.filter((p) => p.status === "Delayed");
    return `${delayed.length} projects are currently marked Delayed, worst overdue: ${Math.max(...delayed.map((p) => p.overdueDays), 0)} days.`;
  }

  if (q.includes("contractor")) {
    return "Ask me about a specific constituency, a project ID (e.g. MPLAD-1004), or say 'highest risk projects' — I read directly from the same risk engine that scores the dashboard.";
  }

  return "I can answer questions about a project ID, a constituency, or ask me for the 'highest risk projects' right now.";
}

function ChatAssistant({ scored }) {
  const [messages, setMessages] = useState([
    { role: "ai", text: "Ask me about any project ID, constituency, or say 'highest risk projects'. I reason over the same risk scores shown on the dashboard — this runs locally, no external call." },
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", text: input };
    const answer = { role: "ai", text: answerQuestion(input, scored) };
    setMessages((m) => [...m, userMsg, answer]);
    setInput("");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg flex flex-col h-[520px]">
      <div className="border-b border-slate-800 px-4 py-3 flex items-center gap-2 text-slate-200 text-sm font-medium">
        <MessageSquare size={16} className="text-teal-400" /> Ask Sansad-Rakshak
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line ${m.role === "ai" ? "bg-slate-800 text-slate-200" : "bg-teal-500 text-slate-950 ml-auto font-medium"}`}>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-800 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. Why is MPLAD-1004 high risk?"
          className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
        <button onClick={send} className="bg-teal-500 hover:bg-teal-400 text-slate-950 rounded px-3 flex items-center justify-center">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main App                                                                */
/* ---------------------------------------------------------------------- */
export default function SansadRakshak() {
  const [page, setPage] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [constFilter, setConstFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [resolved, setResolved] = useState(new Set());

  const projects = useMemo(() => generateProjects(64), []);

  const contractorCounts = useMemo(() => {
    const counts = {};
    projects.forEach((p) => { counts[p.contractor] = (counts[p.contractor] || 0) + 1; });
    return counts;
  }, [projects]);

  const scored = useMemo(
    () => projects.map((p) => ({ ...p, risk: computeRisk(p, contractorCounts) })),
    [projects, contractorCounts]
  );

  const kpis = useMemo(() => {
    const totalSanctioned = projects.reduce((s, p) => s + p.sanctioned, 0);
    const avgUtil = Math.round(projects.reduce((s, p) => s + p.financialProgress, 0) / projects.length);
    const highRisk = scored.filter((p) => p.risk.score >= 55).length;
    const delayed = projects.filter((p) => p.status === "Delayed").length;
    return { totalSanctioned, avgUtil, highRisk, delayed };
  }, [projects, scored]);

  const alerts = useMemo(() => {
    return scored
      .filter((p) => p.risk.score >= 55 || p.overdueDays > 100)
      .sort((a, b) => b.risk.score - a.risk.score)
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        project: p,
        severity: p.risk.score >= 75 ? "Critical" : "High",
        message: p.risk.factors[0].label,
      }));
  }, [scored]);

  const constituencyAgg = useMemo(() => {
    return CONSTITUENCIES.map((c) => {
      const local = scored.filter((p) => p.constituency === c);
      const avg = local.length ? Math.round(local.reduce((s, p) => s + p.risk.score, 0) / local.length) : 0;
      return { constituency: c, avg, count: local.length };
    });
  }, [scored]);

  const filtered = useMemo(() => {
    return scored.filter((p) => {
      if (search && !(p.title.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))) return false;
      if (gradeFilter !== "All" && p.risk.grade !== gradeFilter) return false;
      if (constFilter !== "All" && p.constituency !== constFilter) return false;
      return true;
    }).sort((a, b) => b.risk.score - a.risk.score);
  }, [scored, search, gradeFilter, constFilter]);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "map", label: "Risk Map", icon: MapIcon },
    { id: "alerts", label: "Alerts", icon: Bell },
    { id: "network", label: "Contractor Network", icon: Share2 },
    { id: "assistant", label: "AI Assistant", icon: MessageSquare },
  ];

  const gradeColorFor = (avg) => avg >= 75 ? "red" : avg >= 55 ? "orange" : avg >= 35 ? "amber" : avg >= 18 ? "teal" : "emerald";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-slate-800 flex flex-col p-4">
        <div className="flex items-center gap-2 mb-8 px-1">
          <ShieldAlert size={22} className="text-teal-400" />
          <div>
            <div className="font-display text-sm font-semibold text-slate-50 leading-tight">Sansad-Rakshak</div>
            <div className="text-[10px] text-slate-500 leading-tight">MPLAD Risk Intelligence</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                page === n.id ? "bg-teal-500/10 text-teal-300 border border-teal-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
              }`}
            >
              <n.icon size={16} /> {n.label}
              {n.id === "alerts" && alerts.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-mono">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto text-[10px] text-slate-600 px-1 leading-relaxed">
          Demo dataset — synthetic, seeded for reproducibility. Officer role: Field Verification Unit.
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {page === "dashboard" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="font-display text-xl font-semibold text-slate-50">Overview</h1>
                <p className="text-slate-400 text-sm">64 MPLAD projects across 10 constituencies · live risk scoring</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <KpiCard label="Total sanctioned" value={inr(kpis.totalSanctioned)} icon={IndianRupee} />
              <KpiCard label="Avg. fund utilization" value={`${kpis.avgUtil}%`} icon={ArrowUpRight} />
              <KpiCard label="High risk projects (D/F)" value={kpis.highRisk} sub="needs verification" trend="down" icon={AlertTriangle} />
              <KpiCard label="Delayed projects" value={kpis.delayed} sub="past deadline" trend="down" icon={Bell} />
            </div>

            <div className="grid grid-cols-3 gap-5">
              <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Constituency risk grid</h3>
                <div className="grid grid-cols-5 gap-2">
                  {constituencyAgg.map((c) => {
                    const color = gradeColorFor(c.avg);
                    const s = GRADE_STYLES[color];
                    return (
                      <button
                        key={c.constituency}
                        onClick={() => { setConstFilter(c.constituency); setPage("projects"); }}
                        className={`rounded-lg border ${s.border} ${s.bg} p-3 text-left hover:brightness-125 transition`}
                      >
                        <div className="text-xs text-slate-300 mb-1">{c.constituency}</div>
                        <div className={`font-mono text-lg font-semibold ${s.text}`}>{c.avg}</div>
                        <div className="text-[10px] text-slate-500">{c.count} projects</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Top alerts</h3>
                <div className="space-y-2">
                  {alerts.slice(0, 5).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a.project)}
                      className="w-full text-left flex items-start gap-2 bg-slate-950 border border-slate-800 rounded p-2.5 hover:border-teal-600 transition"
                    >
                      <AlertTriangle size={14} className={a.severity === "Critical" ? "text-red-400 mt-0.5" : "text-orange-400 mt-0.5"} />
                      <div>
                        <div className="text-xs font-mono text-slate-300">{a.id}</div>
                        <div className="text-[11px] text-slate-500">{a.message}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {page === "projects" && (
          <div>
            <h1 className="font-display text-xl font-semibold text-slate-50 mb-4">Projects</h1>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-3 py-2 flex-1 max-w-sm">
                <Search size={14} className="text-slate-500" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or ID"
                  className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none w-full" />
              </div>
              <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm text-slate-300">
                {["All", "A", "B", "C", "D", "F"].map((g) => <option key={g}>{g}</option>)}
              </select>
              <select value={constFilter} onChange={(e) => setConstFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-2 py-2 text-sm text-slate-300">
                <option>All</option>
                {CONSTITUENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-950 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5">Project</th>
                    <th className="text-left px-4 py-2.5">Constituency</th>
                    <th className="text-left px-4 py-2.5">Sanctioned</th>
                    <th className="text-left px-4 py-2.5">Progress</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">Risk</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} onClick={() => setSelected(p)} className="border-t border-slate-800 hover:bg-slate-800/50 cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="text-slate-200">{p.title}</div>
                        <div className="text-slate-500 text-xs font-mono">{p.id}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{p.constituency}</td>
                      <td className="px-4 py-2.5 text-slate-300 font-mono">{inr(p.sanctioned)}</td>
                      <td className="px-4 py-2.5 text-slate-400">F {p.financialProgress}% / P {p.physicalProgress}%</td>
                      <td className="px-4 py-2.5 text-slate-400">{p.status}</td>
                      <td className="px-4 py-2.5"><RiskBadge {...p.risk} /></td>
                      <td className="px-4 py-2.5 text-slate-600"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {page === "map" && (
          <div>
            <h1 className="font-display text-xl font-semibold text-slate-50 mb-1">Constituency risk map</h1>
            <p className="text-slate-400 text-sm mb-4">Aggregated average risk score per constituency — click a tile to drill into its projects.</p>
            <div className="grid grid-cols-5 gap-3">
              {constituencyAgg.map((c) => {
                const color = gradeColorFor(c.avg);
                const s = GRADE_STYLES[color];
                return (
                  <button key={c.constituency} onClick={() => { setConstFilter(c.constituency); setPage("projects"); }}
                    className={`rounded-lg border ${s.border} ${s.bg} p-5 text-left hover:brightness-125 transition h-32 flex flex-col justify-between`}>
                    <div className="text-slate-200 text-sm font-medium">{c.constituency}</div>
                    <div>
                      <div className={`font-mono text-3xl font-bold ${s.text}`}>{c.avg}</div>
                      <div className="text-slate-500 text-xs">{c.count} projects tracked</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {page === "alerts" && (
          <div>
            <h1 className="font-display text-xl font-semibold text-slate-50 mb-4">Alerts requiring verification</h1>
            <div className="space-y-2">
              {alerts.map((a) => {
                const isResolved = resolved.has(a.id);
                return (
                  <div key={a.id} className={`flex items-center justify-between bg-slate-900 border rounded-lg p-4 ${isResolved ? "border-slate-800 opacity-50" : "border-slate-800"}`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={16} className={a.severity === "Critical" ? "text-red-400 mt-0.5" : "text-orange-400 mt-0.5"} />
                      <div>
                        <div className="text-sm text-slate-200 font-medium">{a.project.title}</div>
                        <div className="text-xs text-slate-500 font-mono">{a.id} · {a.project.constituency}</div>
                        <div className="text-xs text-slate-400 mt-1">{a.message}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge {...a.project.risk} />
                      {!isResolved ? (
                        <button onClick={() => setResolved(new Set([...resolved, a.id]))}
                          className="text-xs bg-teal-500 hover:bg-teal-400 text-slate-950 font-medium rounded px-3 py-1.5">
                          Mark verified
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={14} /> Verified</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === "network" && (
          <div>
            <h1 className="font-display text-xl font-semibold text-slate-50 mb-1">Contractor network</h1>
            <p className="text-slate-400 text-sm mb-4">Contractors awarded projects across 3 or more constituencies are flagged for concentration review.</p>
            <ContractorGraph projects={projects} />
          </div>
        )}

        {page === "assistant" && (
          <div className="max-w-2xl">
            <h1 className="font-display text-xl font-semibold text-slate-50 mb-1">AI Assistant</h1>
            <p className="text-slate-400 text-sm mb-4">Query the risk engine in natural language.</p>
            <ChatAssistant scored={scored} />
          </div>
        )}
      </main>

      {selected && (
        <ProjectDrawer project={selected} risk={selected.risk} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
