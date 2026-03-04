import { Store } from '@tauri-apps/plugin-store';

export type TemplateId = string;

export interface SummaryTemplate {
  id: TemplateId;
  name: string;
  description: string;
  prompt: string;
  isBuiltIn: boolean;
}

const STANDARD_PROMPT = `You are a meeting notes assistant. Summarize ONLY what is explicitly said in the transcript below. Do NOT invent, assume, or hallucinate any information that is not directly present in the transcript. If the transcript is short or lacks substance, reflect that honestly — write a brief summary and use "None identified." for empty sections.

Produce structured meeting notes in Markdown with exactly these four sections:

## Overview
[Summarize only what was actually discussed. For very short or minimal transcripts, write 1-2 sentences. For longer meetings, write up to 8-12 sentences. Only mention participants if they are named in the transcript.]

## Key Points
[Bullet list of the most important facts, insights, or information shared. Only include points explicitly stated in the transcript. If nothing substantive was discussed, write "None identified."]

## Decisions Made
[Bullet list of decisions that were made during the meeting. Only include decisions explicitly stated. If none, write "None identified."]

## Action Items
[List ALL action items as: - @[person]: [task] by [deadline]. Only include action items explicitly assigned in the transcript. If no action items were mentioned, write "None identified."]

CRITICAL: Every claim in your summary must be directly traceable to the transcript. If the transcript contains only greetings or filler words, say so. Do NOT fabricate meeting content.

Also generate a concise meeting title (max 10 words) on the very first line as: TITLE: [title]`;

const ACTION_ITEMS_PROMPT = `First line must be: TITLE: [concise title]

Return output in Markdown.
Do NOT invent, assume, or hallucinate information. Use only facts explicitly stated in the transcript.
If any section has no content, write "None identified."

Use exactly these sections:
## Context
Write 1-3 concise sentences describing what the meeting was about.

## Action Items
List prioritized action items using this format per line:
- @[person]: [task] | Priority: [High/Medium/Low] | Due: [date or "None identified."]
Keep every line short and scannable. No long prose.

## Decisions Made
Short bullet list of explicit decisions only. If none, write "None identified."`;

const EXECUTIVE_PROMPT = `First line must be: TITLE: [concise title]

Return output in Markdown.
Do NOT invent, assume, or hallucinate information. Include only what was explicitly discussed.
If any section has no content, write "None identified."

Use exactly these sections:
## Executive Summary
Write 3-5 flowing prose sentences for senior stakeholders. No bullet lists in this section.

## Key Decisions
Up to 5 bullet points with the most important explicit decisions.

## Next Steps
Up to 5 bullet points with owners when available. If owner is unknown, write "None identified."`;

const TECHNICAL_PROMPT = `First line must be: TITLE: [concise title]

Return output in Markdown.
Do NOT invent, assume, or hallucinate information.
Preserve technical terminology, version numbers, constraints, and trade-offs exactly as discussed.
If any section has no content, write "None identified."

Use exactly these sections:
## Problem / Context
Describe the technical problem and scope.

## Discussion & Analysis
Capture approaches considered, pros/cons, constraints, and risks.

## Technical Decisions
Bullet list of explicit decisions with rationale.

## Open Questions
Bullet list of unresolved technical questions.

## Action Items
Bullet list with owners and deadlines when explicit. Use "None identified." when empty.`;

const INTERVIEW_PROMPT = `First line must be: TITLE: [concise title]

Return output in Markdown.
Do NOT invent, assume, or hallucinate information.
Preserve speaker attribution when identified, and keep notable responses in the speaker's voice when possible.
If any section has no content, write "None identified."

Use exactly these sections:
## Key Themes
Bullet list of recurring themes.

## Notable Responses
Bullet list of important direct or paraphrased responses with attribution when available.

## Follow-up Items
Bullet list of follow-up tasks or questions.

## Impressions & Context
Only include observations explicitly mentioned in the transcript.`;

export const BUILT_IN_TEMPLATES: SummaryTemplate[] = [
  {
    id: 'standard',
    name: 'Standard Meeting Notes',
    description: 'Balanced overview with key points, decisions, and action items',
    prompt: STANDARD_PROMPT,
    isBuiltIn: true,
  },
  {
    id: 'action-items',
    name: 'Action Items Focus',
    description: 'Prioritized action items with owners and deadlines',
    prompt: ACTION_ITEMS_PROMPT,
    isBuiltIn: true,
  },
  {
    id: 'executive',
    name: 'Executive Summary',
    description: 'Brief summary for stakeholders with limited time',
    prompt: EXECUTIVE_PROMPT,
    isBuiltIn: true,
  },
  {
    id: 'technical',
    name: 'Technical Discussion',
    description: 'Detailed notes preserving technical specifics and trade-offs',
    prompt: TECHNICAL_PROMPT,
    isBuiltIn: true,
  },
  {
    id: 'interview',
    name: 'Interview / 1:1',
    description: 'Structured notes for interviews and one-on-one meetings',
    prompt: INTERVIEW_PROMPT,
    isBuiltIn: true,
  },
];

let store: Store | null = null;

async function getTemplatesStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('templates.json', {
      defaults: { customTemplates: [] },
      autoSave: 500,
    });
  }

  return store;
}

async function saveCustomTemplates(templates: SummaryTemplate[]): Promise<void> {
  const templatesStore = await getTemplatesStore();
  await templatesStore.set('customTemplates', templates);
}

export async function getCustomTemplates(): Promise<SummaryTemplate[]> {
  const templatesStore = await getTemplatesStore();
  const templates = await templatesStore.get<SummaryTemplate[]>('customTemplates');

  return (templates ?? []).map((template) => ({
    ...template,
    isBuiltIn: false,
  }));
}

export async function saveCustomTemplate(template: SummaryTemplate): Promise<void> {
  const existing = await getCustomTemplates();
  const customTemplate = {
    ...template,
    isBuiltIn: false,
  };
  const index = existing.findIndex((entry) => entry.id === customTemplate.id);

  if (index >= 0) {
    existing[index] = customTemplate;
  } else {
    existing.push(customTemplate);
  }

  await saveCustomTemplates(existing);
}

export async function deleteCustomTemplate(id: TemplateId): Promise<void> {
  const existing = await getCustomTemplates();
  await saveCustomTemplates(existing.filter((template) => template.id !== id));
}

export function getTemplateById(id: TemplateId, customTemplates: SummaryTemplate[]): SummaryTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.id === id) ?? customTemplates.find((template) => template.id === id);
}
