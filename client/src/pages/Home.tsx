import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Bookmark,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Filter,
  Globe2,
  GraduationCap,
  Heart,
  Languages,
  LayoutGrid,
  ListFilter,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calculateAnnualCost, convertCurrency, monthlyCost, type SupportedCurrency } from "@shared/edupath";
import { trpc } from "@/lib/trpc";
import jsPDF from "jspdf";

type View = "discover" | "compare" | "calculator" | "saved";

type University = {
  id: number;
  name: string;
  short: string;
  country: string;
  city: string;
  type: string;
  tuition: number;
  living: number;
  total: number;
  rating: number;
  reviews: number;
  scholarship: string;
  language: string;
  intake: string;
  deadline: string;
  tags: string[];
  accent: string;
  description: string;
  verified: boolean;
  programs?: string[];
  source?: string;
  website?: string;
  programDetails?: { name: string; tuitionAmount: number; tuitionCurrency: string; tuitionPeriod: string; academicYear: string; applicationDeadline: string; deadlineNote: string; sourceUrl: string; lastVerified?: string }[];
};

type ProgramDetail = NonNullable<University["programDetails"]>[number];
type SavedProgram = ProgramDetail & { key: string; universityId: number; universityName: string; country: string; accent: string; savedAt: string };
type AuditResult = { universityKey: string; programName: string; sourceUrl: string; lastVerified: string; verificationAgeDays: number; httpStatus: number; reachable: boolean; contentChangedSinceLastAudit: boolean | null; tuitionSignalFound: boolean; deadlineSignalFound: boolean; reviewRecommended: boolean; error?: string };

export function deadlineStatus(deadline: string) {
  const match = deadline.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (!match) return { days: null, approaching: false, past: false, label: "Deadline timing varies" };
  const target = new Date(`${match[1]} ${match[2]} ${match[3]} 23:59:59`);
  const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
  return { days, approaching: days >= 0 && days <= 30, past: days < 0, label: days < 0 ? "Deadline passed" : days === 0 ? "Due today" : `${days} days left` };
}

const universities: University[] = [
  {
    id: 1,
    name: "University of Debrecen",
    short: "UD",
    country: "Hungary",
    city: "Debrecen",
    type: "Public research university",
    tuition: 7200,
    living: 4200,
    total: 11400,
    rating: 4.7,
    reviews: 86,
    scholarship: "Up to 50%",
    language: "English",
    intake: "September 2027",
    deadline: "15 May 2027",
    tags: ["Medicine", "Engineering", "Business"],
    accent: "from-amber-300 via-orange-400 to-rose-400",
    description: "A globally recognized public university with generous scholarships and a large international student community.",
    verified: true,
  },
  {
    id: 2,
    name: "Suleyman Demirel University",
    short: "SDU",
    country: "Turkey",
    city: "Isparta",
    type: "Private university",
    tuition: 3900,
    living: 3600,
    total: 7500,
    rating: 4.5,
    reviews: 54,
    scholarship: "25–75%",
    language: "English / Turkish",
    intake: "October 2027",
    deadline: "30 August 2027",
    tags: ["Computer Science", "Design", "Health"],
    accent: "from-cyan-300 via-sky-500 to-indigo-500",
    description: "A welcoming campus in a student-friendly city, known for accessible tuition and strong applied programs.",
    verified: true,
  },
  {
    id: 3,
    name: "University of Pécs",
    short: "PÉCS",
    country: "Hungary",
    city: "Pécs",
    type: "Public research university",
    tuition: 8900,
    living: 4600,
    total: 13500,
    rating: 4.8,
    reviews: 112,
    scholarship: "Stipendium Hungaricum",
    language: "English",
    intake: "September 2027",
    deadline: "31 January 2027",
    tags: ["Medicine", "Arts", "Psychology"],
    accent: "from-violet-300 via-fuchsia-500 to-pink-500",
    description: "Hungary's oldest university combines a vibrant city experience with internationally accredited degrees.",
    verified: true,
  },
  {
    id: 4,
    name: "University of Lodz",
    short: "UŁ",
    country: "Poland",
    city: "Lodz",
    type: "Public university",
    tuition: 4300,
    living: 3900,
    total: 8200,
    rating: 4.4,
    reviews: 71,
    scholarship: "Merit-based",
    language: "English",
    intake: "October 2027",
    deadline: "1 July 2027",
    tags: ["Business", "Economics", "Data"],
    accent: "from-lime-300 via-emerald-500 to-teal-500",
    description: "An affordable, urban option with English-taught programs and a growing startup ecosystem around campus.",
    verified: true,
  },
  {
    id: 5,
    name: "University of Northampton",
    short: "UON",
    country: "United Kingdom",
    city: "Northampton",
    type: "Public university",
    tuition: 14800,
    living: 8200,
    total: 23000,
    rating: 4.3,
    reviews: 63,
    scholarship: "£2,000 award",
    language: "English",
    intake: "January 2028",
    deadline: "15 November 2027",
    tags: ["Business", "Computing", "Education"],
    accent: "from-slate-300 via-slate-600 to-indigo-700",
    description: "A practical UK university with career-focused degrees and a lower cost of living than the largest cities.",
    verified: true,
  },
  {
    id: 6,
    name: "Asia Pacific University",
    short: "APU",
    country: "Malaysia",
    city: "Kuala Lumpur",
    type: "Private university",
    tuition: 7600,
    living: 5000,
    total: 12600,
    rating: 4.6,
    reviews: 95,
    scholarship: "Up to 30%",
    language: "English",
    intake: "March 2027",
    deadline: "15 January 2027",
    tags: ["Technology", "Cybersecurity", "Business"],
    accent: "from-red-300 via-orange-500 to-yellow-400",
    description: "A technology-forward campus in Kuala Lumpur with strong employer links and a diverse international cohort.",
    verified: true,
  },
];

