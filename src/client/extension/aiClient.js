import { db } from './database/database.js';
import { readAiApiKey } from './database/crypto.js';
import {
    getActiveAiConfiguration,
    getCoverLetterForVacancy,
    hasAiConsent,
    recordAiConsent,
    saveCoverLetter,
    saveMatchResult,
} from './database/repository.js';

export class AiConsentRequiredError extends Error {
    constructor(message = 'Explicit GDPR opt-in consent is required before sending minimized text to a remote AI provider.') {
        super(message);
        this.name = 'AiConsentRequiredError';
        this.code = 'AI_CONSENT_REQUIRED';
    }
}

export function isRemoteAiEndpoint(providerName, apiEndpoint) {
    if (providerName === 'local' || providerName === 'local_cosine') return false;
    if (!apiEndpoint) return true;
    try {
        const host = new URL(apiEndpoint).hostname.toLowerCase();
        return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
    } catch {
        return true;
    }
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips all personal_data fields, e-mails, phones and personal profile URLs
 * before any text leaves the local browser context (BA 2.8 & R6).
 */
export function sanitizeTextForAi(text, personalData = null) {
    let out = String(text || '');
    if (!out) return '';

    out = out
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email redacted]')
        .replace(/\+\d[\d\s().-]{6,}\d/g, '[phone redacted]')
        .replace(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g, '[phone redacted]')
        .replace(/https?:\/\/(?:www\.)?(?:linkedin\.com|github\.com|t\.me)\/[^\s,)]+/gi, '[profile link redacted]')
        .replace(/^(?:name|e-?mail|phone|tel|address|location|linkedin|github|telegram|website)\s*:\s*.*$/gim, '');

    if (personalData && typeof personalData === 'object') {
        const fullName = `${personalData.first_name || ''} ${personalData.last_name || ''}`.trim();
        const literals = [
            fullName,
            personalData.first_name,
            personalData.last_name,
            personalData.email,
            personalData.phone,
            personalData.location,
            personalData.website,
            personalData.github,
            personalData.linkedin,
            personalData.telegram,
        ]
            .map((v) => (v ? String(v).trim() : ''))
            .filter((v) => v.length >= 2)
            .sort((a, b) => b.length - a.length);

        for (const lit of literals) {
            out = out.replace(new RegExp(escapeRegExp(lit), 'gi'), '[redacted]');
        }
    }

    return out.replace(/\n{3,}/g, '\n\n').trim();
}

async function resolveSkillNames(skillIds = []) {
    if (!Array.isArray(skillIds) || !skillIds.length) return [];
    const rows = await db.skills.bulkGet(skillIds);
    return rows.filter(Boolean).map((s) => s.name);
}

function buildMinimizedVacancyPayload(vacancy, personalData) {
    const title = sanitizeTextForAi(vacancy?.full_position_name || 'Target Position', personalData);
    const desc = sanitizeTextForAi(vacancy?.description || '', personalData).slice(0, 6000);
    return `Title: ${title}\n\nDescription:\n${desc || '(No detailed description provided)'}`;
}

async function buildMinimizedResumePayload(resume, personalData) {
    const skillNames = Array.isArray(resume?.skills) && resume.skills.length
        ? resume.skills
        : await resolveSkillNames(resume?.skill_ids || []);
    const title = sanitizeTextForAi(resume?.title || 'Candidate Resume', personalData);
    const summary = sanitizeTextForAi(resume?.summary || '', personalData);
    const body = sanitizeTextForAi(resume?.plain_text || '', personalData).slice(0, 5000);

    const parts = [
        `Role Focus: ${title}`,
        skillNames.length ? `Skills: ${skillNames.join(', ')}` : null,
        summary ? `Summary: ${summary}` : null,
        body ? `Experience & Qualifications:\n${body}` : null,
    ].filter(Boolean);

    return { text: parts.join('\n\n'), skillNames };
}

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9+#.\s-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2);
}

/**
 * Deterministic local token/skill cosine similarity fallback (useful for offline or local_cosine mode).
 */
