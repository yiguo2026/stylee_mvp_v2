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
@media (min-width: 430px) and (min-height: 900px) {
  body {
    background-color: #f4f4f5 !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    overflow: hidden !important;
  }
  #root {
    width: 393px !important;
    height: 852px !important;
    flex: none !important;
    max-width: 393px !important;
    max-height: 852px !important;
    border-radius: 20px !important;
    overflow: hidden !important;
    box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05) !important;
  }
}
</style>`;

// ── 3. Apply patches ──
html = html.replace('<html lang="en">', '<html lang="zh">');
html = html.replace('</head>', fontFaceStyle + shellStyle + '\n</head>');

fs.writeFileSync(htmlPath, html);

const fontCount = fontMap.filter(({ dir }) => {
  const fullDir = path.join(fontsBase, dir);
  return fs.existsSync(fullDir) && fs.readdirSync(fullDir).some(f => f.endsWith('.ttf'));
}).length;

console.log(`Patched dist/index.html: lang=zh + ${fontCount} @font-face + web shell`);
