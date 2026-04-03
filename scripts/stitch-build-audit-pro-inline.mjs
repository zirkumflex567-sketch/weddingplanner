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
Create a single-file production HTML audit page in German.
IMPORTANT HARD CONSTRAINTS:
- No external CSS frameworks.
- No <script src> CDN links.
- No external fonts.
- Must include all styling in one inline <style> block.
- Must render fully styled even offline.

Content requirements:
- H1: WeddingPlanner Live Vollaudit
- Badge text: LIVE VERIFIZIERT
- Deployment note: chat + design-studio merged and live
- KPI: Performance ${lighthouse.categories.performance}, Accessibility ${lighthouse.categories.accessibility}, Best Practices ${lighthouse.categories['best-practices']}, SEO ${lighthouse.categories.seo}
- Metrics: FCP ${lighthouse.metrics.fcp}, LCP ${lighthouse.metrics.lcp}, CLS ${lighthouse.metrics.cls}, TBT ${lighthouse.metrics.tbt}
- Endpoint checks including /prototype/workspaces, /prototype/consultant/reply, /prototype/ingestion/coverage
- Findings table
- P0/P1/P2 action plan
- Evidence gallery using these image URLs:
${screenshots.join('\n')}

Design: premium dark, clean executive engineering report.
Output complete final HTML.
`;

const project = await stitch.createProject(`Wedding Audit INLINE ${new Date().toISOString()}`);
let screen = await project.generate(prompt, 'DESKTOP');
screen = await screen.edit(
  `Ensure the output contains NO external dependencies at all.
If you used tailwind/google fonts/scripts, replace them with pure inline CSS and semantic HTML.
Return full HTML only.`,
  'DESKTOP',
  'GEMINI_3_PRO'
);

const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();
const htmlRes = await fetch(htmlUrl);
if (!htmlRes.ok) throw new Error(`Failed html download: ${htmlRes.status}`);
let html = await htmlRes.text();

// Safety sanitize: remove any remaining external script/link except favicon
html = html
  .replace(/<script[^>]*src=[^>]*><\/script>/gi, '')
  .replace(/<link[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi, '');

await fs.mkdir('docs/audit/stitch-pro-inline', { recursive: true });
await fs.writeFile('docs/audit/stitch-pro-inline/index.html', html);
await fs.writeFile('docs/audit/stitch-pro-inline/meta.json', JSON.stringify({
  projectId: project.id,
  screenId: screen.id,
  htmlUrl,
  imageUrl,
  model: 'GEMINI_3_PRO',
  mode: 'inline-css-no-cdn',
  generatedAt: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify({ projectId: project.id, screenId: screen.id, model: 'GEMINI_3_PRO' }, null, 2));