export function computeLocalCosineMatch(vacancy, resumeSkillNames = [], resumeText = '') {
    const vacText = `${vacancy?.full_position_name || ''} ${vacancy?.description || ''}`;
    const vacLower = vacText.toLowerCase();

    const matchedSkills = [];
    const missingSkills = [];
    for (const sk of resumeSkillNames) {
        if (vacLower.includes(sk.toLowerCase())) matchedSkills.push(sk);
    }

    const commonTechDictionary = [
        'Java', 'Spring Boot', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue',
        'Node.js', 'Python', 'PostgreSQL', 'SQL', 'Docker', 'Kubernetes', 'AWS',
        'Azure', 'REST', 'GraphQL', 'Git', 'CI/CD', 'Linux', 'Microservices', 'Redis',
    ];
    for (const term of commonTechDictionary) {
        const inVac = vacLower.includes(term.toLowerCase());
        const inRes = resumeSkillNames.some((s) => s.toLowerCase() === term.toLowerCase())
            || resumeText.toLowerCase().includes(term.toLowerCase());
        if (inVac && !inRes && !missingSkills.includes(term)) {
            missingSkills.push(term);
        } else if (inVac && inRes && !matchedSkills.some((m) => m.toLowerCase() === term.toLowerCase())) {
            matchedSkills.push(term);
        }
    }

    const vTokens = tokenize(vacText);
    const rTokens = tokenize(`${resumeText} ${resumeSkillNames.join(' ')}`);
    const vFreq = new Map();
    const rFreq = new Map();
    for (const t of vTokens) vFreq.set(t, (vFreq.get(t) || 0) + 1);
    for (const t of rTokens) rFreq.set(t, (rFreq.get(t) || 0) + 1);

    let dot = 0;
    let magV = 0;
    let magR = 0;
    for (const [k, v] of vFreq) {
        magV += v * v;
        if (rFreq.has(k)) dot += v * rFreq.get(k);
    }
    for (const v of rFreq.values()) magR += v * v;

    const cosine = magV > 0 && magR > 0 ? dot / (Math.sqrt(magV) * Math.sqrt(magR)) : 0;
    const skillRatio = (matchedSkills.length + missingSkills.length) > 0
        ? matchedSkills.length / (matchedSkills.length + missingSkills.length)
        : cosine;
    const score = Math.round(Math.min(100, Math.max(0, (cosine * 0.45 + skillRatio * 0.55) * 100)));

    return {
        score,
        matched_skills: matchedSkills.slice(0, 15),
        missing_skills: missingSkills.slice(0, 15),
    };
}

function renderTemplate(template, vars) {
    let out = String(template || '');
    for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{{${k}}}`, v ?? '');
    }
    return out;
}

function extractJsonObject(raw) {
    const trimmed = String(raw || '').trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonSlice = firstBrace !== -1 && lastBrace > firstBrace
        ? candidate.slice(firstBrace, lastBrace + 1)
        : candidate;
    return JSON.parse(jsonSlice);
}

async function ensureConsentIfRemote(cfg, requestConsentFn) {
    if (!isRemoteAiEndpoint(cfg.provider_name, cfg.api_endpoint)) return;
    if (await hasAiConsent()) return;
    if (typeof requestConsentFn === 'function') {
        const accepted = await requestConsentFn(cfg);
        if (accepted) {
            await recordAiConsent('1.0');
            return;
        }
    }
    throw new AiConsentRequiredError();
}

function isGeminiProvider(cfg) {
const endpoint = (cfg.api_endpoint || '').toLowerCase();
if (endpoint.includes('/openai')) return false;
return cfg.provider_name === 'gemini' || endpoint.includes('generativelanguage.googleapis.com');
}

function resolveGeminiEndpoint(cfg) {
let raw = (cfg.api_endpoint || '').trim().replace(/\/+$/, '');
if (!raw) raw = 'https://generativelanguage.googleapis.com/v1beta';
if (raw.includes(':generateContent')) return raw;
if (raw.endsWith('/models')) return `${raw}/${encodeURIComponent(cfg.model_name)}:generateContent`;
return `${raw}/models/${encodeURIComponent(cfg.model_name)}:generateContent`;
}

function resolveChatEndpoint(cfg) {
const raw = (cfg.api_endpoint || '').trim().replace(/\/+$/, '');
if (!raw) return 'https://api.openai.com/v1/chat/completions';
if (raw.endsWith('/chat/completions') || raw.endsWith('/api/chat')) return raw;
if (raw.endsWith('/v1')) return `${raw}/chat/completions`;
return `${raw}/v1/chat/completions`;
}

async function callGeminiChat(cfg, apiKey, { systemPrompt, userPrompt, expectJson = false }) {
if (!apiKey || !apiKey.trim()) {
throw new Error('Gemini API key is required.');
}
const endpoint = resolveGeminiEndpoint(cfg);
const body = {
system_instruction: {
parts: [{ text: systemPrompt }],
},
contents: [
{
role: 'user',
parts: [{ text: userPrompt }],
},
],
generationConfig: {
temperature: 0.25,
...(expectJson ? { responseMimeType: 'application/json' } : {}),
},
};

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey.trim(),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200) || res.statusText}`);
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const content = Array.isArray(parts)
        ? parts.map((p) => p?.text || '').join('').trim()
        : '';

    if (!content) {
        throw new Error('Gemini API returned an empty response.');
    }
    return content;
}

