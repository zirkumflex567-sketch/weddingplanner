import { stitch } from '@google/stitch-sdk';
import fs from 'node:fs/promises';

const projectId = '12194359104667566928';
const screenId = 'ffdd3a16c507454d8e5e9b5a8e39529f';

const project = stitch.project(projectId);
let screen = await project.getScreen(screenId);

screen = await screen.edit(
  `Convert this page to fully self-contained HTML.
Hard requirements:
- remove all external scripts
- remove all external stylesheet links
- no Tailwind CDN
- no Google Fonts
- keep premium design using inline CSS only
- keep sections and audit data intact
Return complete HTML.`,
  'DESKTOP',
  'GEMINI_3_PRO'
);

const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();
const res = await fetch(htmlUrl);
if (!res.ok) throw new Error(`download failed ${res.status}`);
let html = await res.text();
html = html
  .replace(/<script[^>]*src=[^>]*><\/script>/gi, '')
  .replace(/<link[^>]*href=["']https?:\/\/[^"']+["'][^>]*>/gi, '');

await fs.mkdir('docs/audit/stitch-pro-inline', { recursive: true });
await fs.writeFile('docs/audit/stitch-pro-inline/index.html', html);
await fs.writeFile('docs/audit/stitch-pro-inline/meta.json', JSON.stringify({
  sourceProjectId: projectId,
  sourceScreenId: screenId,
  editedScreenId: screen.id,
  htmlUrl,
  imageUrl,
  model: 'GEMINI_3_PRO',
  mode: 'edit-inline-css-no-cdn',
  generatedAt: new Date().toISOString()
}, null, 2));

console.log(JSON.stringify({ editedScreenId: screen.id, model: 'GEMINI_3_PRO' }, null, 2));
