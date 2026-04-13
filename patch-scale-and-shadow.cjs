/**
 * patch-scale-and-shadow.cjs
 *
 * Fixes (Edit + Export only — Live page untouched):
 * 1) Edit page: add ?? 1 safety to scale read so undefined doesn't cause NaN
 * 2) Export page: redraw logo after text shadow cleanup so text shadows
 *    don't obscure the logo
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

  // ── FIX 1: Edit page na — add ?? 1 safety for scale ──
  const oldNa = 'na=An?Re.name.scale:1';
  const newNa = 'na=An?(Re.name.scale??1):1';
  if (code.includes(oldNa)) {
    code = code.replace(oldNa, newNa);
    console.log(`[${file}] Fix 1: Edit na scale safety`);
    changes++;
  } else if (code.includes(newNa)) {
    console.log(`[${file}] Fix 1: already applied`);
  } else {
    console.warn(`[${file}] Fix 1: pattern not found!`);
  }

  // ── FIX 2: Export page — redraw logo after shadow cleanup ──

  // Step A: Add outer-scope variables before the eyebrow block
  const logoBlockMarker = '}const U=M?te:Math.round(te+D.x*b),Q=M?te:Math.round(te+B.x*b),oe=M?te:Math.round(te+k.x*b);if(R||f){';
  const logoBlockReplace = '}var _xLI=null,_xLX=0,_xLY=0,_xLW=0,_xLH=0,_xLOp=1;const U=M?te:Math.round(te+D.x*b),Q=M?te:Math.round(te+B.x*b),oe=M?te:Math.round(te+k.x*b);if(R||f){';
  if (code.includes(logoBlockMarker)) {
    code = code.replace(logoBlockMarker, logoBlockReplace);
    console.log(`[${file}] Fix 2a: Added export logo outer vars`);
    changes++;
  } else if (code.includes(logoBlockReplace)) {
    console.log(`[${file}] Fix 2a: already applied`);
  } else {
    console.warn(`[${file}] Fix 2a: pattern not found!`);
  }

  // Step B: Store logo info inside the eyebrow block, after position computation
  const logoStoreOld = 'const $e=q;f&&(u?(n.save(),n.globalCompositeOperation="source-over",n.drawImage(f,Qe,$e,we,le)';
  const logoStoreNew = 'const $e=q;_xLI=f;_xLX=Qe;_xLY=$e;_xLW=we;_xLH=le;_xLOp=D.opacity;f&&(u?(n.save(),n.globalCompositeOperation="source-over",n.drawImage(f,Qe,$e,we,le)';
  if (code.includes(logoStoreOld)) {
    code = code.replace(logoStoreOld, logoStoreNew);
    console.log(`[${file}] Fix 2b: Store export logo position`);
    changes++;
  } else if (code.includes(logoStoreNew)) {
    console.log(`[${file}] Fix 2b: already applied`);
  } else {
    console.warn(`[${file}] Fix 2b: pattern not found!`);
  }

  // Step C: Redraw logo after shadow cleanup, before underline
  const shadowCleanup = 'n.shadowBlur=0;n.shadowOffsetX=0;n.shadowOffsetY=0;n.filter="none";if(p.underline)';
  const shadowCleanupNew = 'n.shadowBlur=0;n.shadowOffsetX=0;n.shadowOffsetY=0;n.filter="none";if(_xLI){n.save();n.globalAlpha=_xLOp;if(u){n.globalCompositeOperation="source-over";n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH);n.globalCompositeOperation="source-atop";n.fillStyle="#FFFFFF";n.fillRect(_xLX,_xLY,_xLW,_xLH)}else{n.drawImage(_xLI,_xLX,_xLY,_xLW,_xLH)}n.restore()}if(p.underline)';
  if (code.includes(shadowCleanup)) {
    code = code.replace(shadowCleanup, shadowCleanupNew);
    console.log(`[${file}] Fix 2c: Logo redraw after shadow cleanup`);
    changes++;
  } else if (code.includes(shadowCleanupNew)) {
    console.log(`[${file}] Fix 2c: already applied`);
  } else {
    console.warn(`[${file}] Fix 2c: pattern not found!`);
  }

  if (changes === 0) {
    console.log(`[${file}] No changes needed.`);
    continue;
  }

  // Validate syntax
  try {
    acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
    console.log(`[${file}] ✓ Syntax OK (${changes} fixes, ${code.length - origLen} bytes delta)`);
  } catch (e) {
    console.error(`[${file}] ✗ SYNTAX ERROR at ${e.pos}: ${e.message}`);
    console.error(`  Context: ...${code.substring(e.pos - 60, e.pos + 60)}...`);
    process.exit(1);
  }

  fs.writeFileSync(fullPath, code);
  console.log(`[${file}] Written.`);
}

console.log('\nDone.');