async function callLlmChat(cfg, { systemPrompt, userPrompt, expectJson = false }) {
const apiKey = cfg.id ? await readAiApiKey(cfg.id).catch(() => null) : null;
if (isGeminiProvider(cfg)) {
return callGeminiChat(cfg, apiKey, { systemPrompt, userPrompt, expectJson });
}

    const endpoint = resolveChatEndpoint(cfg);
    const isOllamaNative = endpoint.endsWith('/api/chat');

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const body = isOllamaNative
        ? {
            model: cfg.model_name,
            stream: false,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            ...(expectJson ? { format: 'json' } : {}),
        }
        : {
            model: cfg.model_name,
            temperature: 0.25,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        };

    const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`AI provider error (${res.status}): ${errText.slice(0, 200) || res.statusText}`);
    }

    const data = await res.json();
    const content = isOllamaNative
        ? data?.message?.content
        : data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
        throw new Error('AI provider returned an empty response.');
    }
    return content.trim();
}

/**
 * US 4.1: Evaluate semantic match score (0-100) + matched/missing skills.
 */
export async function evaluateVacancyMatch(vacancy, resume, {
    personalData = null,
    requestConsentFn = null,
    configOverride = null,
} = {}) {
    if (!vacancy?.id || !resume?.id) {
        throw new Error('Vacancy and resume are required for match evaluation.');
    }

    const cfg = configOverride || await getActiveAiConfiguration();
    const vacText = buildMinimizedVacancyPayload(vacancy, personalData);
    const { text: resText, skillNames } = await buildMinimizedResumePayload(resume, personalData);

    if (!cfg || cfg.provider_name === 'local_cosine') {
        const local = computeLocalCosineMatch(vacancy, skillNames, resText);
        const id = await saveMatchResult({
            vacancy_id: vacancy.id,
            resume_id: resume.id,
            score: local.score,
            matched_skills: local.matched_skills,
            missing_skills: local.missing_skills,
            model: 'local-cosine',
        });
        return { id, vacancy_id: vacancy.id, resume_id: resume.id, ...local, model: 'local-cosine' };
    }

    await ensureConsentIfRemote(cfg, requestConsentFn);

    const tpl = await db.prompt_templates.where('code').equals('match_score').first();
    const systemPrompt = tpl?.system_prompt
        || 'You compare a resume excerpt with a vacancy. Never include contact data in the answer.';
    const userPrompt = renderTemplate(
        tpl?.user_prompt_template
        || 'Vacancy:\n{{vacancy}}\n\nResume (skills and experience only):\n{{resume}}\n\nReturn JSON {"score":0-100,"matched_skills":[],"missing_skills":[]}.',
        { vacancy: vacText, resume: resText }
    );

    const raw = await callLlmChat(cfg, { systemPrompt, userPrompt, expectJson: true });
    const parsed = extractJsonObject(raw);

    const cleanScore = Math.round(Math.min(100, Math.max(0, Number(parsed?.score) || 0)));
    const matched_skills = Array.isArray(parsed?.matched_skills)
        ? parsed.matched_skills.map((s) => String(s).trim()).filter(Boolean)
        : [];
    const missing_skills = Array.isArray(parsed?.missing_skills)
        ? parsed.missing_skills.map((s) => String(s).trim()).filter(Boolean)
        : [];

    const id = await saveMatchResult({
        vacancy_id: vacancy.id,
        resume_id: resume.id,
        score: cleanScore,
        matched_skills,
        missing_skills,
        model: cfg.model_name || null,
    });

    return {
        id,
        vacancy_id: vacancy.id,
        resume_id: resume.id,
        score: cleanScore,
        matched_skills,
        missing_skills,
        model: cfg.model_name || null,
    };
}

