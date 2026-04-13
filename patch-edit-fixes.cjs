const fs = require('fs');

const files = [
  'dist/public/assets/index-iitzneuS.js',
  'dist/public/assets/index-DJse72FL.js'
];

for (const file of files) {
  console.log(`\n=== Patching ${file} ===`);
  let code = fs.readFileSync(file, 'utf8');
  let changed = false;

  // ======================================================================
  // FIX 1: baseEyebrowY — logo position when no eyebrow text
  // Change: Xr=n?ne-Vn-he:0  -->  Xr=(n||Ae.current)?ne-Vn-he:0
  // ======================================================================
  const oldEyebrowY = 'Xr=n?ne-Vn-he:0';
  const newEyebrowY = 'Xr=(n||Ae.current)?ne-Vn-he:0';
  if (code.includes(oldEyebrowY)) {
    code = code.replace(oldEyebrowY, newEyebrowY);
    console.log('  [OK] FIX 1: baseEyebrowY ternary updated');
    changed = true;
  } else if (code.includes(newEyebrowY)) {
    console.log('  [SKIP] FIX 1: already patched');
  } else {
    console.log('  [WARN] FIX 1: baseEyebrowY pattern not found');
  }

  // ======================================================================
  // FIX 2a: Change meta render scale from 1.121 to 4
  // The Edit page offscreen builder is called with At==="meta"?1.121:1
  // We need to change only the one near the Edit page's xR() call.
  // Strategy: find the specific call site near the Ye rendering function.
  // ======================================================================
  // The call passes: At==="meta"?1.121:1 as a parameter to xR()
  // We look for the specific context near the Edit page rendering setup
  const oldScale = 'At==="meta"?1.121:1';
  const newScale = 'At==="meta"?4:1';
  const scaleCount = code.split(oldScale).length - 1;
  if (scaleCount > 0) {
    // Replace ALL occurrences — using 4.0 everywhere is safe and matches Live
    code = code.split(oldScale).join(newScale);
    console.log(`  [OK] FIX 2a: Changed ${scaleCount} occurrences of meta render scale 1.121 -> 4`);
    changed = true;
  } else if (code.includes(newScale)) {
    console.log('  [SKIP] FIX 2a: already patched');
  } else {
    console.log('  [WARN] FIX 2a: meta render scale pattern not found');
  }

  // Also change the default in the offscreen builder: const _RS=_ms||1.121
  const oldDefault = '_ms||1.121';
  const newDefault = '_ms||4';
  if (code.includes(oldDefault)) {
    code = code.split(oldDefault).join(newDefault);
    console.log('  [OK] FIX 2a: Changed offscreen builder default scale 1.121 -> 4');
    changed = true;
  }

  // ======================================================================
  // FIX 2b: Replace meta rendering block with drawScaled pattern
  // Old: drawImage with destination-size scaling
  // New: drawScaled using ctx.translate + ctx.scale (matches Live.tsx)
  // ======================================================================
  const oldMetaBlock = [
    'if(An&&Oe){const Se=Oe,Ee=na/Se.maxScale,St=L+Ga,ia=he,ha=re,Ct=Se.drawPad,Dt=Se.regionPad,',
    'oa=Se.nameContentW*Ee,ja=Se.nameContentH*Ee,Xn=Se.titleContentW*Ee,Ba=Se.titleContentH*Ee,',
    'yn=Se.eyebrowContentW*Ee,Qt=Se.eyebrowContentH*Ee,_n=qa,qn=_n+ja+ha,ca=_n-Qt-ia;',
    'Se.eyebrowContentW>0&&(H.save(),H.globalAlpha=Re.eyebrow.opacity,H.drawImage(Se.colorCanvas,',
    'Se.eyebrow.x,Se.eyebrow.y,Se.eyebrow.w,Se.eyebrow.h,St-Ct*Ee,ca-Ct*Ee,Se.eyebrow.w*Ee,',
    'Se.eyebrow.h*Ee),H.restore());(H.save(),H.globalAlpha=Re.name.opacity,H.drawImage(Se.colorCanvas,',
    'Se.name.x,Se.name.y,Se.name.w,Se.name.h,St-Ct*Ee,_n-Ct*Ee,Se.name.w*Ee,Se.name.h*Ee),',
    'H.restore());(H.save(),H.globalAlpha=Re.title.opacity,H.drawImage(Se.colorCanvas,Se.title.x,',
    'Se.title.y,Se.title.w,Se.title.h,St-Ct*Ee,qn-Ct*Ee,Se.title.w*Ee,Se.title.h*Ee),H.restore());',
    'Se.eyebrowContentW>0&&(G.save(),G.globalAlpha=Re.eyebrow.opacity,G.drawImage(Se.alphaCanvas,',
    'Se.eyebrow.x,Se.eyebrow.y,Se.eyebrow.w,Se.eyebrow.h,St-Ct*Ee,ca-Ct*Ee,Se.eyebrow.w*Ee,',
    'Se.eyebrow.h*Ee),G.restore());(G.save(),G.globalAlpha=Re.name.opacity,G.drawImage(Se.alphaCanvas,',
    'Se.name.x,Se.name.y,Se.name.w,Se.name.h,St-Ct*Ee,_n-Ct*Ee,Se.name.w*Ee,Se.name.h*Ee),',
    'G.restore());(G.save(),G.globalAlpha=Re.title.opacity,G.drawImage(Se.alphaCanvas,Se.title.x,',
    'Se.title.y,Se.title.w,Se.title.h,St-Ct*Ee,qn-Ct*Ee,Se.title.w*Ee,Se.title.h*Ee),G.restore());',
    'if(z){var _tmpC=document.createElement("canvas");_tmpC.width=1920;_tmpC.height=1080;',
    'var _tmpX=_tmpC.getContext("2d");if(Se.eyebrowContentW>0){_tmpX.save();_tmpX.globalAlpha=Re.eyebrow.opacity;',
    '_tmpX.drawImage(Se.alphaCanvas,Se.eyebrow.x,Se.eyebrow.y,Se.eyebrow.w,Se.eyebrow.h,',
    'St-Ct*Ee,ca-Ct*Ee,Se.eyebrow.w*Ee,Se.eyebrow.h*Ee);_tmpX.restore()}',
    '_tmpX.save();_tmpX.globalAlpha=Re.name.opacity;_tmpX.drawImage(Se.alphaCanvas,Se.name.x,',
    'Se.name.y,Se.name.w,Se.name.h,St-Ct*Ee,_n-Ct*Ee,Se.name.w*Ee,Se.name.h*Ee);_tmpX.restore();',
    '_tmpX.save();_tmpX.globalAlpha=Re.title.opacity;_tmpX.drawImage(Se.alphaCanvas,Se.title.x,',
    'Se.title.y,Se.title.w,Se.title.h,St-Ct*Ee,qn-Ct*Ee,Se.title.w*Ee,Se.title.h*Ee);_tmpX.restore();',
    'var _shC=document.createElement("canvas");_shC.width=1920;_shC.height=1080;',
    'var _shX=_shC.getContext("2d");_shX.shadowBlur=q;_shX.shadowOffsetX=ie;_shX.shadowOffsetY=te;',
    '_shX.shadowColor=U;_shX.drawImage(_tmpC,0,0);_shX.globalCompositeOperation="destination-out";',
    '_shX.drawImage(_tmpC,0,0);_shX.globalCompositeOperation="source-over";',
    'H.save();H.globalAlpha=Math.min(oe/100,1);H.drawImage(_shC,0,0);',
    'if(oe>100){H.globalAlpha=(oe-100)/100;H.drawImage(_shC,0,0)}H.globalAlpha=1;H.restore();',
    'Se.eyebrowContentW>0&&(H.save(),H.globalAlpha=Re.eyebrow.opacity,H.drawImage(Se.colorCanvas,',
    'Se.eyebrow.x,Se.eyebrow.y,Se.eyebrow.w,Se.eyebrow.h,St-Ct*Ee,ca-Ct*Ee,Se.eyebrow.w*Ee,',
    'Se.eyebrow.h*Ee),H.restore());(H.save(),H.globalAlpha=Re.name.opacity,H.drawImage(Se.colorCanvas,',
    'Se.name.x,Se.name.y,Se.name.w,Se.name.h,St-Ct*Ee,_n-Ct*Ee,Se.name.w*Ee,Se.name.h*Ee),',
    'H.restore());(H.save(),H.globalAlpha=Re.title.opacity,H.drawImage(Se.colorCanvas,Se.title.x,',
    'Se.title.y,Se.title.w,Se.title.h,St-Ct*Ee,qn-Ct*Ee,Se.title.w*Ee,Se.title.h*Ee),H.restore())',
    '}H.globalAlpha=1,G.globalAlpha=1}'
  ].join('');

  const newMetaBlock = [
    'if(An&&Oe){const Se=Oe,Ee=na/Se.maxScale,St=L+Ga,ia=he,ha=re,Ct=Se.drawPad,Dt=Se.regionPad,',
    'oa=Se.nameContentW*Ee,ja=Se.nameContentH*Ee,Xn=Se.titleContentW*Ee,Ba=Se.titleContentH*Ee,',
    'yn=Se.eyebrowContentW*Ee,Qt=Se.eyebrowContentH*Ee,_n=qa,qn=_n+ja+ha,ca=_n-Qt-ia;',
    'var _ds=function(_c,_cv,_r,_dx,_dy,_a){_c.save();_c.globalAlpha=_a;_c.translate(_dx,_dy);',
    '_c.scale(Ee,Ee);_c.drawImage(_cv,_r.x,_r.y,_r.w,_r.h,0,0,_r.w,_r.h);_c.restore()};',
    'Se.eyebrowContentW>0&&(_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity),',
    '_ds(G,Se.alphaCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity));',
    '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(G,Se.alphaCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
    '_ds(G,Se.alphaCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
    'if(z){var _tmpC=document.createElement("canvas");_tmpC.width=1920;_tmpC.height=1080;',
    'var _tmpX=_tmpC.getContext("2d");',
    'Se.eyebrowContentW>0&&_ds(_tmpX,Se.alphaCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(_tmpX,Se.alphaCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(_tmpX,Se.alphaCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
    'var _shC=document.createElement("canvas");_shC.width=1920;_shC.height=1080;',
    'var _shX=_shC.getContext("2d");_shX.shadowBlur=q;_shX.shadowOffsetX=ie;_shX.shadowOffsetY=te;',
    '_shX.shadowColor=U;_shX.drawImage(_tmpC,0,0);_shX.globalCompositeOperation="destination-out";',
    '_shX.drawImage(_tmpC,0,0);',
    'H.save();H.globalAlpha=Math.min(oe/100,1);H.drawImage(_shC,0,0);',
    'if(oe>100){H.globalAlpha=(oe-100)/100;H.drawImage(_shC,0,0)}H.restore();',
    'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity)',
    '}H.globalAlpha=1,G.globalAlpha=1}'
  ].join('');

  if (code.includes(oldMetaBlock)) {
    code = code.replace(oldMetaBlock, newMetaBlock);
    console.log('  [OK] FIX 2b: Meta rendering block replaced with drawScaled pattern');
    changed = true;
  } else {
    console.log('  [WARN] FIX 2b: Meta rendering block not found — may already be patched or structure changed');
    // Try to detect if already patched
    if (code.includes('var _ds=function(_c,_cv,_r,_dx,_dy,_a)')) {
      console.log('  [INFO] drawScaled (_ds) function already present');
    }
  }

  if (changed) {
    fs.writeFileSync(file, code);
    console.log('  Written successfully');
  } else {
    console.log('  No changes made');
  }
}

// ======================================================================
// Syntax validation with acorn
// ======================================================================
console.log('\n=== Validating syntax ===');
try {
  const acorn = require('acorn');
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    try {
      acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
      console.log(`  [OK] ${file}: syntax valid`);
    } catch (e) {
      console.log(`  [ERROR] ${file}: syntax error at position ${e.pos}: ${e.message}`);
    }
  }
} catch (e) {
  console.log('  [SKIP] acorn not available — install with: npm install acorn');
}
