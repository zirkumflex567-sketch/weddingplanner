import { stitch } from '@google/stitch-sdk';
import fs from 'node:fs/promises';

const lighthouse = JSON.parse(await fs.readFile('docs/audit/artifacts/lighthouse-v2/summary.json', 'utf8'));
const liveHealth = JSON.parse(await fs.readFile('docs/audit/artifacts/live-v2/live-health.json', 'utf8'));
const headersHome = await fs.readFile('docs/audit/artifacts/http-v2/headers-home.txt', 'utf8');
const headersApi = await fs.readFile('docs/audit/artifacts/http-v2/headers-api.txt', 'utf8');

const screenshots = [
  'https://h-town.duckdns.org/wedding-audit-pro/assets/01-home.png',
  'https://h-town.duckdns.org/wedding-audit-pro/assets/02-after-chat-open.png',
  'https://h-town.duckdns.org/wedding-audit-pro/assets/03-coverage.png'
];

const basePrompt = `
Create a standalone, production-grade German audit page (single HTML file) for a live web app.
Use a premium visual system and make it look like an executive engineering report.

Must include:
- Title: "WeddingPlanner Live Vollaudit"
- Subtitle proving merged chat+design-studio deployment is live
- KPI cards with exact values:
  - Performance ${lighthouse.categories.performance}
  - Accessibility ${lighthouse.categories.accessibility}
  - Best Practices ${lighthouse.categories['best-practices']}
  - SEO ${lighthouse.categories.seo}
- Core metrics row:
  - FCP ${lighthouse.metrics.fcp}
  - LCP ${lighthouse.metrics.lcp}
  - CLS ${lighthouse.metrics.cls}
  - TBT ${lighthouse.metrics.tbt}
- Live verification section:
  - web health ${liveHealth.health.web}
  - api health ${liveHealth.health.api}
  - mention verified endpoints: /prototype/workspaces, /prototype/consultant/sessions/:workspaceId, /prototype/consultant/reply, /prototype/ingestion/coverage
- Audit pass table with domains: UX, Accessibility, Security, SEO, Performance, Code Quality, Architecture, Chat Flow
- Security headers summary from snapshots
- Prioritized action plan P0/P1/P2
- Evidence gallery rendering these images as real <img> elements:
${screenshots.join('\n')}

Output: final HTML.
`;

const project = await stitch.createProject(`Wedding Audit PRO ${new Date().toISOString()}`);
let screen = await project.generate(basePrompt, 'DESKTOP');

screen = await screen.edit(
  `Upgrade this design to an even more premium, cohesive, high-end look.
Use stronger spacing rhythm, better hierarchy, cleaner cards, better table readability, and elegant gradients.
Do not remove any data sections. Keep all factual values and endpoint strings intact.
Return complete HTML.`,
  'DESKTOP',
  'GEMINI_3_PRO'
);

screen = await screen.edit(
  `Final refinement pass:
- Make the page feel like a top-tier audit dashboard, not a template.
- Ensure all KPI values and metrics remain exactly as provided.
- Add a concise "Was jetzt live ist" section explicitly stating chat + design-studio merged and deployed.
- Keep evidence gallery visible and professional.
Return complete HTML only.`,
  'DESKTOP',
  'GEMINI_3_PRO'
);

const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();
const htmlRes = await fetch(htmlUrl);
if (!htmlRes.ok) throw new Error(`Failed html download: ${htmlRes.status}`);
const html = await htmlRes.text();

await fs.mkdir('docs/audit/stitch-pro', { recursive: true });
await fs.writeFile('docs/audit/stitch-pro/index.html', html);
await fs.writeFile('docs/audit/stitch-pro/meta.json', JSON.stringify({
  projectId: project.id,
  screenId: screen.id,
  htmlUrl,
  imageUrl,
  model: 'GEMINI_3_PRO',
  generatedAt: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify({ projectId: project.id, screenId: screen.id, model: 'GEMINI_3_PRO', imageUrl }, null, 2));
