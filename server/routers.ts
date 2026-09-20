import { z } from "zod";
import { createHash } from "node:crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const LIVE_SOURCE = "https://universities.hipolabs.com/search";
const supportedCountries = ["Hungary", "Turkey", "Poland", "United Kingdom", "Malaysia", "Germany", "United Arab Emirates"] as const;

export const verifiedPrograms = {
  debrecen: [
    { name: "Computer Science, MSc", tuitionAmount: 7500, tuitionCurrency: "USD", tuitionPeriod: "per year", academicYear: "2026/27", applicationDeadline: "1 November 2026", deadlineNote: "Conservative deadline for February 2027 intake; the individual program page also states 15 November for self-financed applicants.", sourceUrl: "https://edu.unideb.hu/p/computer-science-msc" },
    { name: "Data Science, MSc", tuitionAmount: 7500, tuitionCurrency: "USD", tuitionPeriod: "per year", academicYear: "2026/27", applicationDeadline: "1 November 2026", deadlineNote: "Conservative deadline for February 2027 intake; confirm the 1 November versus 15 November discrepancy with Admissions.", sourceUrl: "https://edu.unideb.hu/p/data-science-msc" },
    { name: "International Economy and Business, MSc", tuitionAmount: 7500, tuitionCurrency: "USD", tuitionPeriod: "per year", academicYear: "2026/27", applicationDeadline: "1 November 2026", deadlineNote: "Conservative deadline for February 2027 intake; confirm the 1 November versus 15 November discrepancy with Admissions.", sourceUrl: "https://edu.unideb.hu/p/international-economy-and-business-msc" },
  ],
  sdu: [
    { name: "Business Administration (English)", tuitionAmount: 38599, tuitionCurrency: "TRY", tuitionPeriod: "per semester", academicYear: "2026-2027", applicationDeadline: "30 August 2026", deadlineNote: "Second-round international application deadline; the 2027-2028 schedule was not published in the reviewed official sources.", sourceUrl: "https://oidb.sdu.edu.tr/assets/uploads/sites/73/files/2026-2027-egitim-ogretim-yili-donemlik-uluslararasi-ogrenci-ogrenim-ucretleri.pdf" },
    { name: "English Language Education", tuitionAmount: 22874, tuitionCurrency: "TRY", tuitionPeriod: "per semester", academicYear: "2026-2027", applicationDeadline: "30 August 2026", deadlineNote: "Second-round international application deadline; the 2027-2028 schedule was not published in the reviewed official sources.", sourceUrl: "https://oidb.sdu.edu.tr/assets/uploads/sites/73/files/2026-2027-egitim-ogretim-yili-donemlik-uluslararasi-ogrenci-ogrenim-ucretleri.pdf" },
    { name: "English Language and Literature", tuitionAmount: 22874, tuitionCurrency: "TRY", tuitionPeriod: "per semester", academicYear: "2026-2027", applicationDeadline: "30 August 2026", deadlineNote: "Second-round international application deadline; the 2027-2028 schedule was not published in the reviewed official sources.", sourceUrl: "https://oidb.sdu.edu.tr/assets/uploads/sites/73/files/2026-2027-egitim-ogretim-yili-donemlik-uluslararasi-ogrenci-ogrenim-ucretleri.pdf" },
  ],
  pecs: [
    { name: "Mechanical Engineering BSc", tuitionAmount: 3400, tuitionCurrency: "USD", tuitionPeriod: "per semester", academicYear: "2027/28", applicationDeadline: "15 June 2027, 23:59 CET", deadlineNote: "Published 2027/28 deadline; applicable deadline may vary by applicant category or citizenship.", sourceUrl: "https://apply.pte.hu/en_GB/courses/course/568-mechanical-engineering-bsc?search=648784" },
    { name: "Biomedical Engineering MSc", tuitionAmount: 4000, tuitionCurrency: "USD", tuitionPeriod: "per semester", academicYear: "2027/28", applicationDeadline: "15 June 2027, 23:59 CET", deadlineNote: "Published 2027/28 deadline; applicable deadline may vary by applicant category or citizenship.", sourceUrl: "https://apply.pte.hu/en_GB/courses/course/458-biomedical-engineering-msc" },
    { name: "English Studies MA", tuitionAmount: 2500, tuitionCurrency: "EUR", tuitionPeriod: "per semester", academicYear: "2027/28", applicationDeadline: "30 June 2027, 23:59 CET", deadlineNote: "Published 2027/28 deadline; applicable deadline may vary by applicant category or citizenship.", sourceUrl: "https://apply.pte.hu/en_GB/courses/course/306-english-studies-ma" },
  ],
  lodz: [
    { name: "Business Management (in English), BA", tuitionAmount: 2500, tuitionCurrency: "EUR", tuitionPeriod: "per year", academicYear: "2026/2027", applicationDeadline: "13 July 2026", deadlineNote: "International IRK deadline for candidates without Polish citizenship; no rolling deadline was listed.", sourceUrl: "https://www.rekrutacja.uni.lodz.pl/en-gb/offer/WYZSZE2026C/programme/DLBMa_08/?from=field:BM" },
    { name: "International Marketing, BA", tuitionAmount: 2900, tuitionCurrency: "EUR", tuitionPeriod: "per year", academicYear: "2026/2027", applicationDeadline: "14 September 2026", deadlineNote: "Late international IRK deadline for candidates without Polish citizenship; no rolling deadline was listed.", sourceUrl: "https://www.rekrutacja.uni.lodz.pl/en-gb/offer/WYZSZE2026C/programme/DLIMa_13/?from=registration:WYZSZE2026C" },
    { name: "Business and Digital Analytics, MSc", tuitionAmount: 2500, tuitionCurrency: "EUR", tuitionPeriod: "per year", academicYear: "2026/2027", applicationDeadline: "20 July 2026", deadlineNote: "International IRK deadline for candidates without Polish citizenship; no rolling deadline was listed.", sourceUrl: "https://www.rekrutacja.uni.lodz.pl/en-gb/offer/WYZSZE2026C/programme/DUBDAa_08/?from=registration:WYZSZE2026C" },
  ],
  northampton: [
    { name: "International Business Management MSc", tuitionAmount: 19000, tuitionCurrency: "GBP", tuitionPeriod: "per academic year", academicYear: "2026/27 January intake", applicationDeadline: "Rolling; may close at short notice", deadlineNote: "January 2027 processing is open; last arrival and enrolment is 22 February 2027. Courses may close once full.", sourceUrl: "https://www.northampton.ac.uk/courses/international-business-management-msc/" },
    { name: "Business Analytics MSc", tuitionAmount: 19000, tuitionCurrency: "GBP", tuitionPeriod: "per academic year", academicYear: "2026/27 January intake", applicationDeadline: "Rolling; may close at short notice", deadlineNote: "January 2027 processing is open; last arrival and enrolment is 22 February 2027. Courses may close once full.", sourceUrl: "https://www.northampton.ac.uk/courses/business-analytics-msc/" },
    { name: "Master of Business Administration MBA", tuitionAmount: 19500, tuitionCurrency: "GBP", tuitionPeriod: "per academic year", academicYear: "2026/27 January intake", applicationDeadline: "Rolling; may close at short notice", deadlineNote: "January 2027 processing is open; last arrival and enrolment is 22 February 2027. Courses may close once full.", sourceUrl: "https://www.northampton.ac.uk/courses/master-of-business-administration-mba/" },
  ],
  apu: [
    { name: "BSc (Hons) Computer Science (Cyber Security)", tuitionAmount: 108500, tuitionCurrency: "MYR", tuitionPeriod: "total for 3 years", academicYear: "2026 intake", applicationDeadline: "29 September 2026 (recommended 8-week cutoff)", deadlineNote: "APU recommends complete international applications at least 8 weeks before the 24 November 2026 intake for visa processing; 29 September is a derived planning date, not a fixed university cutoff.", sourceUrl: "https://www.apu.edu.my/course/bsc-hons-in-computer-science-cyber-security" },
    { name: "MSc Data Science and Business Analytics", tuitionAmount: 45800, tuitionCurrency: "MYR", tuitionPeriod: "total full-time programme", academicYear: "2026 intake", applicationDeadline: "5 October 2026 (recommended 8-week cutoff)", deadlineNote: "APU recommends complete international applications at least 8 weeks before the 30 November 2026 intake for visa processing; 5 October is a derived planning date, not a fixed university cutoff.", sourceUrl: "https://www.apu.edu.my/course/msc-in-data-science-and-business-analytics" },
  ],
} as const;