const countries = ["All destinations", "Hungary", "Turkey", "Poland", "United Kingdom", "Malaysia", "Germany", "United Arab Emirates"];

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
      <Star className="h-3.5 w-3.5 fill-[#f5b544] text-[#f5b544]" /> {value.toFixed(1)}
    </span>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#102b2a] text-[#f6f0e4] shadow-[0_8px_20px_rgba(16,43,42,0.2)]">
        <GraduationCap className="h-5 w-5" strokeWidth={1.8} />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#f5b544]" />
      </div>
      <div className="leading-none">
        <div className="text-[17px] font-bold tracking-[-0.04em] text-[#102b2a]">edupath</div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#71918a]">your next chapter</div>
      </div>
    </div>
  );
}

function TopBar({ view, setView, savedCount, compareCount, locale, setLocale }: { view: View; setView: (view: View) => void; savedCount: number; compareCount: number; locale: "en" | "ar"; setLocale: (locale: "en" | "ar") => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems: { id: View; label: string; icon: typeof Search }[] = [
    { id: "discover", label: "Discover", icon: Search },
    { id: "compare", label: "Compare", icon: ArrowDownUp },
    { id: "calculator", label: "Cost calculator", icon: Calculator },
    { id: "saved", label: "Saved", icon: Bookmark },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-[#dfe8e1]/90 bg-[#f7f8f4]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between px-5 lg:px-10">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const count = item.id === "saved" ? savedCount : item.id === "compare" ? compareCount : 0;
              return (
                <button key={item.id} onClick={() => setView(item.id)} className={cn("nav-pill", view === item.id && "nav-pill-active")}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {count > 0 && <span className="ml-1 rounded-full bg-[#e1f0e8] px-1.5 py-0.5 text-[10px] font-bold text-[#1a5c49]">{count}</span>}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <button className="lang-switch" onClick={() => setLocale(locale === "en" ? "ar" : "en")}><Languages className="h-4 w-4" /> {locale === "en" ? "EN" : "العربية"} <ChevronDown className="h-3.5 w-3.5" /></button>
          <Button className="rounded-full bg-[#102b2a] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(16,43,42,0.16)] hover:bg-[#1a4541]" onClick={() => window.alert("Sign-in flow is ready to connect to Manus OAuth.")}>Sign in</Button>
        </div>
        <button className="rounded-xl p-2 text-[#102b2a] hover:bg-white lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open navigation">
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {menuOpen && <div className="border-t border-[#dfe8e1] bg-[#f7f8f4] px-5 pb-4 pt-3 lg:hidden">
        <div className="grid gap-1">
          {navItems.map((item) => <button key={item.id} onClick={() => { setView(item.id); setMenuOpen(false); }} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold", view === item.id ? "bg-[#e5f1e9] text-[#1a5c49]" : "text-[#506762]")}><item.icon className="h-4 w-4" />{item.label}</button>)}
        </div>
      </div>}
    </header>
  );
}

function Hero({ onExplore }: { onExplore: () => void }) {
  return (
    <section className="hero-surface relative overflow-hidden px-5 pb-12 pt-14 lg:px-10 lg:pb-16 lg:pt-20">
      <div className="hero-grid" />
      <div className="relative mx-auto grid max-w-[1440px] items-end gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="max-w-3xl">
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Made for ambitious students from MENA</div>
          <h1 className="mt-5 max-w-3xl text-[clamp(2.9rem,6vw,5.7rem)] font-semibold leading-[0.95] tracking-[-0.075em] text-[#102b2a]">Find the right <span className="serif-italic text-[#c67d3e]">path</span> to your future.</h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#58716b] lg:text-lg">Compare affordable universities, understand the real cost, and make your next move with confidence.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button onClick={onExplore} className="group rounded-full bg-[#102b2a] px-6 py-6 text-[15px] font-semibold text-white hover:bg-[#1c4b46]">Explore universities <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></Button>
            <button onClick={onExplore} className="rounded-full border border-[#b8cbc1] bg-[#f7f8f4]/60 px-6 py-3 text-[15px] font-semibold text-[#1a5c49] hover:bg-white">How it works</button>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-[#69827b]"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#2d8067]" /> Verified information</span><span className="inline-flex items-center gap-2"><Zap className="h-4 w-4 text-[#c67d3e]" /> Updated daily</span><span className="inline-flex items-center gap-2"><Globe2 className="h-4 w-4 text-[#2d8067]" /> 10+ destinations</span></div>
        </div>
        <div className="relative hidden min-h-[310px] lg:block">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-note note-one"><span className="note-icon bg-[#f7d79a]"><Target className="h-4 w-4" /></span><div><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#69827b]">Your fit score</span><strong className="mt-1 block text-[23px] tracking-[-0.05em] text-[#102b2a]">92%</strong></div></div>
          <div className="hero-note note-two"><span className="note-icon bg-[#c8e6d5]"><Calculator className="h-4 w-4" /></span><div><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#69827b]">Est. annual cost</span><strong className="mt-1 block text-[18px] tracking-[-0.05em] text-[#102b2a]">$8,200</strong></div></div>
          <div className="hero-card absolute bottom-0 right-[15%] w-[250px] rotate-[5deg] rounded-[24px] bg-[#102b2a] p-5 text-white shadow-[0_30px_60px_rgba(16,43,42,0.22)]"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5b544] text-[#102b2a]"><GraduationCap className="h-5 w-5" /></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-[#dcefe5]">Top match</span></div><div className="mt-12 text-[10px] uppercase tracking-[0.18em] text-[#a7c8b9]">University of Debrecen</div><div className="mt-2 text-xl font-semibold tracking-[-0.05em]">Build a bigger future.</div><div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#c3ddd1]"><span>Hungary</span><span className="font-bold text-[#f5c56b]">$11,400 / year</span></div></div>
        </div>
      </div>
    </section>
  );
}

function UniversityCard({ university, saved, compared, onSave, onCompare, onDetails, savedProgramKeys = [], onSaveProgram = () => {} }: { university: University; saved: boolean; compared: boolean; onSave: () => void; onCompare: () => void; onDetails: () => void; savedProgramKeys?: string[]; onSaveProgram?: (program: ProgramDetail) => void }) {
  return (
    <article className="university-card group">
      <div className={cn("relative h-[116px] overflow-hidden rounded-[18px] bg-gradient-to-br", university.accent)}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 0 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-sm font-black tracking-[-0.06em] text-[#173f3b] shadow-sm backdrop-blur">{university.short}</div>
        <div className="absolute bottom-3 left-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">{university.country} · {university.city}</div>
        <button onClick={onSave} className={cn("absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition", saved ? "bg-white text-[#c67d3e]" : "bg-black/10 text-white hover:bg-white hover:text-[#c67d3e]")} aria-label={saved ? "Remove from saved" : "Save university"}><Bookmark className={cn("h-4 w-4", saved && "fill-current")} /></button>
      </div>
      <div className="px-1 pt-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-[17px] font-bold tracking-[-0.04em] text-[#102b2a]">{university.name}</h3><p className="mt-1 text-xs text-[#758b84]">{university.type}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="verified-date-badge"><ShieldCheck className="h-3 w-3" /> Last verified {university.programDetails?.[0]?.lastVerified ?? "2026-09-19"}</span>{university.programDetails?.[0]?.sourceUrl && <a href={university.programDetails[0].sourceUrl} target="_blank" rel="noreferrer" className="source-link-badge"><ExternalLink className="h-3 w-3" /> Official source</a>}</div></div><Rating value={university.rating} /></div>
        <p className="mt-3 line-clamp-2 text-sm leading-5 text-[#5e756e]">{university.description}</p>
        {university.programs?.length ? <div className="mt-3 rounded-xl bg-[#f4f8f4] px-3 py-2"><span className="label-xs">Programs found</span><p className="mt-1 line-clamp-1 text-xs font-semibold text-[#386255]">{university.programs.join(" · ")}</p></div> : null}
        <div className="mt-4 grid grid-cols-2 gap-2 border-y border-[#e7ece6] py-3"><div><span className="label-xs">Verified program tuition</span><strong className="mt-1 block text-sm font-bold text-[#102b2a]">{university.programDetails?.[0] ? money(university.programDetails[0].tuitionAmount, university.programDetails[0].tuitionCurrency) : money(university.tuition)}</strong><span className="mt-1 block text-[10px] text-[#849991]">{university.programDetails?.[0]?.tuitionPeriod ?? "Program basis"}</span></div><div><span className="label-xs">Application deadline</span><strong className="mt-1 block text-xs font-bold leading-4 text-[#2d8067]">{university.programDetails?.[0]?.applicationDeadline ?? university.deadline}</strong><span className="mt-1 block text-[10px] text-[#849991]">{university.programDetails?.[0]?.academicYear ?? university.intake}</span></div></div>
        {university.programDetails?.length ? <div className="mt-3 rounded-xl border border-[#e7ece6] bg-white/70 px-3 py-2"><span className="label-xs">Verified program costs · Save a program</span><div className="mt-1 grid gap-2">{university.programDetails.slice(0, 3).map(program => { const key = `${university.id}:${program.name}`; const status = deadlineStatus(program.applicationDeadline); const isSaved = savedProgramKeys.includes(key); return <div key={program.name} className="program-row"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-[#386255]">{program.name}</p><p className="mt-0.5 text-[10px] font-bold text-[#102b2a]">{money(program.tuitionAmount, program.tuitionCurrency)} <span className="font-normal text-[#849991]">{program.tuitionPeriod}</span></p></div><div className="flex shrink-0 items-center gap-1.5"><span title={program.deadlineNote} className={cn("deadline-chip", status.approaching && "deadline-chip-urgent", status.past && "deadline-chip-past")}><Clock3 className="h-3 w-3" />{program.applicationDeadline}</span><button title={isSaved ? "Remove saved program" : "Save program"} onClick={() => onSaveProgram(program)} className={cn("save-program-button", isSaved && "save-program-button-active")}><Bookmark className={cn("h-3.5 w-3.5", isSaved && "fill-current")} /></button></div></div>})}</div><a href={university.programDetails[0].sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#1a5c49] hover:underline">Official source <ExternalLink className="h-3 w-3" /></a></div> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">{university.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}{university.source && <span className="tag tag-live">{university.source.includes("HipoLabs") ? "Live data" : "Verified"}</span>}</div>
        <div className="mt-5 flex items-center justify-between gap-3"><button onClick={onCompare} className={cn("compare-button", compared && "compare-button-active")}><span className={cn("flex h-4 w-4 items-center justify-center rounded-[4px] border", compared ? "border-[#2d8067] bg-[#2d8067] text-white" : "border-[#adc2b7] bg-white")}>{compared && <Check className="h-3 w-3" />}</span>Compare</button><button onClick={onDetails} className="inline-flex items-center gap-1 text-xs font-bold text-[#1a5c49] hover:text-[#102b2a]">View details <ChevronRight className="h-3.5 w-3.5" /></button></div>
      </div>
    </article>
  );
}

function FilterPanel({ country, setCountry, budget, setBudget }: { country: string; setCountry: (value: string) => void; budget: number; setBudget: (value: number) => void }) {
  return <aside className="filter-panel"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-[#102b2a]"><SlidersHorizontal className="h-4 w-4 text-[#2d8067]" /> Refine your search</div><button className="text-xs font-semibold text-[#779088]" onClick={() => { setCountry("All destinations"); setBudget(25000); }}>Reset</button></div>
    <div className="mt-6"><label className="label-xs">Where do you want to go?</label><div className="relative mt-2"><Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#759089]" /><select value={country} onChange={e => setCountry(e.target.value)} className="filter-select pl-9">{countries.map(option => <option key={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#759089]" /></div></div>
    <div className="mt-7"><div className="flex items-center justify-between"><label className="label-xs">Max annual budget</label><span className="text-sm font-bold text-[#1a5c49]">{money(budget)}</span></div><input type="range" min="6000" max="25000" step="500" value={budget} onChange={e => setBudget(Number(e.target.value))} className="mt-4 w-full accent-[#2d8067]" /><div className="mt-1 flex justify-between text-[10px] font-semibold text-[#9aaeA4]"><span>$6k</span><span>$25k+</span></div></div>
    <div className="mt-7"><label className="label-xs">Study level</label><div className="mt-2 grid grid-cols-2 gap-2"><button className="filter-chip filter-chip-active">Bachelor's</button><button className="filter-chip">Master's</button></div></div>
    <div className="mt-7"><label className="label-xs">Language of study</label><div className="mt-2 grid gap-2"><label className="check-row"><span className="check-box check-box-on"><Check className="h-3 w-3" /></span>English <span className="ml-auto text-xs text-[#9aaeA4]">182</span></label><label className="check-row"><span className="check-box" />Arabic-friendly <span className="ml-auto text-xs text-[#9aaeA4]">64</span></label></div></div>
    <div className="mt-7 rounded-2xl bg-[#e8f3ec] p-4"><div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#2d8067]"><CircleHelp className="h-4 w-4" /></div><div><p className="text-xs font-bold text-[#1a5c49]">Not sure where to start?</p><p className="mt-1 text-xs leading-4 text-[#638078]">Take our 2-minute fit quiz and get personalized matches.</p><button className="mt-3 text-xs font-bold text-[#1a5c49] underline underline-offset-4">Start the quiz <ArrowRight className="ml-1 inline h-3 w-3" /></button></div></div></div>
  </aside>;
}

function Discover({ savedIds, compareIds, setSavedIds, setCompareIds, setView, locale, savedPrograms, setSavedPrograms }: { savedIds: number[]; compareIds: number[]; setSavedIds: React.Dispatch<React.SetStateAction<number[]>>; setCompareIds: React.Dispatch<React.SetStateAction<number[]>>; setView: (view: View) => void; locale: "en" | "ar"; savedPrograms: SavedProgram[]; setSavedPrograms: React.Dispatch<React.SetStateAction<SavedProgram[]>> }) {
  const [query, setQuery] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiIds, setAiIds] = useState<number[] | null>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [country, setCountry] = useState("All destinations");
  const [budget, setBudget] = useState(25000);
  const [sort, setSort] = useState("Recommended");
  const [isFiltering, setIsFiltering] = useState(false);
  const [selected, setSelected] = useState<University | null>(null);
  const rtlText = locale === "ar";
  const directoryQuery = trpc.university.directory.useQuery();
  const aiSearch = trpc.university.aiSearch.useMutation();
  const liveUniversities = useMemo<University[]>(() => directoryQuery.data?.map((university, index) => ({
    id: university.id,
    name: university.name,
    short: university.name.split(" ").map(word => word[0]).join("").slice(0, 3).toUpperCase(),
    country: university.country,
    city: university.city,
    type: "University directory result",
    tuition: university.tuition,
    living: university.total - university.tuition,
    total: university.total,
    rating: 4.4 + ((index % 5) / 10),
    reviews: 20 + index * 3,
    scholarship: "Check university",
    language: university.language,
    intake: "Check university",
    deadline: "Check university",
    tags: university.subjects.slice(0, 3),
    accent: universities[index % universities.length].accent,
    description: `${university.programs.slice(0, 2).join(" · ")} · Live directory record`,
    verified: university.source.includes("verified"),
    programs: [...university.programs],
    source: university.source,
    website: "website" in university ? university.website : undefined,
    programDetails: university.programDetails ? [...university.programDetails] : undefined,
  })) ?? universities, [directoryQuery.data]);
  useEffect(() => {
    setIsFiltering(true);
    const timer = window.setTimeout(() => setIsFiltering(false), 260);
    return () => window.clearTimeout(timer);
  }, [country, budget, query, sort]);
  const filtered = useMemo(() => liveUniversities.filter(u => (aiIds ? aiIds.includes(u.id) : true) && (country === "All destinations" || u.country === country) && (u.programDetails?.[0]?.tuitionCurrency !== "USD" || u.total <= budget) && `${u.name} ${u.country} ${u.city} ${u.tags.join(" ")} ${(u.programs ?? []).join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "Lowest cost" ? a.total - b.total : sort === "Highest rated" ? b.rating - a.rating : a.id - b.id), [aiIds, country, budget, query, sort, liveUniversities]);
  const toggle = (id: number, setter: React.Dispatch<React.SetStateAction<number[]>>, max?: number) => setter(current => current.includes(id) ? current.filter(item => item !== id) : max && current.length >= max ? current : [...current, id]);
  const saveProgram = (university: University, program: ProgramDetail) => setSavedPrograms(current => { const key = `${university.id}:${program.name}`; return current.some(item => item.key === key) ? current.filter(item => item.key !== key) : [...current, { ...program, key, universityId: university.id, universityName: university.name, country: university.country, accent: university.accent, savedAt: new Date().toISOString() }]; });
  const runAiSearch = async () => {
    if (aiQuery.trim().length < 3) return;
    setIsFiltering(true);
    const result = await aiSearch.mutateAsync({ query: aiQuery.trim(), catalog: liveUniversities.map(university => ({ id: university.id, name: university.name, country: university.country, city: university.city, tuition: university.tuition, total: university.total, subjects: university.tags, programs: university.programs ?? [], language: university.language, source: university.source ?? "EduPath", website: university.website })) });
    setAiIds(result.universityIds);
    setAiSummary(result.summary);
    setQuery("");
    setIsFiltering(false);
  };
  return <>
    <Hero onExplore={() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" })} />
    <main id="results" className="mx-auto max-w-[1440px] px-5 py-12 lg:px-10 lg:py-16"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="eyebrow eyebrow-soft"><LayoutGrid className="h-3.5 w-3.5" /> University directory</div><h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-[#102b2a] lg:text-4xl">Good options, <span className="serif-italic text-[#c67d3e]">within reach.</span></h2><p className="mt-2 text-sm text-[#71877f]">Explore {universities.length * 80}+ universities selected for value, quality, and opportunity.</p></div><div className="flex items-center gap-2 text-xs font-semibold text-[#71877f]"><span className="hidden sm:inline">Showing {filtered.length} of {universities.length * 80}+ matches</span><div className="view-toggle"><button className="view-toggle-active"><LayoutGrid className="h-4 w-4" /></button><button><ListFilter className="h-4 w-4" /></button></div></div></div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]"><FilterPanel country={country} setCountry={setCountry} budget={budget} setBudget={setBudget} /><section><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="search-wrap"><Search className="h-4 w-4 text-[#759089]" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={rtlText ? "ابحث عن جامعة أو برنامج أو تخصص" : "Search universities, countries, or programs"} /></div><div className="flex items-center gap-2"><span className="hidden text-xs font-semibold text-[#879a93] sm:inline">Sort by</span><select value={sort} onChange={e => setSort(e.target.value)} className="sort-select"><option>Recommended</option><option>Lowest cost</option><option>Highest rated</option></select></div></div>
          <div className="ai-search-card"><div className="flex items-start gap-3"><div className="ai-search-icon"><Sparkles className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-[#102b2a]">Search like you think</h3><span className="ai-badge">AI powered</span></div><p className="mt-1 text-xs text-[#69827b]">Try “English-taught medicine in Europe under $14k”</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><div className="ai-input-wrap"><Sparkles className="h-4 w-4 shrink-0 text-[#c67d3e]" /><input value={aiQuery} onChange={e => { setAiQuery(e.target.value); setAiIds(null); setAiSummary(""); }} onKeyDown={e => { if (e.key === "Enter") void runAiSearch(); }} placeholder="Describe your ideal university..." /><button onClick={() => setAiQuery("Affordable English-taught business programs in Europe")} className="hidden text-[10px] font-bold text-[#7c938a] hover:text-[#1a5c49] sm:block">Example</button></div><Button onClick={() => void runAiSearch()} disabled={aiSearch.isPending || aiQuery.trim().length < 3} className="rounded-xl bg-[#c67d3e] px-4 text-xs font-bold text-white hover:bg-[#b56d31] disabled:cursor-not-allowed disabled:opacity-50">{aiSearch.isPending ? <span className="inline-flex items-center gap-2"><span className="button-spinner" /> Thinking</span> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Find my matches</>}</Button></div>{aiSummary && <p className="mt-2 text-xs font-semibold text-[#2d8067]">{aiSummary}</p>}</div></div></div>
          {isFiltering || aiSearch.isPending ? <div className="loading-grid" aria-live="polite"><div className="loading-message"><span className="loading-spinner" /><div><strong>{aiSearch.isPending ? "Finding your best matches" : "Refreshing your matches"}</strong><span>Comparing costs, destinations, and study options…</span></div></div><div className="grid gap-x-6 gap-y-8 xl:grid-cols-2">{[1, 2, 3, 4].map(card => <div className="skeleton-card" key={card}><div className="skeleton h-[116px] rounded-[18px]" /><div className="space-y-3 px-1 pt-4"><div className="skeleton h-5 w-3/4" /><div className="skeleton h-4 w-1/3" /><div className="skeleton h-10 w-full" /><div className="skeleton h-8 w-2/3" /></div></div>)}</div></div> : filtered.length === 0 ? <div className="empty-state"><div className="empty-state-icon"><Search className="h-7 w-7" /></div><h3 className="mt-4 text-lg font-bold text-[#102b2a]">No universities match this search</h3><p className="mt-1 max-w-md text-sm leading-6 text-[#6f877f]">Try widening your budget, choosing another destination, or asking EduPath in plain language.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button onClick={() => { setCountry("All destinations"); setBudget(25000); setQuery(""); setAiIds(null); }} className="rounded-full border border-[#cbded1] bg-white px-4 py-2 text-xs font-bold text-[#1a5c49]">Clear filters</button><button onClick={() => setAiQuery("Affordable universities in Europe under $12k")} className="rounded-full bg-[#e8f3ec] px-4 py-2 text-xs font-bold text-[#1a5c49]">Try an AI search</button></div></div> : <div className="grid gap-x-6 gap-y-8 xl:grid-cols-2">{filtered.map((university, index) => <div key={university.id} className="animate-rise" style={{ animationDelay: `${index * 45}ms` }}><UniversityCard university={university} saved={savedIds.includes(university.id)} compared={compareIds.includes(university.id)} savedProgramKeys={savedPrograms.map(program => program.key)} onSaveProgram={program => saveProgram(university, program)} onSave={() => toggle(university.id, setSavedIds)} onCompare={() => toggle(university.id, setCompareIds, 3)} onDetails={() => setSelected(university)} /></div>)}</div>}
        </section></div>
    </main>
    {compareIds.length > 0 && <div className="compare-dock"><div><span className="text-xs font-bold uppercase tracking-[0.16em] text-[#86a59a]">Ready to compare</span><p className="mt-1 text-sm font-semibold text-white">{compareIds.length} {compareIds.length === 1 ? "university" : "universities"} selected <span className="font-normal text-[#9fc2b2]">· Add up to 3</span></p></div><div className="flex items-center gap-3"><button onClick={() => setCompareIds([])} className="text-xs font-semibold text-[#a7c8b9] hover:text-white">Clear</button><Button onClick={() => setView("compare")} className="rounded-full bg-[#f5b544] px-4 text-xs font-bold text-[#102b2a] hover:bg-[#ffca66]">Compare now <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></div></div>}
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="detail-modal" onClick={e => e.stopPropagation()}><button onClick={() => setSelected(null)} className="absolute right-5 top-5 rounded-full bg-white/80 p-2 text-[#5e756e] hover:bg-white"><X className="h-4 w-4" /></button><div className={cn("h-32 rounded-[22px] bg-gradient-to-br", selected.accent)}><div className="flex h-full items-end p-5"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/85 text-base font-black text-[#173f3b]">{selected.short}</div></div></div><div className="p-6"><div className="eyebrow eyebrow-soft">{selected.country} · {selected.city}</div><h3 className="mt-3 text-2xl font-bold tracking-[-0.06em] text-[#102b2a]">{selected.name}</h3><p className="mt-3 text-sm leading-6 text-[#5e756e]">{selected.description}</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="detail-stat"><span className="label-xs">Annual cost</span><strong>{money(selected.total)}</strong></div><div className="detail-stat"><span className="label-xs">Scholarship</span><strong>{selected.scholarship}</strong></div><div className="detail-stat"><span className="label-xs">Next intake</span><strong>{selected.intake}</strong></div><div className="detail-stat"><span className="label-xs">Application deadline</span><strong>{selected.deadline}</strong></div></div><div className="mt-6 flex gap-3"><Button onClick={() => { toggle(selected.id, setSavedIds); setSelected(null); }} className="flex-1 rounded-full bg-[#102b2a] text-white hover:bg-[#1c4b46]"><Bookmark className="mr-2 h-4 w-4" />{savedIds.includes(selected.id) ? "Saved" : "Save university"}</Button><button onClick={() => window.alert("University website link placeholder")} className="rounded-full border border-[#cddbd3] px-4 text-sm font-bold text-[#1a5c49]"><ExternalLink className="h-4 w-4" /></button></div></div></div></div>}
  </>;
}

function exportComparisonPdf(selected: University[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(16, 43, 42);
  doc.rect(0, 0, pageWidth, 118, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("EduPath", 44, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("University comparison shortlist", 44, 70);
  doc.setTextColor(16, 43, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Your side-by-side comparison", 44, 160);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(91, 115, 106);
  doc.text(`Generated ${new Date().toLocaleDateString()} · Estimates shown in USD`, 44, 180);
  let y = 224;
  selected.forEach((university, index) => {
    doc.setFillColor(index % 2 === 0 ? 241 : 247, 248, 244);
    doc.roundedRect(44, y - 20, pageWidth - 88, 126, 12, 12, "F");
    doc.setTextColor(26, 92, 73);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`${index + 1}. ${university.name}`, 60, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(91, 115, 106);
    doc.text(`${university.country} · ${university.city} · ${university.type}`, 60, y + 25);
    doc.setTextColor(16, 43, 42);
    doc.setFont("helvetica", "bold");
    doc.text("Annual tuition", 60, y + 54);
    doc.text("Total estimate", 190, y + 54);
    doc.text("Scholarship", 320, y + 54);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(58, 92, 81);
    doc.text(money(university.tuition), 60, y + 72);
    doc.text(money(university.total), 190, y + 72);
    doc.text(university.scholarship, 320, y + 72);
    doc.setFontSize(9);
    doc.setTextColor(111, 135, 127);
    doc.text(`Rating ${university.rating}/5 · ${university.language} · Next intake: ${university.intake}`, 60, y + 94);
    y += 148;
  });
  doc.setFontSize(9);
  doc.setTextColor(125, 147, 139);
  doc.text("EduPath estimates are for planning only. Confirm the latest costs and deadlines with each university.", 44, 790);
  doc.save("edupath-university-comparison.pdf");
}

function Compare({ compareIds, setCompareIds, setView }: { compareIds: number[]; setCompareIds: React.Dispatch<React.SetStateAction<number[]>>; setView: (view: View) => void }) {
  const selected = universities.filter(u => compareIds.includes(u.id));
  const comparisonColumns = { gridTemplateColumns: `160px repeat(${selected.length}, minmax(250px, 1fr))` };
  return <main className="mx-auto max-w-[1440px] px-5 py-12 lg:px-10 lg:py-16"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="eyebrow eyebrow-soft"><ArrowDownUp className="h-3.5 w-3.5" /> Side-by-side comparison</div><h1 className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-[#102b2a]">See the difference <span className="serif-italic text-[#c67d3e]">clearly.</span></h1><p className="mt-2 text-sm text-[#71877f]">Compare the factors that matter most before you decide.</p></div><div className="flex flex-wrap items-center gap-4"><button onClick={() => setView("discover")} className="inline-flex items-center gap-2 text-sm font-bold text-[#1a5c49]"><Plus className="h-4 w-4" /> Add another university</button>{selected.length >= 2 && <button onClick={() => exportComparisonPdf(selected)} className="inline-flex items-center gap-2 rounded-full border border-[#bfd5c6] bg-white px-4 py-2.5 text-xs font-bold text-[#1a5c49] shadow-sm hover:bg-[#edf4ee]"><ArrowDownUp className="h-3.5 w-3.5" /> Export PDF</button>}</div></div>{selected.length < 2 ? <div className="empty-state mt-10"><ArrowDownUp className="h-8 w-8 text-[#8cad9d]" /><h3 className="mt-4 text-lg font-bold text-[#102b2a]">Choose at least two universities</h3><p className="mt-1 max-w-sm text-sm text-[#6f877f]">Select universities from the directory to unlock a side-by-side view.</p><Button onClick={() => setView("discover")} className="mt-5 rounded-full bg-[#102b2a] text-white">Browse universities</Button></div> : <div className="comparison-table-wrap mt-10"><div className="comparison-grid comparison-head" style={comparisonColumns}><div className="comparison-label">University</div>{selected.map(u => <div key={u.id} className="comparison-university"><div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-xs font-black text-white", u.accent)}>{u.short}</div><div><h3>{u.name}</h3><p>{u.country} · {u.city}</p></div><button onClick={() => setCompareIds(compareIds.filter(id => id !== u.id))} className="ml-auto rounded-full p-1 text-[#8da098] hover:bg-[#edf4ee] hover:text-[#c66b55]"><X className="h-4 w-4" /></button></div>)}</div>{[["Annual tuition", ...selected.map(u => money(u.tuition))], ["Living costs", ...selected.map(u => money(u.living))], ["Total estimate", ...selected.map(u => money(u.total))], ["Scholarship", ...selected.map(u => u.scholarship)], ["Rating", ...selected.map(u => `${u.rating} / 5 · ${u.reviews} reviews`)], ["Language", ...selected.map(u => u.language)], ["Next intake", ...selected.map(u => u.intake)], ["Deadline", ...selected.map(u => u.deadline)]].map((row, i) => <div className={cn("comparison-grid comparison-row", i === 2 && "comparison-highlight")} style={comparisonColumns} key={row[0]}><div className="comparison-label">{row[0]}</div>{row.slice(1).map((cell, index) => <div key={index} className="comparison-cell">{i === 4 && <Star className="mr-1.5 inline h-3.5 w-3.5 fill-[#f5b544] text-[#f5b544]" />}{cell}</div>)}</div>)}<div className="comparison-grid comparison-footer" style={comparisonColumns}><div /><div className="col-span-full flex flex-wrap items-center justify-between gap-4 md:col-span-2"><p className="text-sm font-semibold text-[#547168]">Prices are estimates and may vary by program.</p><Button onClick={() => setView("calculator")} className="rounded-full bg-[#102b2a] text-white hover:bg-[#1c4b46]">Fine-tune your budget <Calculator className="ml-2 h-4 w-4" /></Button></div></div></div>}</main>;
}

function CalculatorView() {
  const [tuition, setTuition] = useState(7200);
  const [living, setLiving] = useState(4200);
  const [extras, setExtras] = useState(1200);
  const [currency, setCurrency] = useState<SupportedCurrency>("USD");
  const total = calculateAnnualCost(tuition, living, extras);
  const converted = convertCurrency(total, currency);
  return <main className="mx-auto max-w-[1440px] px-5 py-12 lg:px-10 lg:py-16"><div className="max-w-2xl"><div className="eyebrow eyebrow-soft"><Calculator className="h-3.5 w-3.5" /> Transparent cost planning</div><h1 className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-[#102b2a]">Know your number <span className="serif-italic text-[#c67d3e]">before you go.</span></h1><p className="mt-3 text-base leading-7 text-[#71877f]">Build a realistic annual budget with the costs students often discover too late.</p></div><div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]"><section className="calculator-card"><div className="flex items-center justify-between border-b border-[#e1eae3] pb-5"><div><h2 className="text-lg font-bold tracking-[-0.04em] text-[#102b2a]">Your annual estimate</h2><p className="mt-1 text-xs text-[#789088]">Adjust the sliders to match your plan.</p></div><div className="flex items-center gap-1 rounded-full bg-[#e8f3ec] p-1"><span className="px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#668379]">Show in</span>{(["USD", "EUR", "AED"] as SupportedCurrency[]).map(code => <button key={code} onClick={() => setCurrency(code)} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", currency === code ? "bg-white text-[#1a5c49] shadow-sm" : "text-[#829990]")}>{code}</button>)}</div></div><div className="mt-8 space-y-8"><div><div className="flex items-center justify-between"><label className="calc-label">Tuition fees</label><strong className="calc-value">{money(tuition)}</strong></div><input type="range" min="2500" max="18000" step="100" value={tuition} onChange={e => setTuition(Number(e.target.value))} className="mt-5 w-full accent-[#2d8067]" /><div className="mt-1 flex justify-between text-[10px] text-[#9aaeA4]"><span>Low-cost program</span><span>Premium program</span></div></div><div><div className="flex items-center justify-between"><label className="calc-label">Living expenses</label><strong className="calc-value">{money(living)}</strong></div><input type="range" min="2400" max="14000" step="100" value={living} onChange={e => setLiving(Number(e.target.value))} className="mt-5 w-full accent-[#2d8067]" /><div className="mt-1 flex justify-between text-[10px] text-[#9aaeA4]"><span>Shared housing</span><span>Major city</span></div></div><div><div className="flex items-center justify-between"><label className="calc-label">Visa, travel & other</label><strong className="calc-value">{money(extras)}</strong></div><input type="range" min="500" max="4000" step="100" value={extras} onChange={e => setExtras(Number(e.target.value))} className="mt-5 w-full accent-[#2d8067]" /></div></div><div className="mt-9 flex items-center justify-between rounded-2xl bg-[#f5f0e5] p-5"><div><span className="label-xs">Estimated monthly spend</span><strong className="mt-1 block text-xl tracking-[-0.05em] text-[#102b2a]">{money(monthlyCost(converted), currency)}</strong></div><div className="h-10 w-px bg-[#decfae]" /><div className="text-right"><span className="label-xs">Annual total</span><strong className="mt-1 block text-2xl tracking-[-0.06em] text-[#c67d3e]">{money(converted, currency)}</strong></div></div></section><aside className="budget-aside"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5b544] text-[#102b2a]"><Target className="h-6 w-6" /></div><h2 className="mt-7 text-2xl font-semibold leading-tight tracking-[-0.06em] text-white">A clear plan makes a brave move feel possible.</h2><p className="mt-4 text-sm leading-6 text-[#b8d4c8]">Most students underestimate living costs by 20%. Use this estimate as your starting point, then check the university's latest guidance.</p><div className="mt-8 border-t border-white/10 pt-5"><div className="flex items-center gap-3 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-[#f5b544]" /> Daily-updated FX rates</div><div className="mt-4 flex items-center gap-3 text-sm font-semibold text-white"><Clock3 className="h-4 w-4 text-[#f5b544]" /> Built for real student budgets</div></div></aside></div></main>;
}

function Saved({ savedIds, setSavedIds, savedPrograms, setSavedPrograms, setView }: { savedIds: number[]; setSavedIds: React.Dispatch<React.SetStateAction<number[]>>; savedPrograms: SavedProgram[]; setSavedPrograms: React.Dispatch<React.SetStateAction<SavedProgram[]>>; setView: (view: View) => void }) {
  const saved = universities.filter(u => savedIds.includes(u.id));
  const audit = trpc.university.freshnessAudit.useMutation();
  const [auditResults, setAuditResults] = useState<AuditResult[] | null>(null);
  return <main className="mx-auto max-w-[1440px] px-5 py-12 lg:px-10 lg:py-16"><div className="eyebrow eyebrow-soft"><Bookmark className="h-3.5 w-3.5" /> Your application dashboard</div><h1 className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-[#102b2a]">Keep your <span className="serif-italic text-[#c67d3e]">next moves</span> close.</h1><p className="mt-3 text-sm text-[#71877f]">Track saved programs, verified tuition, and application deadlines in one place.</p><div className="freshness-audit-panel mt-8"><div><div className="flex items-center gap-2 text-sm font-bold text-[#102b2a]"><ShieldCheck className="h-4 w-4 text-[#2d8067]" /> Source freshness audit</div><p className="mt-1 text-xs leading-5 text-[#6f877f]">Checks official source reachability and scans for tuition/deadline signals across all seeded programs.</p></div><Button onClick={() => audit.mutateAsync().then(result => setAuditResults(result as AuditResult[]))} disabled={audit.isPending} className="shrink-0 rounded-full bg-[#102b2a] text-xs text-white">{audit.isPending ? "Checking sources…" : "Run audit"}</Button></div>{auditResults && <div className="audit-results mt-3"><div className="flex items-center justify-between text-xs font-bold text-[#52776b]"><span>{auditResults.filter(item => item.reviewRecommended).length} records need review</span><span>{auditResults.filter(item => item.reachable).length}/{auditResults.length} sources reachable</span></div><div className="mt-2 grid gap-2">{auditResults.slice(0, 6).map(item => <div key={`${item.sourceUrl}-${item.programName}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-[10px]"><span className="min-w-0 truncate font-semibold text-[#386255]">{item.programName}</span><span className={cn("shrink-0 font-bold", item.reviewRecommended ? "text-[#bd7542]" : "text-[#2d8067]")}>{item.reviewRecommended ? "Review" : "OK"} · {item.httpStatus || "offline"}</span></div>)}</div></div>}<div className="mt-10 flex items-center justify-between"><h2 className="text-lg font-bold text-[#102b2a]">Saved programs <span className="ml-2 rounded-full bg-[#e8f3ec] px-2 py-1 text-xs text-[#1a5c49]">{savedPrograms.length}</span></h2><span className="text-xs font-semibold text-[#7b9188]">Stored on this device</span></div>{savedPrograms.length === 0 ? <div className="empty-state mt-5"><Bookmark className="h-8 w-8 text-[#d19366]" /><h3 className="mt-4 text-lg font-bold text-[#102b2a]">Your program tracker is waiting</h3><p className="mt-1 max-w-sm text-sm text-[#6f877f]">Save a program from any university card to track its deadline here.</p><Button onClick={() => setView("discover")} className="mt-5 rounded-full bg-[#102b2a] text-white">Discover programs</Button></div> : <div className="saved-program-grid mt-5">{savedPrograms.map(program => { const status = deadlineStatus(program.applicationDeadline); return <article key={program.key} className={cn("saved-program-card", status.approaching && "saved-program-card-urgent")}><div className={cn("h-2 rounded-full bg-gradient-to-r", program.accent)} /><div className="p-5"><div className="flex items-start justify-between gap-3"><div><span className="eyebrow eyebrow-soft">{program.country}</span><h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-[#102b2a]">{program.name}</h3><p className="mt-1 text-xs font-semibold text-[#719088]">{program.universityName}</p></div><button title="Remove saved program" onClick={() => setSavedPrograms(current => current.filter(item => item.key !== program.key))} className="rounded-full p-2 text-[#8ba198] hover:bg-[#f8e8df] hover:text-[#bd634f]"><X className="h-4 w-4" /></button></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="detail-stat"><span className="label-xs">Verified tuition</span><strong>{money(program.tuitionAmount, program.tuitionCurrency)}</strong><span className="mt-1 block text-[10px] text-[#849991]">{program.tuitionPeriod}</span></div><div className={cn("detail-stat", status.approaching && "detail-stat-urgent")} title={program.deadlineNote}><span className="label-xs">Application deadline</span><strong>{program.applicationDeadline}</strong><span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#c67d3e]"><Clock3 className="h-3 w-3" />{status.label}</span></div></div>{status.approaching && <div className="deadline-alert mt-4"><Clock3 className="h-4 w-4 shrink-0" /><span><strong>Deadline approaching.</strong> Review your documents and submit before this date.</span></div>}<p className="mt-4 text-xs leading-5 text-[#6f877f]" title={program.deadlineNote}>{program.deadlineNote}</p><a href={program.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#1a5c49] hover:underline">Open official program source <ExternalLink className="h-3 w-3" /></a></div></article>})}</div>}{saved.length > 0 && <><div className="mt-12 flex items-center justify-between"><h2 className="text-lg font-bold text-[#102b2a]">Saved universities</h2><span className="text-xs font-semibold text-[#7b9188]">{saved.length} shortlist {saved.length === 1 ? "item" : "items"}</span></div><div className="mt-5 grid gap-6 xl:grid-cols-2">{saved.map(university => <UniversityCard key={university.id} university={university} saved compared={false} savedProgramKeys={savedPrograms.map(program => program.key)} onSave={() => setSavedIds(current => current.filter(id => id !== university.id))} onCompare={() => {}} onDetails={() => {}} />)}</div></>}</main>;
}

export default function Home() {
  const [view, setView] = useState<View>("discover");
  const [savedIds, setSavedIds] = useState<number[]>([1, 4]);
  const [compareIds, setCompareIds] = useState<number[]>([1, 2]);
  const [savedPrograms, setSavedPrograms] = useState<SavedProgram[]>(() => { try { return JSON.parse(localStorage.getItem("edupath-saved-programs") ?? "[]") as SavedProgram[]; } catch { return []; } });
  const [locale, setLocale] = useState<"en" | "ar">("en");
  useEffect(() => { localStorage.setItem("edupath-saved-programs", JSON.stringify(savedPrograms)); }, [savedPrograms]);
  return <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className={cn("min-h-screen bg-[#f7f8f4] text-[#102b2a]", locale === "ar" && "arabic-ui")}><TopBar view={view} setView={setView} savedCount={savedIds.length + savedPrograms.length} compareCount={compareIds.length} locale={locale} setLocale={setLocale} />{view === "discover" && <Discover savedIds={savedIds} compareIds={compareIds} setSavedIds={setSavedIds} setCompareIds={setCompareIds} setView={setView} locale={locale} savedPrograms={savedPrograms} setSavedPrograms={setSavedPrograms} />}{view === "compare" && <Compare compareIds={compareIds} setCompareIds={setCompareIds} setView={setView} />}{view === "calculator" && <CalculatorView />}{view === "saved" && <Saved savedIds={savedIds} setSavedIds={setSavedIds} savedPrograms={savedPrograms} setSavedPrograms={setSavedPrograms} setView={setView} />}<footer className="border-t border-[#dfe8e1] px-5 py-8 lg:px-10"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-4 text-xs text-[#789088] sm:flex-row sm:items-center"><span>© 2026 EduPath. Built for your next chapter.</span><span className="flex items-center gap-4"><button>About</button><button>Trust & safety</button><button>For universities</button></span></div></footer></div>;
}
