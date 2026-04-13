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
  // FIX 1: EDIT PAGE — Revert to meta-only offscreen, keep CSS filter shadow
  // Restore the if(An&&Oe) gate and the else block with fillText,
  // but use CSS drop-shadow filter for shadow (not destination-out)
  // ======================================================================

  // Revert na/Ga to be meta-only
  const oldNaGa = 'na=Re.name.scale??1,Ga=Re.name.x??0';
  const newNaGa = 'na=An?Re.name.scale:1,Ga=An?Re.name.x:0';
  if (code.includes(oldNaGa)) {
    code = code.replace(oldNaGa, newNaGa);
    console.log('  [OK] na/Ga: restored meta-only');
    changed = true;
  } else {
    console.log('  [SKIP] na/Ga already meta-only');
  }

  // Find the current unified offscreen block and replace it with
  // if(An&&Oe){meta}else{non-meta with CSS filter shadow}
  const unifiedStart = code.indexOf('if(Oe){');
  if (unifiedStart > 500000 && unifiedStart < 570000) {
    // Find the end of the unified block by brace matching
    let depth = 0;
    let unifiedEnd = -1;
    for (let i = unifiedStart; i < unifiedStart + 5000; i++) {
      if (code[i] === '{') depth++;
      if (code[i] === '}') {
        depth--;
        if (depth === 0) {
          unifiedEnd = i + 1;
          break;
        }
      }
    }
    console.log('  Unified block:', unifiedStart, 'to', unifiedEnd, '(' + (unifiedEnd - unifiedStart) + ' chars)');

    // Build the replacement: if(An&&Oe){meta with drawScaled + CSS filter}else{fillText + CSS filter shadow}
    const newEditBlock = [
      // META PATH (offscreen + drawScaled + CSS filter shadow)
      'if(An&&Oe){',
      'const Se=Oe,Ee=na/Se.maxScale,St=L+Ga,',
      'ia=he,ha=re,Ct=Se.drawPad,Dt=Se.regionPad,',
      'oa=Se.nameContentW*Ee,ja=Se.nameContentH*Ee,',
      'Xn=Se.titleContentW*Ee,Ba=Se.titleContentH*Ee,',
      'yn=Se.eyebrowContentW*Ee,Qt=Se.eyebrowContentH*Ee,',
      '_n=qa,qn=_n+ja+ha,ca=_n-Qt-ia;',
      'var _ds=function(_c,_cv,_r,_dx,_dy,_a){',
      '_c.save();_c.globalAlpha=_a;_c.translate(_dx,_dy);_c.scale(Ee,Ee);',
      '_c.drawImage(_cv,_r.x,_r.y,_r.w,_r.h,0,0,_r.w,_r.h);_c.restore()};',
      // Alpha canvas
      'Se.eyebrowContentW>0&&(_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity),',
      '_ds(G,Se.alphaCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity));',
      '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
      '_ds(G,Se.alphaCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
      '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
      '_ds(G,Se.alphaCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
      // Shadow (CSS filter)
      'if(z){var _shFM=function(){var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,',
      '_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);',
      'return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();',
      'H.filter=_shFM;',
      'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
      '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
      '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity);',
      'H.filter="none";',
      'Se.eyebrowContentW>0&&_ds(H,Se.colorCanvas,Se.eyebrow,St-Ct*Ee,ca-Ct*Ee,Re.eyebrow.opacity);',
      '_ds(H,Se.colorCanvas,Se.name,St-Ct*Ee,_n-Ct*Ee,Re.name.opacity);',
      '_ds(H,Se.colorCanvas,Se.title,St-Ct*Ee,qn-Ct*Ee,Re.title.opacity)',
      '}H.globalAlpha=1,G.globalAlpha=1}',
      // NON-META PATH (fillText + CSS filter shadow)
      'else{',
      'var _shFNM=z?function(){var _r=parseInt(U.slice(1,3),16)||0,_g=parseInt(U.slice(3,5),16)||0,',
      '_b=parseInt(U.slice(5,7),16)||0,_a=Math.min(oe/100,1);',
      'return"drop-shadow("+ie+"px "+te+"px "+q+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}():"none";',
      'H.save(),G.save(),H.textBaseline="top",G.textBaseline="top",',
      'H.lineJoin="round",H.lineCap="round",G.lineJoin="round",G.lineCap="round";',
      'const Se=L;let Ee=L,St=ds,ia=L,ha=qa,Ct=L,Dt=Aa,',
      '_lI=null,_lDX=0,_lTY=0,_lW=0,_lH=0;',
      // Eyebrow + logo
      'if(n||Ae.current){H.save(),G.save();',
      'const yn=An?Se:L+Re.eyebrow.x,Qt=ds+(An?0:Re.eyebrow.y);',
      'St=Qt,H.globalAlpha=Re.eyebrow.opacity,G.globalAlpha=Re.eyebrow.opacity,',
      'H.font=jn,G.font=jn;',
      'const _n=Ae.current,qn=fa,ca=_n?Math.round(_n.naturalWidth/_n.naturalHeight*qn):0,',
      'Pa=_n?Math.round(fa*.3):0,_i=n?H.measureText(n).width:0;',
      'let Ua=yn,Ha=yn;',
      '_n&&(dt==="before"?(Ha=yn,Ua=yn+ca+Pa):(Ua=yn,Ha=yn+_i+Pa)),Ee=Ua;',
      'const fs=Qt;_lI=_n,_lDX=Ha,_lTY=fs,_lW=ca,_lH=qn;',
      '_n&&(H.drawImage(_n,Ha,fs,ca,qn),G.save(),G.globalCompositeOperation="source-over",',
      'G.drawImage(_n,Ha,fs,ca,qn),G.globalCompositeOperation="source-atop",',
      'G.fillStyle="#FFFFFF",G.fillRect(Ha,fs,ca,qn),G.restore()),',
      'n&&(we&&(H.strokeStyle=He,H.lineWidth=Ce,H.strokeText(n,Ua,Qt),',
      'G.strokeStyle="#FFFFFF",G.lineWidth=Ce,G.strokeText(n,Ua,Qt)),',
      'H.fillStyle=$,H.fillText(n,Ua,Qt),G.fillStyle="#FFFFFF",G.fillText(n,Ua,Qt)),',
      'H.restore(),G.restore()}',
      // Name
      'H.save(),G.save();const oa=An?Se:L+Re.name.x,ja=qa+(An?0:Re.name.y);',
      'if(ia=oa,ha=ja,H.globalAlpha=Re.name.opacity,G.globalAlpha=Re.name.opacity,',
      'H.font=Gn,G.font=Gn,',
      'we&&(H.strokeStyle=He,H.lineWidth=Ce,H.strokeText(l,oa,ja),',
      'G.strokeStyle="#FFFFFF",G.lineWidth=Ce,G.strokeText(l,oa,ja)),',
      'H.fillStyle=$,H.fillText(l,oa,ja),G.fillStyle="#FFFFFF",G.fillText(l,oa,ja),D){',
      'const yn=H.measureText(l).width;H.strokeStyle=$,H.lineWidth=Math.max(2,Fn/24);',
      'const Qt=ja+Fn+2;H.beginPath(),H.moveTo(oa,Qt),H.lineTo(oa+yn,Qt),H.stroke(),',
      'G.strokeStyle="#FFFFFF",G.lineWidth=Math.max(2,Fn/24),',
      'G.beginPath(),G.moveTo(oa,Qt),G.lineTo(oa+yn,Qt),G.stroke()}',
      'H.restore(),G.restore(),',
      // Title
      'H.save(),G.save();const Xn=An?Se:L+Re.title.x,Ba=Aa+(An?0:Re.title.y);',
      'if(Ct=Xn,Dt=Ba,H.globalAlpha=Re.title.opacity,G.globalAlpha=Re.title.opacity,',
      'H.font=Xa,G.font=Xa,',
      'we&&(H.strokeStyle=He,H.lineWidth=Ce,H.strokeText(c,Xn,Ba),',
      'G.strokeStyle="#FFFFFF",G.lineWidth=Ce,G.strokeText(c,Xn,Ba)),',
      'H.fillStyle=$,H.fillText(c,Xn,Ba),G.fillStyle="#FFFFFF",G.fillText(c,Xn,Ba),D){',
      'const yn=H.measureText(c).width,Qt=Ba+Bn+2;',
      'H.strokeStyle=$,H.lineWidth=Math.max(2,Bn/24),H.beginPath(),',
      'H.moveTo(Xn,Qt),H.lineTo(Xn+yn,Qt),H.stroke(),',
      'G.strokeStyle="#FFFFFF",G.lineWidth=Math.max(2,Bn/24),',
      'G.beginPath(),G.moveTo(Xn,Qt),G.lineTo(Xn+yn,Qt),G.stroke()}',
      'H.restore(),G.restore();',
      // CSS filter shadow pass (non-meta)
      'if(z){H.save();H.textBaseline="top";H.filter=_shFNM;H.lineJoin="round";H.lineCap="round";H.fillStyle=$;',
      'if(n){H.font=jn;H.globalAlpha=Re.eyebrow.opacity;H.fillText(n,Ee,St)}',
      'if(_lI){H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH)}',
      'H.font=Gn;H.globalAlpha=Re.name.opacity;H.fillText(l,ia,ha);',
      'H.font=Xa;H.globalAlpha=Re.title.opacity;H.fillText(c,Ct,Dt);',
      'H.filter="none";',
      'if(n){H.font=jn;H.globalAlpha=Re.eyebrow.opacity;H.fillText(n,Ee,St)}',
      'if(_lI){H.globalAlpha=Re.eyebrow.opacity;H.drawImage(_lI,_lDX,_lTY,_lW,_lH)}',
      'H.font=Gn;H.globalAlpha=Re.name.opacity;H.fillText(l,ia,ha);',
      'H.font=Xa;H.globalAlpha=Re.title.opacity;H.fillText(c,Ct,Dt);',
      'H.globalAlpha=1;H.restore()}',
      'H.restore(),G.restore()}'
    ].join('');

    code = code.substring(0, unifiedStart) + newEditBlock + code.substring(unifiedEnd);
    console.log('  [OK] Edit: restored meta-only offscreen + fillText else with CSS filter shadow');
    changed = true;
  } else {
    console.log('  [WARN] Edit unified block not found');
  }

  // ======================================================================
  // FIX 2: EXPORT — Fix non-meta shadow to use native canvas shadow
  //        (simpler, no text duplication, just set shadow props before drawing)
  // ======================================================================
  // The CSS filter approach needs to redraw text, which causes position mismatches.
  // Use native canvas shadow instead: set shadow properties before text is drawn,
  // then clear after. This avoids any duplicate rendering.

  const oldExportNmShadow = [
    'if(p.shadowEnabled){',
    'var _shFNME=function(){',
    'var _hx=p.shadowColor||"#000000",',
    '_r=parseInt(_hx.slice(1,3),16)||0,_g=parseInt(_hx.slice(3,5),16)||0,',
    '_b=parseInt(_hx.slice(5,7),16)||0,',
    '_bl=(p.shadowBlur??10)*b,_ox=(p.shadowOffsetX??3)*b,_oy=(p.shadowOffsetY??3)*b,',
    '_a=Math.min((p.shadowStrength??100)/100,1);',
    'return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();',
    'n.save();n.filter=_shFNME;n.textBaseline="top";n.fillStyle=p.color;',
    'if(R){n.font=$;n.globalAlpha=D.opacity;n.fillText(R,xe?te+D.x*b:Math.round(te+D.x*b),q)}',
    'n.font=I;n.globalAlpha=B.opacity;n.fillText(p.name,xe?te+B.x*b:Math.round(te+B.x*b),ee);',
    'n.font=ve;n.globalAlpha=k.opacity;n.fillText(p.title,xe?te+k.x*b:Math.round(te+k.x*b),ie);',
    'n.filter="none";',
    'if(R){n.font=$;n.globalAlpha=D.opacity;n.fillText(R,xe?te+D.x*b:Math.round(te+D.x*b),q)}',
    'n.font=I;n.globalAlpha=B.opacity;n.fillText(p.name,xe?te+B.x*b:Math.round(te+B.x*b),ee);',
    'n.font=ve;n.globalAlpha=k.opacity;n.fillText(p.title,xe?te+k.x*b:Math.round(te+k.x*b),ie);',
    'n.globalAlpha=1;n.restore()}'
  ].join('');

  // Replace with nothing — we'll inject shadow props BEFORE text is drawn instead.
  // The shadow will be applied via native canvas shadow on the context.
  if (code.includes(oldExportNmShadow)) {
    code = code.replace(oldExportNmShadow, '');
    console.log('  [OK] Export: removed non-meta CSS filter shadow block');
    changed = true;
  } else {
    console.log('  [WARN] Export non-meta CSS filter shadow not found');
  }

  // Now inject native canvas shadow setup BEFORE the non-meta text rendering.
  // Find the non-meta text rendering start (after letterOpacities check)
  // The pattern: '}else{const U=M?te:Math.round(te+D.x*b)' starts the regular non-meta text
  const nmTextStart = '}else{const U=M?te:Math.round(te+D.x*b)';
  if (code.includes(nmTextStart)) {
    const shadowSetup = '}else{if(p.shadowEnabled){n.shadowBlur=(p.shadowBlur??10)*b;n.shadowOffsetX=(p.shadowOffsetX??3)*b;n.shadowOffsetY=(p.shadowOffsetY??3)*b;var _hx=p.shadowColor||"#000000";var _st=p.shadowStrength??100;var _r2=parseInt(_hx.slice(1,3),16)||0,_g2=parseInt(_hx.slice(3,5),16)||0,_b2=parseInt(_hx.slice(5,7),16)||0;n.shadowColor="rgba("+_r2+","+_g2+","+_b2+","+Math.min(_st/100,1)+")"}const U=M?te:Math.round(te+D.x*b)';
    code = code.replace(nmTextStart, shadowSetup);
    console.log('  [OK] Export: added native shadow setup before non-meta text');
    changed = true;
  } else {
    console.log('  [WARN] Export non-meta text start not found');
  }

  // Add shadow cleanup after the non-meta text drawing, before underline
  // Find: 'n.filter="none";if(p.underline)' in the export non-meta section
  const nmUnderlStart = 'n.filter="none";if(p.underline)';
  const tcIdx = code.indexOf('function Tc(');
  const nmUnderlIdx = code.indexOf(nmUnderlStart, tcIdx);
  if (nmUnderlIdx >= 0) {
    code = code.substring(0, nmUnderlIdx) + 'n.shadowBlur=0;n.shadowOffsetX=0;n.shadowOffsetY=0;n.filter="none";if(p.underline)' + code.substring(nmUnderlIdx + nmUnderlStart.length);
    console.log('  [OK] Export: added shadow cleanup before underline');
    changed = true;
  } else {
    console.log('  [WARN] Export underline start not found');
  }

  // ======================================================================
  // FIX 3: EXPORT META — Fix Y position computation
  // The meta Y positions should use region heights (U.name.h) for 9-arg drawImage
  // compatibility, since content heights don't include padding
  // But since we're using drawScaled now, content heights + padding compensation is correct.
  // The issue is: the old code used U.name.h*Q for gap computation, so let's keep
  // the meta Y positions using the same values as the Live page.
  // Actually the drawScaled approach with content heights IS correct.
  // No change needed here.
  // ======================================================================

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
      console.log('  Context:', code.substring(Math.max(0, e.pos - 50), e.pos + 50));
    }
  }
} catch (e) {
  console.log('  [SKIP] acorn not available');
}
