import { stitch } from '@google/stitch-sdk';
import fs from 'node:fs/promises';

const findings = await fs.readFile('docs/audit/fullrun/FULL-AUDIT-FINDINGS.md', 'utf8');
const lh = JSON.parse(await fs.readFile('docs/audit/fullrun/lh-summary.json', 'utf8'));
const endpoint = JSON.parse(await fs.readFile('docs/audit/fullrun/live-endpoint-status.json', 'utf8'));

const screenshots = [
  'https://h-town.duckdns.org/wedding-audit-pro/assets/01-home.png',
  'https://h-town.duckdns.org/wedding-audit-pro/assets/02-after-chat-open.png',
  'https://h-town.duckdns.org/wedding-audit-pro/assets/03-coverage.png'
];

const prompt = `
Design a premium German audit page as production HTML.
Must be serious, engineering-grade, no fake product nav, no nonsense placeholders.

Use this as source of truth and preserve content:
${findings}

Include KPI cards with these values from lh-desktop:
Performance ${lh['lh-desktop']?.performance ?? lh['lh-mobile']?.performance}
Accessibility ${lh['lh-desktop']?.accessibility ?? lh['lh-mobile']?.accessibility}
Best Practices ${lh['lh-desktop']?.['best-practices'] ?? lh['lh-mobile']?.['best-practices']}
SEO ${lh['lh-desktop']?.seo ?? lh['lh-mobile']?.seo}
FCP ${lh['lh-desktop']?.fcp ?? ''}
LCP ${lh['lh-desktop']?.lcp ?? ''}
CLS ${lh['lh-desktop']?.cls ?? ''}
TBT ${lh['lh-desktop']?.tbt ?? ''}

Include endpoint status table from this JSON:
${JSON.stringify(endpoint, null, 2)}

Include evidence gallery with these images:
${screenshots.join('\n')}

Required sections:
- Executive summary
- User-realistic test runs
- KPI & Web Vitals
- Findings by severity (P0/P1/P2)
- Security header parity findings
- Endpoint verification table
- Action plan roadmap
- Evidence gallery
- Final "Was jetzt live ist" proof block

Output full HTML.
`;

async function generateWithRetry(max = 3) {
  let lastErr;
  for (let i = 1; i <= max; i++) {
    try {
      const project = await stitch.createProject(`Wedding FULL Audit ${new Date().toISOString()}`);
      let screen = await project.generate(prompt, 'DESKTOP');
      screen = await screen.edit(
        `Refine visual quality to top-tier enterprise audit report. Keep all facts and sections intact. Return full HTML.`,
        'DESKTOP',
        'GEMINI_3_PRO'
      );
      return { project, screen };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1200 * i));
    }
  }
  throw lastErr;
}

const { project, screen } = await generateWithRetry(3);
const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();
const res = await fetch(htmlUrl);
if (!res.ok) throw new Error(`download failed ${res.status}`);
const html = await res.text();

await fs.mkdir('docs/audit/fullrun/stitch', { recursive: true });
await fs.writeFile('docs/audit/fullrun/stitch/index.html', html);
await fs.writeFile('docs/audit/fullrun/stitch/meta.json', JSON.stringify({
  projectId: project.id,
  screenId: screen.id,
  htmlUrl,
  imageUrl,
  model: 'GEMINI_3_PRO',
  generatedAt: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify({ projectId: project.id, screenId: screen.id, model: 'GEMINI_3_PRO' }, null, 2));
