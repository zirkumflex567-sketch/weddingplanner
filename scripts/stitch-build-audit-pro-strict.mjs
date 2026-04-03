import { stitch } from '@google/stitch-sdk';
import fs from 'node:fs/promises';

const lighthouse = JSON.parse(await fs.readFile('docs/audit/artifacts/lighthouse-v2/summary.json', 'utf8'));
const liveHealth = JSON.parse(await fs.readFile('docs/audit/artifacts/live-v2/live-health.json', 'utf8'));

const screenshots = [
  'https://h-town.duckdns.org/wedding-audit-pro/assets/01-home.png',
  'https://h-town.duckdns.org/wedding-audit-pro/assets/02-after-chat-open.png',
  'https://h-town.duckdns.org/wedding-audit-pro/assets/03-coverage.png'
];

const prompt = `
Build a REAL audit report page in German as standalone HTML for production publishing.

STRICT RULES:
- No fake product nav.
- No placeholder words like "dashboard", "settings_input_component", "export report", "suite", "widget".
- No decorative nonsense sections.
- Use clean, serious engineering-report style.

Required structure in this exact order:
1) Header: "WeddingPlanner Live Vollaudit"
2) Live badge text EXACT: "LIVE VERIFIZIERT"
3) Deployment note mentioning merged "chat + design-studio" live rollout.
4) KPI cards with exact values:
   - Performance ${lighthouse.categories.performance}
   - Accessibility ${lighthouse.categories.accessibility}
   - Best Practices ${lighthouse.categories['best-practices']}
   - SEO ${lighthouse.categories.seo}
5) Metrics row:
   - FCP ${lighthouse.metrics.fcp}
   - LCP ${lighthouse.metrics.lcp}
   - CLS ${lighthouse.metrics.cls}
   - TBT ${lighthouse.metrics.tbt}
6) Live endpoint verification list:
   - /wedding/health = ${liveHealth.health.web}
   - /wedding/api/health = ${liveHealth.health.api}
   - /prototype/workspaces tested
   - /prototype/consultant/sessions/:workspaceId tested
   - /prototype/consultant/reply tested
   - /prototype/ingestion/coverage tested
7) Findings matrix table with rows for UX, Accessibility, Security, SEO, Performance, Code Quality, Architecture, Chat Flow.
8) Prioritized action plan with sections P0, P1, P2.
9) Evidence gallery rendering these actual images:
${screenshots.join('\n')}
10) Final section "Was jetzt live ist" with concise bullet proof statements.

Design style: professional, clean, high-contrast dark theme, strong typography, but minimal and factual.
Return complete HTML only.
`;

const project = await stitch.createProject(`Wedding Audit PRO Strict ${new Date().toISOString()}`);
let screen = await project.generate(prompt, 'DESKTOP');
screen = await screen.edit(
  `Refine for publication quality. Keep all required sections and exact texts. Remove any remaining generic/fake UI labels. Return full HTML only.`,
  'DESKTOP',
  'GEMINI_3_PRO'
);

const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();
const htmlRes = await fetch(htmlUrl);
if (!htmlRes.ok) throw new Error(`Failed html download: ${htmlRes.status}`);
const html = await htmlRes.text();

await fs.mkdir('docs/audit/stitch-pro-strict', { recursive: true });
await fs.writeFile('docs/audit/stitch-pro-strict/index.html', html);
await fs.writeFile('docs/audit/stitch-pro-strict/meta.json', JSON.stringify({
  projectId: project.id,
  screenId: screen.id,
  htmlUrl,
  imageUrl,
  model: 'GEMINI_3_PRO',
  generatedAt: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify({ projectId: project.id, screenId: screen.id, model: 'GEMINI_3_PRO' }, null, 2));
