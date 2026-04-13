/**
 * patch-meta-drawimage.cjs
 *
 * Replace Edit page's meta block (ctx.translate/ctx.scale approach)
 * with drawImage approach matching exactly how the Live page works.
 *
 * Also applies the same fix to the Export page's meta block.
 */

const fs = require('fs');
const acorn = require('acorn');

const files = [
  'dist/public/assets/index-iitzneuS.js',
  'dist/public/assets/index-DJse72FL.js',
];

for (const file of files) {
  const fullPath = __dirname + '/' + file;
  let code = fs.readFileSync(fullPath, 'utf8');
  const origLen = code.length;
  let changes = 0;

  // ── FIX: Replace Edit meta block with drawImage approach ──
  // Find the exact meta block
  const ifStart = code.indexOf('if(An&&Oe){');
  if (ifStart < 0) {
    console.warn(`[${file}] Cannot find if(An&&Oe){`);
    continue;
  }
  let depth = 0, ifEnd;
  for (let i = ifStart; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') { depth--; if (depth === 0) { ifEnd = i + 1; break; } }
  }
  const oldBlock = code.substring(ifStart, ifEnd);
  console.log(`[${file}] Old meta block length: ${oldBlock.length}`);

  // Build new meta block matching Live page's drawImage approach
  // Variables available: An, Oe (offscreen), na (scale), Ga (drift X),
  //   L (posX), he (eyebrowGap), re (titleGap), qa (nameY), H (colorCtx), G (alphaCtx),
  //   Re (animation values), z (shadowEnabled), U (shadowColor), oe (shadowStrength),
  //   ie (shadowOffsetX), te (shadowOffsetY), q (shadowBlur), $ (text color)
  const newBlock = `if(An&&Oe){` +
    // Scale ratio (same as Live: G = tr / H.maxScale)
    `var _S=Oe,_G=na/_S.maxScale,_pad=_S.drawPad,_dstX=L+Ga;` +
    // Y positions: compute dynamically based on scaled content heights (matches Live)
    `var _nameY=qa,_titleY=_nameY+_S.nameContentH*_G+re,_eyeY=_nameY-_S.eyebrowContentH*_G-he;` +
    // Draw alpha canvas (G context) — eyebrow, name, title
    `_S.eyebrowContentW>0&&(G.save(),G.globalAlpha=Re.eyebrow.opacity,G.drawImage(_S.alphaCanvas,_S.eyebrow.x,_S.eyebrow.y,_S.eyebrow.w,_S.eyebrow.h,_dstX-_pad*_G,_eyeY-_pad*_G,_S.eyebrow.w*_G,_S.eyebrow.h*_G),G.restore());` +
    `G.save(),G.globalAlpha=Re.name.opacity,G.drawImage(_S.alphaCanvas,_S.name.x,_S.name.y,_S.name.w,_S.name.h,_dstX-_pad*_G,_nameY-_pad*_G,_S.name.w*_G,_S.name.h*_G),G.restore();` +
    `G.save(),G.globalAlpha=Re.title.opacity,G.drawImage(_S.alphaCanvas,_S.title.x,_S.title.y,_S.title.w,_S.title.h,_dstX-_pad*_G,_titleY-_pad*_G,_S.title.w*_G,_S.title.h*_G),G.restore();` +
    // Shadow pass on color canvas (H context) — with drop-shadow filter
    `if(z){var _shFM=function(){var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();` +
    `_S.eyebrowContentW>0&&(H.save(),H.filter=_shFM,H.globalAlpha=Re.eyebrow.opacity,H.drawImage(_S.colorCanvas,_S.eyebrow.x,_S.eyebrow.y,_S.eyebrow.w,_S.eyebrow.h,_dstX-_pad*_G,_eyeY-_pad*_G,_S.eyebrow.w*_G,_S.eyebrow.h*_G),H.restore());` +
    `H.save(),H.filter=_shFM,H.globalAlpha=Re.name.opacity,H.drawImage(_S.colorCanvas,_S.name.x,_S.name.y,_S.name.w,_S.name.h,_dstX-_pad*_G,_nameY-_pad*_G,_S.name.w*_G,_S.name.h*_G),H.restore();` +
    `H.save(),H.filter=_shFM,H.globalAlpha=Re.title.opacity,H.drawImage(_S.colorCanvas,_S.title.x,_S.title.y,_S.title.w,_S.title.h,_dstX-_pad*_G,_titleY-_pad*_G,_S.title.w*_G,_S.title.h*_G),H.restore();` +
    // Clean pass on color canvas — no filter
    `_S.eyebrowContentW>0&&(H.save(),H.globalAlpha=Re.eyebrow.opacity,H.drawImage(_S.colorCanvas,_S.eyebrow.x,_S.eyebrow.y,_S.eyebrow.w,_S.eyebrow.h,_dstX-_pad*_G,_eyeY-_pad*_G,_S.eyebrow.w*_G,_S.eyebrow.h*_G),H.restore());` +
    `H.save(),H.globalAlpha=Re.name.opacity,H.drawImage(_S.colorCanvas,_S.name.x,_S.name.y,_S.name.w,_S.name.h,_dstX-_pad*_G,_nameY-_pad*_G,_S.name.w*_G,_S.name.h*_G),H.restore();` +
    `H.save(),H.globalAlpha=Re.title.opacity,H.drawImage(_S.colorCanvas,_S.title.x,_S.title.y,_S.title.w,_S.title.h,_dstX-_pad*_G,_titleY-_pad*_G,_S.title.w*_G,_S.title.h*_G),H.restore()` +
    `}else{` +
    // No shadow — just draw color canvas directly
    `_S.eyebrowContentW>0&&(H.save(),H.globalAlpha=Re.eyebrow.opacity,H.drawImage(_S.colorCanvas,_S.eyebrow.x,_S.eyebrow.y,_S.eyebrow.w,_S.eyebrow.h,_dstX-_pad*_G,_eyeY-_pad*_G,_S.eyebrow.w*_G,_S.eyebrow.h*_G),H.restore());` +
    `H.save(),H.globalAlpha=Re.name.opacity,H.drawImage(_S.colorCanvas,_S.name.x,_S.name.y,_S.name.w,_S.name.h,_dstX-_pad*_G,_nameY-_pad*_G,_S.name.w*_G,_S.name.h*_G),H.restore();` +
    `H.save(),H.globalAlpha=Re.title.opacity,H.drawImage(_S.colorCanvas,_S.title.x,_S.title.y,_S.title.w,_S.title.h,_dstX-_pad*_G,_titleY-_pad*_G,_S.title.w*_G,_S.title.h*_G),H.restore()` +
    `}` +
    `H.globalAlpha=1,G.globalAlpha=1}`;

  code = code.substring(0, ifStart) + newBlock + code.substring(ifEnd);
  console.log(`[${file}] New meta block length: ${newBlock.length}`);
  changes++;

  // Validate syntax
  try {
    acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
    console.log(`[${file}] ✓ Syntax OK (${code.length - origLen} bytes delta)`);
  } catch (e) {
    console.error(`[${file}] ✗ SYNTAX ERROR at ${e.pos}: ${e.message}`);
    console.error(`  Context: ...${code.substring(e.pos - 80, e.pos)}<<<HERE>>>${code.substring(e.pos, e.pos + 80)}...`);
    process.exit(1);
  }

  fs.writeFileSync(fullPath, code);
  console.log(`[${file}] Written.`);
}

console.log('\nDone.');
