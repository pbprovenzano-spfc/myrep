// Gera o teaser autocontido (fontes e logos embutidos) e, com --mp4, exporta o vídeo.
//   node midia/teaser/build.js          → midia/teaser/dist/teaser.html
//   node midia/teaser/build.js --mp4    → também midia/teaser/dist/teaser-myrep.mp4 (1080×1920, 30 fps)
// O MP4 precisa de ffmpeg no PATH e do Playwright com Chromium.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const DIST = path.join(__dirname, 'dist');
const FPS = 30;

function dataUri(arquivo, tipo) {
  return `data:${tipo};base64,${fs.readFileSync(arquivo).toString('base64')}`;
}

function fonte(familia, arquivo, pesos) {
  return `@font-face { font-family: "${familia}"; font-weight: ${pesos}; font-display: block; ` +
    `src: url(${dataUri(path.join(__dirname, 'fontes', arquivo), 'font/woff2')}) format("woff2"); }`;
}

function gerarHtml() {
  const fontes = [
    fonte('Bricolage Grotesque', 'bricolage-grotesque.woff2', '200 800'),
    fonte('Figtree', 'figtree.woff2', '300 900'),
  ].join('\n');

  const html = fs.readFileSync(path.join(__dirname, 'teaser.html'), 'utf8')
    .replace('/*FONTES*/', fontes)
    .replaceAll('{{LOGO_MR}}', dataUri(path.join(RAIZ, 'publico/img/logo-192.png'), 'image/png'))
    .replaceAll('{{LOGO_KP}}', dataUri(path.join(RAIZ, 'assets-clientes/kp-representacao/logo-kp.png'), 'image/png'));

  fs.mkdirSync(DIST, { recursive: true });
  const saida = path.join(DIST, 'teaser.html');
  fs.writeFileSync(saida, html);
  console.log(`HTML: ${path.relative(RAIZ, saida)} (${(html.length / 1024).toFixed(0)} KB)`);
  return saida;
}

async function gerarMp4(arquivoHtml) {
  const { chromium } = require('playwright');
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 } });

  // O teaser é escrito sem <!doctype> (o Artifact adiciona); aqui envolvemos para evitar quirks mode.
  const corpo = fs.readFileSync(arquivoHtml, 'utf8');
  await pagina.addInitScript(() => { window.__teaserRender = true; });
  await pagina.goto('data:text/html,');
  await pagina.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${corpo}</body></html>`);
  await pagina.evaluate(() => document.fonts.ready);

  const saida = path.join(DIST, 'teaser-myrep.mp4');
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-movflags', '+faststart', saida,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const duracao = await pagina.evaluate(() => window.teaser.duracao);
  const total = duracao * FPS;
  const palco = await pagina.$('#palco');
  for (let i = 0; i < total; i++) {
    await pagina.evaluate((s) => window.teaser.posicionar(s), i / FPS);
    const png = await palco.screenshot({ type: 'png' });
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (i % FPS === 0) process.stdout.write(`\rQuadros: ${i}/${total}`);
  }
  ffmpeg.stdin.end();
  await new Promise((ok, falha) => ffmpeg.on('close', (c) => (c === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${c}`)))));
  await navegador.close();
  console.log(`\nMP4: ${path.relative(RAIZ, saida)}`);
}

(async () => {
  const html = gerarHtml();
  if (process.argv.includes('--mp4')) await gerarMp4(html);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
