import { stitch } from '@google/stitch-sdk';
import fs from 'node:fs/promises';

const lighthouse = JSON.parse(await fs.readFile('docs/audit/artifacts/lighthouse-v2/summary.json', 'utf8'));
const liveHealth = JSON.parse(await fs.readFile('docs/audit/artifacts/live-v2/live-health.json', 'utf8'));

const headersHome = await fs.readFile('docs/audit/artifacts/http-v2/headers-home.txt', 'utf8');
const headersApi = await fs.readFile('docs/audit/artifacts/http-v2/headers-api.txt', 'utf8');

const screenshotBase = 'https://h-town.duckdns.org/wedding-audit-pro/assets';
const screenshots = [
  '01-home.png',
  '02-after-chat-open.png',
  '03-coverage.png'
].map((name) => `${screenshotBase}/${name}`);

const skillsUsed = [
  'audit-website',
  'performance',
  'seo',
  'accessibility',
  'webapp-testing',
  'security-review',
  'code-review-excellence',
  'architecture-patterns',
  'ui-ux-pro-max',
  'web-design-guidelines',
  'browser-use',
  'stitch-design',
  'stitch-loop',
  'design-md'
];

const prompt = `
Create a premium dark enterprise audit page in German as standalone HTML.
Title: "WeddingPlanner Live Vollaudit (Chat + Design Studio)".

Hard requirements:
1) Hero with status pill "LIVE VERIFIZIERT" and deployment hash area.
2) KPI cards with these values:
- Performance ${lighthouse.categories.performance}
- Accessibility ${lighthouse.categories.accessibility}
- Best Practices ${lighthouse.categories['best-practices']}
- SEO ${lighthouse.categories.seo}
3) Core Web Vitals strip:
- FCP ${lighthouse.metrics.fcp}
- LCP ${lighthouse.metrics.lcp}
- CLS ${lighthouse.metrics.cls}
- TBT ${lighthouse.metrics.tbt}
4) A section "Live-Verifikation" including:
- web health ${liveHealth.health.web}
- api health ${liveHealth.health.api}
- explicit mention that consultant endpoints and ingestion coverage endpoint were tested.
5) A section "Skill-basierte Audit-Pässe" with a clean table listing all skills:
${skillsUsed.join(', ')}
6) A section "Security Header Snapshot" with summarized findings from these raw headers:
HOME HEADERS:\n${headersHome.slice(0, 1200)}
API HEADERS:\n${headersApi.slice(0, 1200)}
7) A prioritized action plan with P0/P1/P2 including chat robustness, SEO snippet improvement, security header parity, and CLS guardrails.
8) Evidence gallery with these image URLs (render as actual images):
${screenshots.join('\n')}
9) A section "Was jetzt live ist" emphasizing merged branches chat + design studio.
10) Use excellent typography hierarchy, subtle gradients, strong card composition, high readability, responsive layout.

Output must be complete final HTML only.
`;

const created = await stitch.callTool('create_project', {
  title: `Wedding Audit V2 ${new Date().toISOString()}`
});

const projectId = created.name.split('/').pop();
if (!projectId) throw new Error('No project id');
const project = stitch.project(projectId);
const screen = await project.generate(prompt);

const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();
const htmlRes = await fetch(htmlUrl);
if (!htmlRes.ok) throw new Error(`Failed html download: ${htmlRes.status}`);
const html = await htmlRes.text();

await fs.mkdir('docs/audit/stitch-v2', { recursive: true });
await fs.writeFile('docs/audit/stitch-v2/index.html', html);
await fs.writeFile('docs/audit/stitch-v2/meta.json', JSON.stringify({
  projectId,
  screenId: screen.id,
  htmlUrl,
  imageUrl,
  generatedAt: new Date().toISOString(),
  skillsUsed
}, null, 2));

console.log(JSON.stringify({ projectId, screenId: screen.id, imageUrl }, null, 2));
