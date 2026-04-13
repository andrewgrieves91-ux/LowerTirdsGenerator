const fs = require('fs');

const files = [
  'dist/public/assets/index-iitzneuS.js',
  'dist/public/assets/index-DJse72FL.js'
];

// Helper: build the CSS drop-shadow filter string builder (minified)
// Uses shadow params: q=blur, ie=offsetX, te=offsetY, U=shadowColor(hex), oe=strength
const filterBuilder = 'function(){var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}()';

for (const file of files) {
  console.log(`\n=== Patching ${file} ===`);
  let code = fs.readFileSync(file, 'utf8');
  let changed = false;

  // ======================================================================
  // FIX 1: Meta shadow — replace destination-out with CSS drop-shadow filter
  // ======================================================================
  // The meta block already has _ds (drawScaled) and draws text.
  // Current: destination-out technique (creates halo outline)
  // New: CSS drop-shadow filter (creates filled shadow behind text)
  //   1. Shadow pass: set H.filter=drop-shadow, draw text with _ds
  //   2. Clean pass: clear filter, redraw text with _ds (existing code)

  const oldMetaShadow = [
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

  // New meta shadow: filter-based approach matching Live page
  const newMetaShadow = [
    'if(z){',
    'var _shFM=', filterBuilder, ';',
    'H.filter=_shFM;',
    'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
    'H.filter="none";',
    'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity)',
    '}H.globalAlpha=1,G.globalAlpha=1}'
  ].join('');

  if (code.includes(oldMetaShadow)) {
    code = code.replace(oldMetaShadow, newMetaShadow);
    console.log('  [OK] Meta shadow: replaced destination-out with CSS drop-shadow filter');
    changed = true;
  } else {
    console.log('  [WARN] Meta shadow block not found');
  }

  // ======================================================================
  // FIX 2: Non-meta shadow — replace destination-out with CSS drop-shadow filter
  // ======================================================================
  // Current: destination-out using window._stA/_stB (halo outline only)
  // New: CSS drop-shadow filter (filled shadow behind text)
  //   1. Shadow pass: set H.filter=_shFNM, draw text
  //   2. Clean pass: clear filter, draw text again
  // _shFNM is already defined in the non-meta block but unused — now we use it.

  const oldNonMetaShadow = [
    'if(z){if(!window._stA){window._stA=document.createElement("canvas");window._stA.width=1920;window._stA.height=1080}',
    'if(!window._stB){window._stB=document.createElement("canvas");window._stB.width=1920;window._stB.height=1080}',
    'var _gX=window._stA.getContext("2d"),_sX=window._stB.getContext("2d");',
    '_gX.clearRect(0,0,1920,1080);_sX.clearRect(0,0,1920,1080);',
    '_gX.textBaseline="top";_gX.fillStyle="#ffffff";',
    'if(n){_gX.font=jn;_gX.globalAlpha=Re.eyebrow.opacity;_gX.fillText(n,Ee,St)}',
    'if(_lI){_gX.globalAlpha=Re.eyebrow.opacity;_gX.drawImage(_lI,_lDX,_lTY,_lW,_lH)}',
    '_gX.font=Gn;_gX.globalAlpha=Re.name.opacity;_gX.fillText(l,ia,ha);',
    '_gX.font=Xa;_gX.globalAlpha=Re.title.opacity;_gX.fillText(c,Ct,Dt);',
    '_gX.globalAlpha=1;',
    '_sX.shadowBlur=q;_sX.shadowOffsetX=ie;_sX.shadowOffsetY=te;_sX.shadowColor=U;',
    '_sX.drawImage(window._stA,0,0);',
    '_sX.globalCompositeOperation="destination-out";_sX.drawImage(window._stA,0,0);',
    '_sX.globalCompositeOperation="source-over";',
    'H.save();H.globalCompositeOperation="source-over";',
    'H.globalAlpha=Math.min(oe/100,1);H.drawImage(window._stB,0,0);',
    'if(oe>100){H.globalAlpha=(oe-100)/100;H.drawImage(window._stB,0,0)}',
    'H.globalAlpha=1;H.restore()}'
  ].join('');

  // New non-meta shadow: CSS filter approach
  // Draw text with filter (shadow+text), then draw text without filter (clean text on top)
  const newNonMetaShadow = [
    'if(z){',
    'H.save();H.textBaseline="top";H.filter=_shFNM;H.lineJoin="round";H.lineCap="round";',
    'if(n){H.font=jn;H.globalAlpha=Re.eyebrow.opacity;H.fillStyle=Bn;H.fillText(n,Ee,St)}',
    'if(_lI){H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH)}',
    'H.font=Gn;H.globalAlpha=Re.name.opacity;H.fillStyle=Bn;H.fillText(l,ia,ha);',
    'H.font=Xa;H.globalAlpha=Re.title.opacity;H.fillStyle=Bn;H.fillText(c,Ct,Dt);',
    'H.filter="none";',
    'if(n){H.font=jn;H.globalAlpha=Re.eyebrow.opacity;H.fillText(n,Ee,St)}',
    'if(_lI){H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH)}',
    'H.font=Gn;H.globalAlpha=Re.name.opacity;H.fillText(l,ia,ha);',
    'H.font=Xa;H.globalAlpha=Re.title.opacity;H.fillText(c,Ct,Dt);',
    'H.globalAlpha=1;H.restore()}'
  ].join('');

  if (code.includes(oldNonMetaShadow)) {
    code = code.replace(oldNonMetaShadow, newNonMetaShadow);
    console.log('  [OK] Non-meta shadow: replaced destination-out with CSS drop-shadow filter');
    changed = true;
  } else {
    console.log('  [WARN] Non-meta shadow block not found');
  }

  if (changed) {
    fs.writeFileSync(file, code);
    console.log('  Written successfully');
  } else {
    console.log('  No changes made');
  }
}

// Syntax validation
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
  console.log('  [SKIP] acorn not available');
}