const seedUniversities = [
  { id: 1, name: "University of Debrecen", country: "Hungary", city: "Debrecen", tuition: 7500, total: 7500, subjects: ["Medicine", "Engineering", "Business"], programs: verifiedPrograms.debrecen.map(item => item.name), programDetails: verifiedPrograms.debrecen, language: "English", source: "Official University of Debrecen pages" },
  { id: 2, name: "Suleyman Demirel University", country: "Turkey", city: "Isparta", tuition: 38599, total: 38599, subjects: ["Computer Science", "Design", "Health"], programs: verifiedPrograms.sdu.map(item => item.name), programDetails: verifiedPrograms.sdu, language: "English / Turkish", source: "Official SDU fee and admissions pages" },
  { id: 3, name: "University of Pécs", country: "Hungary", city: "Pécs", tuition: 2500, total: 4000, subjects: ["Medicine", "Arts", "Psychology"], programs: verifiedPrograms.pecs.map(item => item.name), programDetails: verifiedPrograms.pecs, language: "English", source: "Official University of Pécs course pages" },
  { id: 4, name: "University of Lodz", country: "Poland", city: "Lodz", tuition: 2500, total: 2900, subjects: ["Business", "Economics", "Data"], programs: verifiedPrograms.lodz.map(item => item.name), programDetails: verifiedPrograms.lodz, language: "English", source: "Official University of Lodz IRK pages" },
  { id: 5, name: "University of Northampton", country: "United Kingdom", city: "Northampton", tuition: 19000, total: 19000, subjects: ["Business", "Computing", "Education"], programs: verifiedPrograms.northampton.map(item => item.name), programDetails: verifiedPrograms.northampton, language: "English", source: "Official University of Northampton pages" },
  { id: 6, name: "Asia Pacific University", country: "Malaysia", city: "Kuala Lumpur", tuition: 45800, total: 108500, subjects: ["Technology", "Cybersecurity", "Business"], programs: verifiedPrograms.apu.map(item => item.name), programDetails: verifiedPrograms.apu, language: "English", source: "Official APU course and fee pages" },
] as const;

