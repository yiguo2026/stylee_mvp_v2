const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('dist/index.html not found');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');

const shellStyle = `<style>
@media (min-width: 430px) {
  body {
    background-color: #f4f4f5;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #root {
    width: 393px;
    height: 852px;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
  }
}
</style>`;

html = html.replace('<html lang="en">', '<html lang="zh">');
html = html.replace('</head>', shellStyle + '\n</head>');

fs.writeFileSync(htmlPath, html);
console.log('Patched dist/index.html: web shell + lang=zh');
