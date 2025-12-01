import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="102" fill="url(#gradient)"/>
  <text x="256" y="348" font-family="Arial, sans-serif" font-size="280" font-weight="bold" fill="white" text-anchor="middle">T</text>
</svg>`;

const sizes = [192, 512];
const outputDir = join(__dirname, '..', 'public', 'icons');

async function generateIcons() {
  console.log('🎨 Generating PWA icons...\n');
  
  for (const size of sizes) {
    const outputPath = join(outputDir, `icon-${size}.png`);
    
    await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`✅ Generated icon-${size}.png`);
  }
  
  console.log('\n🎉 All icons generated successfully!');
}

generateIcons().catch(console.error);