/**
 * US 4.3 helper: guards manual cover letter edits before regeneration overwrites them.
 */
export async function checkRegenerateOverwrite({ isDirty = false, confirmOverwriteFn = null } = {}) {
    if (!isDirty) return true;
    if (typeof confirmOverwriteFn === 'function') {
        return Boolean(await confirmOverwriteFn());
    }
    return false;
}

/**
 * US 4.2 & US 4.3: Generate tailored cover letter draft and persist to db.cover_letters.
 */
export async function generateCoverLetter(vacancy, resume, {
    personalData = null,
    requestConsentFn = null,
    configOverride = null,
    existingDraftId = null,
    isDirty = false,
    confirmOverwriteFn = null,
} = {}) {
    if (!vacancy?.id || !resume?.id) {
        throw new Error('Vacancy and resume are required to generate a cover letter.');
    }

    const canOverwrite = await checkRegenerateOverwrite({ isDirty, confirmOverwriteFn });
    if (!canOverwrite) {
        throw new Error('Regeneration cancelled to preserve manual edits.');
    }

    const cfg = configOverride || await getActiveAiConfiguration();
    const vacText = buildMinimizedVacancyPayload(vacancy, personalData);
    const { text: resText, skillNames } = await buildMinimizedResumePayload(resume, personalData);

    let generatedText = '';
    if (!cfg || cfg.provider_name === 'local_cosine') {
        const overlap = computeLocalCosineMatch(vacancy, skillNames, resText).matched_skills;
        generatedText = [
            `Dear Hiring Team,`,
            ``,
            `I am writing to express my interest in the ${vacancy.full_position_name || 'open'} position. With experience across ${overlap.length ? overlap.join(', ') : (skillNames.join(', ') || 'the required technologies')}, my background aligns closely with your team's goals.`,
            ``,
            resume.summary ? `${sanitizeTextForAi(resume.summary, personalData)}` : `In my recent work (${resume.title}), I have delivered reliable production solutions matching the responsibilities outlined in your posting.`,
            ``,
            `Thank you for considering my application. I welcome the opportunity to discuss how I can contribute.`,
            ``,
            `Sincerely,`,
            `[Your Name]`,
        ].join('\n');
    } else {
        await ensureConsentIfRemote(cfg, requestConsentFn);
        const tpl = await db.prompt_templates.where('code').equals('cover_letter').first();
        const systemPrompt = tpl?.system_prompt
            || 'You write a concise formal cover letter that refers to the vacancy responsibilities and the candidate achievements.';
        const userPrompt = renderTemplate(
            tpl?.user_prompt_template
            || 'Vacancy:\n{{vacancy}}\n\nCandidate summary:\n{{resume_summary}}\n\nWrite the letter.',
            { vacancy: vacText, resume_summary: resText }
        );
        generatedText = await callLlmChat(cfg, { systemPrompt, userPrompt, expectJson: false });
    }

    const existing = existingDraftId
        ? await db.cover_letters.get(existingDraftId)
        : await getCoverLetterForVacancy(resume.profile_id, vacancy.id, resume.id);

    return saveCoverLetter({
        id: existing?.id || null,
        profile_id: resume.profile_id,
        vacancy_id: vacancy.id,
        resume_id: resume.id,
        title: `Cover Letter - ${vacancy.full_position_name || 'Application'}`.slice(0, 150),
        plain_text: generatedText,
        skill_ids: Array.isArray(resume.skill_ids) ? resume.skill_ids : [],
    });
}