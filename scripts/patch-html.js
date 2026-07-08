const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('dist/index.html not found');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

// ── 1. Generate @font-face rules from dist font files ──
const fontsBase = path.join(__dirname, '..', 'dist', 'assets', 'node_modules', '@expo-google-fonts');

const fontMap = [
  { family: 'PlayfairDisplay_400Regular', dir: 'playfair-display/400Regular' },
  { family: 'PlayfairDisplay_400Regular_Italic', dir: 'playfair-display/400Regular_Italic' },
  { family: 'PlayfairDisplay_500Medium', dir: 'playfair-display/500Medium' },
  { family: 'PlayfairDisplay_500Medium_Italic', dir: 'playfair-display/500Medium_Italic' },
  { family: 'PlayfairDisplay_600SemiBold', dir: 'playfair-display/600SemiBold' },
  { family: 'PlayfairDisplay_600SemiBold_Italic', dir: 'playfair-display/600SemiBold_Italic' },
  { family: 'Inter_300Light', dir: 'inter/300Light' },
  { family: 'Inter_400Regular', dir: 'inter/400Regular' },
  { family: 'Inter_500Medium', dir: 'inter/500Medium' },
  { family: 'Inter_600SemiBold', dir: 'inter/600SemiBold' },
];

let fontFaceCSS = '';
for (const { family, dir } of fontMap) {
  const fullDir = path.join(fontsBase, dir);
  if (fs.existsSync(fullDir)) {
    const files = fs.readdirSync(fullDir);
    const ttf = files.find(f => f.endsWith('.ttf'));
    if (ttf) {
      const src = `/assets/node_modules/@expo-google-fonts/${dir}/${ttf}`;
      fontFaceCSS += `@font-face{font-family:"${family}";src:url("${src}") format("truetype");font-display:swap;}\n`;
    }
  }
}

const fontFaceStyle = fontFaceCSS
  ? `<style>\n${fontFaceCSS}</style>\n`
  : '';

// ── 2. Web shell: iPhone 14 Pro frame on desktop ──
const shellStyle = `<style>
@media (min-width: 960px) {
  body {
    background: linear-gradient(180deg, #f7f7f8 0%, #efeff1 100%) !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    min-height: 100vh !important;
    margin: 0 !important;
    padding: 32px !important;
    box-sizing: border-box !important;
    overflow: auto !important;
  }
  .desktop-phone-stage {
    --phone-scale: min(1, calc((100vw - 96px) / 425), calc((100vh - 64px) / 884));
    width: calc(425px * var(--phone-scale));
    height: calc(884px * var(--phone-scale));
    flex: none;
  }
  .desktop-phone-frame {
    position: relative;
    width: 425px;
    height: 884px;
    transform: scale(var(--phone-scale));
    transform-origin: top left;
    padding: 14px;
    box-sizing: border-box;
    border-radius: 60px;
    background: linear-gradient(180deg, #2f3136 0%, #111216 22%, #09090b 100%);
    box-shadow: 0 32px 80px rgba(15, 23, 42, 0.22), 0 10px 24px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(255, 255, 255, 0.08);
  }
  .desktop-phone-screen {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 48px;
    background: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(10, 10, 10, 0.06);
    isolation: isolate;
  }
  .desktop-phone-screen::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    pointer-events: none;
    z-index: 3;
  }
  .desktop-phone-statusbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    height: 60px;
    padding: 14px 28px 0;
    box-sizing: border-box;
    color: #0a0a0a;
    font-family: Inter_600SemiBold, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    pointer-events: none;
  }
  .desktop-phone-time {
    position: absolute;
    left: 28px;
    top: 15px;
    font-size: 15px;
    letter-spacing: -0.2px;
  }
  .desktop-phone-island {
    position: absolute;
    left: 50%;
    top: 10px;
    width: 126px;
    height: 34px;
    margin-left: -63px;
    border-radius: 18px;
    background: #0a0a0a;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  .desktop-phone-system {
    position: absolute;
    right: 28px;
    top: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .desktop-phone-network {
    font-size: 11px;
    line-height: 1;
  }
  .desktop-phone-signal {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }
  .desktop-phone-signal i {
    display: block;
    width: 2px;
    background: #0a0a0a;
    border-radius: 999px;
  }
  .desktop-phone-signal i:nth-child(1) { height: 4px; opacity: 0.55; }
  .desktop-phone-signal i:nth-child(2) { height: 6px; opacity: 0.7; }
  .desktop-phone-signal i:nth-child(3) { height: 8px; opacity: 0.85; }
  .desktop-phone-signal i:nth-child(4) { height: 10px; }
  .desktop-phone-wifi {
    width: 15px;
    height: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #0a0a0a;
  }
  .desktop-phone-wifi svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .desktop-phone-battery {
    position: relative;
    width: 24px;
    height: 12px;
    border: 1.6px solid #0a0a0a;
    border-radius: 4px;
    box-sizing: border-box;
  }
  .desktop-phone-battery::after {
    content: "";
    position: absolute;
    right: -3px;
    top: 3px;
    width: 2px;
    height: 4px;
    border-radius: 1px;
    background: #0a0a0a;
  }
  .desktop-phone-battery-fill {
    position: absolute;
    left: 2px;
    top: 2px;
    bottom: 2px;
    width: 14px;
    border-radius: 2px;
    background: #0a0a0a;
  }
  #root {
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    height: 100% !important;
    flex: none !important;
    overflow: hidden !important;
    border-radius: 48px !important;
    background: #ffffff !important;
    padding-top: 60px !important;
    box-sizing: border-box !important;
  }
}
</style>`;

const shellMarkup = `<div class="desktop-phone-stage"><div class="desktop-phone-frame"><div class="desktop-phone-screen"><div class="desktop-phone-statusbar" aria-hidden="true"><span class="desktop-phone-time">9:41</span><span class="desktop-phone-island"></span><div class="desktop-phone-system"><span class="desktop-phone-network">5G</span><span class="desktop-phone-signal"><i></i><i></i><i></i><i></i></span><span class="desktop-phone-wifi"><svg viewBox="0 0 16 12" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.2C3.7 3.5 5.7 2.6 8 2.6c2.3 0 4.3 0.9 6 2.6"/><path d="M4.3 7.2C5.4 6.2 6.6 5.7 8 5.7c1.4 0 2.6 0.5 3.7 1.5"/><circle cx="8" cy="9.4" r="0.9" fill="currentColor" stroke="none"/></svg></span><span class="desktop-phone-battery"><span class="desktop-phone-battery-fill"></span></span></div></div><div id="root"></div></div></div></div>`;

// ── 3. Apply patches ──
html = html.replace('<html lang="en">', '<html lang="zh">');
html = html.replace('</head>', fontFaceStyle + shellStyle + '\n</head>');
html = html.replace('<div id="root"></div>', shellMarkup);

fs.writeFileSync(htmlPath, html);

// ── 4. Create 404.html (identical to index.html for SPA routing on GitHub Pages) ──
const html404Path = path.join(__dirname, '..', 'dist', '404.html');
fs.writeFileSync(html404Path, html);

const fontCount = fontMap.filter(({ dir }) => {
  const fullDir = path.join(fontsBase, dir);
  return fs.existsSync(fullDir) && fs.readdirSync(fullDir).some(f => f.endsWith('.ttf'));
}).length;

console.log(`Patched dist/index.html: lang=zh + ${fontCount} @font-face + web shell + 404.html`);