type DirectoryRecord = {
  id: number;
  name: string;
  country: string;
  city: string;
  tuition: number;
  total: number;
  subjects: readonly string[];
  programs: readonly string[];
  language: string;
  source: string;
  programDetails?: readonly {
    name: string;
    tuitionAmount: number;
    tuitionCurrency: string;
    tuitionPeriod: string;
    academicYear: string;
    applicationDeadline: string;
    deadlineNote: string;
    sourceUrl: string;
    lastVerified?: string;
  }[];
  domain?: string;
  website?: string;
};

const countryHints: Record<string, string[]> = {
  Hungary: ["Medicine", "Engineering", "Business"],
  Turkey: ["Computer Science", "Design", "Health"],
  Poland: ["Business", "Economics", "Data"],
  "United Kingdom": ["Business", "Computing", "Education"],
  Malaysia: ["Technology", "Cybersecurity", "Business"],
  Germany: ["Engineering", "Computer Science", "Economics"],
  "United Arab Emirates": ["Business", "Engineering", "Media"],
};

const arabicTermMap: Record<string, string[]> = {
  "طب": ["medicine", "health"], "هندسة": ["engineering"], "حاسوب": ["computer science", "computing", "technology"], "برمجة": ["computer science", "technology"], "أعمال": ["business"], "اقتصاد": ["economics"], "تصميم": ["design"], "علوم": ["science", "data"], "ألمانيا": ["germany"], "تركيا": ["turkey"], "هنغاريا": ["hungary"], "المجر": ["hungary"], "بولندا": ["poland"], "ماليزيا": ["malaysia"], "بريطانيا": ["united kingdom"], "الإمارات": ["united arab emirates"], "دولار": ["usd"],
};

