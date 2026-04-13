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
  // FIX 1: Make na and Ga work for both meta and non-meta
  // ======================================================================
  const oldNaGa = 'na=An?Re.name.scale:1,Ga=An?Re.name.x:0';
  const newNaGa = 'na=Re.name.scale??1,Ga=Re.name.x??0';

  if (code.includes(oldNaGa)) {
    code = code.replace(oldNaGa, newNaGa);
    console.log('  [OK] na/Ga: removed meta-only gate');
    changed = true;
  } else {
    console.log('  [WARN] na/Ga pattern not found');
  }

  // ======================================================================
  // FIX 2: Replace entire if(An&&Oe){...}else{...} with unified offscreen
  // ======================================================================

  // Find the old meta block
  const oldMetaStart = 'if(An&&Oe){';
  const metaIdx = code.indexOf(oldMetaStart);
  if (metaIdx < 0) {
    console.log('  [ERROR] if(An&&Oe) not found');
    continue;
  }

  // Find the end of the else block by brace matching from metaIdx
  let depth = 0;
  let ifEnd = -1;
  for (let i = metaIdx; i < metaIdx + 10000; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') {
      depth--;
      if (depth === 0) {
        ifEnd = i + 1; // end of if block
        break;
      }
    }
  }

  // Now find the else block
  const afterIf = code.substring(ifEnd);
  if (!afterIf.startsWith('else{')) {
    console.log('  [ERROR] else block not found after if block');
    continue;
  }

  // Find end of else block
  depth = 0;
  let elseEnd = -1;
  for (let i = ifEnd; i < ifEnd + 10000; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') {
      depth--;
      if (depth === 0) {
        elseEnd = i + 1;
        break;
      }
    }
  }

  const oldBlock = code.substring(metaIdx, elseEnd);
  console.log('  Old block length:', oldBlock.length);

  // Build the new unified offscreen block
  // Variable reference:
  //   H = colorCtx, G = alphaCtx, Se/Oe = offscreen ref
  //   An = isMetaAnim, na = groupScale, Ga = groupX
  //   qa = nameY, Aa = titleY, ds = eyebrowY, L = posX
  //   Re = animation values, z = shadowEnabled
  //   q = shadowBlur, ie = shadowOffsetX, te = shadowOffsetY
  //   U = shadowColor, oe = shadowStrength
  //   D = underline, $ = textColor, Fn = nameFontSize, Bn = titleFontSize
  //   Gn = nameFontString, Xa = titleFontString, jn = eyebrowFontString
  //   Ae = logoImageRef, dt = logoPosition
  //   we = borderEnabled, He = borderColor, Ce = borderWidth
  //   fa = eyebrowFontSize, he = eyebrowGap, re = titleGap

  const newBlock = [
    'if(Oe){',
    // Local bindings from offscreen ref
    'const Se=Oe,Ee=na/Se.maxScale,St=L+Ga,',
    'ia=he,ha=re,Ct=Se.drawPad,Dt=Se.regionPad,',
    'oa=Se.nameContentW*Ee,ja=Se.nameContentH*Ee,',
    'Xn=Se.titleContentW*Ee,Ba=Se.titleContentH*Ee,',
    'yn=Se.eyebrowContentW*Ee,Qt=Se.eyebrowContentH*Ee;',

    // Y positions: meta uses gap-based layout, non-meta uses animated positions
    'var _n=An?qa:qa+(Re.name.y||0),',
    'qn=An?(qa+ja+ha):Aa+(Re.title.y||0),',
    'ca=An?(qa-Qt-ia):ds+(Re.eyebrow.y||0);',

    // Per-line X positions: meta uses shared X, non-meta uses per-line animation
    'var _eX=An?St:L+(Re.eyebrow.x||0),',
    '_nX=An?St:L+(Re.name.x||0),',
    '_tX=An?St:L+(Re.title.x||0);',

    // Logo position adjustment (non-meta only)
    'var _lI=null,_lDX=0,_lTY=0,_lW=0,_lH=0;',
    'if(!An&&Ae.current){',
    '_lI=Ae.current;',
    '_lH=Math.round(Se.eyebrowContentH*Ee);',
    '_lW=Math.round(_lI.naturalWidth/_lI.naturalHeight*_lH);',
    'var _lP=Math.round(_lH*.3);',
    '_lTY=ca;',
    'if(dt==="before"){_lDX=_eX;_eX=_eX+_lW+_lP}',
    'else{_lDX=_eX+yn+_lP}',
    '}',

    // drawScaled helper
    'var _ds=function(_c,_cv,_r,_dx,_dy,_a){',
    '_c.save();_c.globalAlpha=_a;_c.translate(_dx,_dy);_c.scale(Ee,Ee);',
    '_c.drawImage(_cv,_r.x,_r.y,_r.w,_r.h,0,0,_r.w,_r.h);_c.restore()};',

    // Alpha canvas draws (always)
    'Se.eyebrowContentW>0&&_ds(G,Se.alphaCanvas,Se.eyebrow,_eX-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(G,Se.alphaCanvas,Se.name,_nX-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(G,Se.alphaCanvas,Se.title,_tX-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',

    // Shadow pass (CSS drop-shadow filter, if enabled)
    'if(z){',
    'var _shFM=function(){',
    'var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,',
    '_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);',
    'return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();',
    'H.filter=_shFM;',
    'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,_eX-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(H,Se.colorCanvas,Se.name,_nX-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(H,Se.colorCanvas,Se.title,_tX-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
    'if(_lI){H.save();H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH);H.restore()}',
    'H.filter="none"}',

    // Clean text pass on color canvas (always)
    'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,_eX-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
    '_ds(H,Se.colorCanvas,Se.name,_nX-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
    '_ds(H,Se.colorCanvas,Se.title,_tX-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',

    // Logo rendering on both canvases (non-meta only)
    'if(_lI){',
    'H.save();H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH);H.restore();',
    'G.save();G.globalCompositeOperation="source-over";G.drawImage(_lI,_lDX,_lTY,_lW,_lH);',
    'G.globalCompositeOperation="source-atop";G.fillStyle="#FFFFFF";G.fillRect(_lDX,_lTY,_lW,_lH);G.restore()}',

    // Underline rendering (non-meta only)
    'if(!An&&D){',
    'H.save();H.font=Gn;var _unw=H.measureText(l).width;',
    'H.font=Xa;var _utw=H.measureText(c).width;',
    'H.strokeStyle=$;H.lineWidth=Math.max(2,Fn/24);',
    'H.globalAlpha=Re.name.opacity;H.beginPath();',
    'var _uny=_n+Fn+2,_uty=qn+Bn+2;',
    'H.moveTo(_nX,_uny);H.lineTo(_nX+_unw,_uny);',
    'H.moveTo(_tX,_uty);H.lineTo(_tX+_utw,_uty);H.stroke();',
    'G.strokeStyle="#FFFFFF";G.lineWidth=Math.max(2,Fn/24);',
    'G.globalAlpha=Re.name.opacity;G.beginPath();',
    'G.moveTo(_nX,_uny);G.lineTo(_nX+_unw,_uny);',
    'G.moveTo(_tX,_uty);G.lineTo(_tX+_utw,_uty);G.stroke();',
    'H.restore()}',

    'H.globalAlpha=1,G.globalAlpha=1}',
  ].join('');

  code = code.substring(0, metaIdx) + newBlock + code.substring(elseEnd);
  console.log('  [OK] Replaced if/else with unified offscreen block');
  console.log('  New block length:', newBlock.length);
  changed = true;

  if (changed) {
    fs.writeFileSync(file, code);
    console.log('  Written successfully');
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
      // Show context around error
      console.log('  Context:', code.substring(e.pos - 50, e.pos + 50));
    }
  }
} catch (e) {
  console.log('  [SKIP] acorn not available');
}