function normalizeLiveUniversity(raw: { name: string; country: string; web_pages?: string[]; domains?: string[] }, id: number): DirectoryRecord {
  const seed = seedUniversities.find(item => item.name.toLowerCase() === raw.name.toLowerCase());
  const subjects = seed?.subjects ? [...seed.subjects] : (countryHints[raw.country] ?? ["Business", "Engineering", "Computer Science"]);
  const programs = seed?.programs ? [...seed.programs] : subjects.map(subject => `${subject} degree`);
  const estimatedTuition = seed?.tuition ?? (raw.country === "United Kingdom" ? 12500 : raw.country === "Germany" ? 4200 : 6800);
  const website = raw.web_pages?.[0];
  return { id, name: raw.name, country: raw.country, city: raw.name, tuition: estimatedTuition, total: estimatedTuition + 4200, subjects, programs, programDetails: seed?.programDetails?.map(item => ({ ...item, lastVerified: "2026-09-19" })), language: raw.country === "Turkey" ? "English / Turkish" : "English", source: seed?.source ?? "HipoLabs live directory", domain: raw.domains?.[0], website };
}

const auditHashes = new Map<string, string>();
function daysSince(date: string) { return Math.max(0, Math.floor((Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86400000)); }
async function auditSeededSources() {
  const programs = Object.entries(verifiedPrograms).flatMap(([universityKey, records]) => records.map(record => ({ universityKey, ...record, lastVerified: "2026-09-19" })));
  return (await Promise.all(programs.map(async program => {
    try {
      const response = await fetch(program.sourceUrl, { signal: AbortSignal.timeout(5000), headers: { "user-agent": "EduPath-freshness-audit/1.0" } });
      const body = await response.text();
      const hash = createHash("sha256").update(body).digest("hex");
      const previousHash = auditHashes.get(program.sourceUrl);
      auditHashes.set(program.sourceUrl, hash);
      const lower = body.toLowerCase();
      const deadlineStatus = lower.includes("deadline") || lower.includes("application") || lower.includes("admission");
      const tuitionStatus = lower.includes("tuition") || lower.includes("fee") || lower.includes("fees");
      return { universityKey: program.universityKey, programName: program.name, sourceUrl: program.sourceUrl, lastVerified: program.lastVerified, verificationAgeDays: daysSince(program.lastVerified), httpStatus: response.status, reachable: response.ok, contentChangedSinceLastAudit: previousHash ? previousHash !== hash : null, tuitionSignalFound: tuitionStatus, deadlineSignalFound: deadlineStatus, reviewRecommended: !response.ok || Boolean(previousHash && previousHash !== hash) || !tuitionStatus || !deadlineStatus };
    } catch (error) {
      return { universityKey: program.universityKey, programName: program.name, sourceUrl: program.sourceUrl, lastVerified: program.lastVerified, verificationAgeDays: daysSince(program.lastVerified), httpStatus: 0, reachable: false, contentChangedSinceLastAudit: null, tuitionSignalFound: false, deadlineSignalFound: false, reviewRecommended: true, error: error instanceof Error ? error.message : "Source request failed" };
    }
  }))).sort((a, b) => Number(b.reviewRecommended) - Number(a.reviewRecommended));
}

async function fetchLiveDirectory(countries: string[]) {
  const selected = countries.length ? countries : [...supportedCountries];
  const responses = await Promise.all(selected.slice(0, 7).map(async country => {
    try {
      const response = await fetch(`${LIVE_SOURCE}?country=${encodeURIComponent(country)}`, { signal: AbortSignal.timeout(2800) });
      if (!response.ok) return [];
      return await response.json() as Array<{ name: string; country: string; web_pages?: string[]; domains?: string[] }>;
    } catch (error) {
      console.warn(`[EduPath live directory] Could not load ${country}`, error);
      return [];
    }
  }));
  const records: DirectoryRecord[] = responses.flatMap((data, countryIndex) => data.slice(0, 10).map((university, index) => normalizeLiveUniversity(university, 100 + countryIndex * 10 + index)));
  const merged = [...seedUniversities, ...records.filter(record => !seedUniversities.some(seed => seed.name.toLowerCase() === record.name.toLowerCase()))];
  return merged.slice(0, 42);
}

const aiSearchOutput = {
  type: "json_schema" as const,
  json_schema: {
    name: "edupath_search_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        universityIds: { type: "array", items: { type: "integer" } },
        summary: { type: "string" },
        interpretedBudget: { type: ["integer", "null"] },
        interpretedCountry: { type: ["string", "null"] },
        interpretedSubject: { type: ["string", "null"] },
      },
      required: ["universityIds", "summary", "interpretedBudget", "interpretedCountry", "interpretedSubject"],
      additionalProperties: false,
    },
  },
};

export function heuristicSearch(query: string, catalog: readonly DirectoryRecord[] = seedUniversities) {
  const normalized = query.toLowerCase();
  const expanded = Object.entries(arabicTermMap).reduce((text, [term, translations]) => text.replaceAll(term, `${term} ${translations.join(" ")}`), normalized);
  const budgetMatch = expanded.match(/(?:under|below|less than|budget of)\s*\$?\s*(\d[\d,]*)/);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : null;
  const matches = catalog.filter((university) => {
    const text = `${university.name} ${university.country} ${university.city} ${university.subjects.join(" ")} ${university.programs.join(" ")}`.toLowerCase();
    return text.includes(expanded) || (budget ? university.total <= budget : false) || university.subjects.some(subject => expanded.includes(subject.toLowerCase())) || university.programs.some(program => expanded.includes(program.toLowerCase()));
  });
  const selected = matches.length ? matches : catalog;
  const isArabic = /[\u0600-\u06FF]/.test(query);
  return { universityIds: selected.map(university => university.id), summary: matches.length ? (isArabic ? `وجدت ${matches.length} خيارات مناسبة لبحثك.` : `I found ${matches.length} options that fit your search.`) : (isArabic ? "لم أجد تطابقاً دقيقاً، لذلك أعرض لك الدليل الكامل." : "I could not find an exact match, so I am showing the full directory to help you explore."), interpretedBudget: budget, interpretedCountry: null, interpretedSubject: null };
}

async function interpretSearch(query: string, catalog: DirectoryRecord[]) {
  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are EduPath's bilingual university and program search assistant. Match the student's request only to catalog IDs provided. Understand Arabic and English. Match program names and subjects, not just university names. Never invent a university. If the query is Arabic, answer the summary in Arabic. If a budget is implied, use the total estimated annual cost." },
        { role: "user", content: `Student request: ${query}\n\nCatalog:\n${JSON.stringify(catalog)}` },
      ],
      response_format: aiSearchOutput,
      reasoning: { effort: "minimal" },
    });
    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (!parsed || !Array.isArray(parsed.universityIds)) throw new Error("Invalid search response");
    const validIds = new Set<number>(catalog.map(university => university.id));
    return { ...parsed, universityIds: parsed.universityIds.filter((id: number) => validIds.has(id)) };
  } catch (error) {
    console.warn("[EduPath AI search] Falling back to bilingual heuristic search", error);
    return heuristicSearch(query, catalog);
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  university: router({
    directory: publicProcedure.input(z.object({ countries: z.array(z.string()).optional() }).optional()).query(({ input }) => fetchLiveDirectory(input?.countries ?? [])),
    freshnessAudit: publicProcedure.mutation(() => auditSeededSources()),
    aiSearch: publicProcedure.input(z.object({ query: z.string().trim().min(2).max(240), catalog: z.array(z.object({ id: z.number(), name: z.string(), country: z.string(), city: z.string(), tuition: z.number(), total: z.number(), subjects: z.array(z.string()), programs: z.array(z.string()), language: z.string(), source: z.string(), domain: z.string().optional(), website: z.string().optional() })).optional() })).mutation(({ input }) => interpretSearch(input.query, input.catalog?.length ? input.catalog : [...seedUniversities])),
  }),
});

export type AppRouter = typeof appRouter;
