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
  // FIX 1: Live render — replace complex temp-canvas shadow with native
  // ======================================================================
  const oldShadowBlock = 'if(_e.config.shadowEnabled??!1){const jn=_e.config.shadowBlur??10,Gn=_e.config.shadowOffsetX??0,Xa=_e.config.shadowOffsetY??0,Xr=_e.config.shadowColor??"rgba(0,0,0,0.8)",qr=_e.config.shadowStrength??100,aa=V.width,ds=V.height,_so=Math.max(pn.opacity,It.opacity,nn.opacity),qa=document.createElement("canvas");qa.width=aa,qa.height=ds;const Aa=qa.getContext("2d");H.eyebrowContentW>0&&Aa.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G);Aa.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G);Aa.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G);const Se=document.createElement("canvas");Se.width=aa,Se.height=ds;const Ee=Se.getContext("2d");Ee.shadowBlur=jn,Ee.shadowOffsetX=Gn,Ee.shadowOffsetY=Xa,Ee.shadowColor=Xr,Ee.drawImage(qa,0,0),Ee.globalCompositeOperation="destination-out",Ee.drawImage(qa,0,0),W.save(),W.globalAlpha=_so*Math.min(qr/100,1),W.drawImage(Se,0,0),qr>100&&(W.globalAlpha=_so*(qr-100)/100,W.drawImage(Se,0,0)),W.restore()}';

  const newShadowSetup = 'if(_e.config.shadowEnabled??!1){W.shadowBlur=(_e.config.shadowBlur??10),W.shadowOffsetX=(_e.config.shadowOffsetX??0),W.shadowOffsetY=(_e.config.shadowOffsetY??0),W.shadowColor=(_e.config.shadowColor??"rgba(0,0,0,0.8)")}';

  if (code.includes(oldShadowBlock)) {
    code = code.replace(oldShadowBlock, newShadowSetup);
    console.log('  [OK] Live shadow block replaced with native canvas shadow');
    changed = true;
  } else {
    console.log('  [WARN] Live shadow block not found');
  }

  // Add shadow cleanup AFTER the last text draw and BEFORE underline
  const lastTextDraw = 'W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore();';
  const lastTextDrawWithCleanup = lastTextDraw + 'W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0;';

  // Only add cleanup if it's not already there
  if (code.includes(lastTextDraw) && !code.includes(lastTextDrawWithCleanup)) {
    code = code.replace(lastTextDraw, lastTextDrawWithCleanup);
    console.log('  [OK] Shadow cleanup added after text draws');
    changed = true;
  } else if (code.includes(lastTextDrawWithCleanup)) {
    console.log('  [SKIP] Shadow cleanup already present');
  } else {
    console.log('  [WARN] Last text draw pattern not found');
  }

  // ======================================================================
  // FIX 2: Export Tc bitmap path — replace xb shadow with native canvas shadow
  // ======================================================================
  // Find the bitmap path shadow: p.shadowEnabled&&xb(n,a,l,...
  const oldBitmapShadow = 'p.shadowEnabled&&xb(n,a,l,(p.shadowBlur??10)*b,(p.shadowOffsetX??3)*b,(p.shadowOffsetY??3)*b,p.shadowColor??"#000000",(p.shadowStrength??100)*Math.max(D.opacity,B.opacity,k.opacity),c,Ae=>{Ae.textBaseline="top",Ae.imageSmoothingEnabled=!0,Ae.imageSmoothingQuality="high",U.eyebrow.w>0&&(Ae.globalAlpha=1,Ae.drawImage(U.colorCanvas,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,oe,zt,Ie,He)),Ae.globalAlpha=1,Ae.drawImage(U.colorCanvas,U.name.x,U.name.y,U.name.w,U.name.h,oe,Qe,le,we),Ae.globalAlpha=1,Ae.drawImage(U.colorCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce),Ae.globalAlpha=1})';

  const newBitmapShadow = 'p.shadowEnabled&&(n.shadowBlur=(p.shadowBlur??10)*b,n.shadowOffsetX=(p.shadowOffsetX??3)*b,n.shadowOffsetY=(p.shadowOffsetY??3)*b,n.shadowColor=p.shadowColor??"#000000")';

  if (code.includes(oldBitmapShadow)) {
    code = code.replace(oldBitmapShadow, newBitmapShadow);
    console.log('  [OK] Tc bitmap shadow replaced with native canvas shadow');
    changed = true;
  } else {
    console.log('  [WARN] Tc bitmap shadow not found');
  }

  // Add shadow cleanup after bitmap text draws
  const oldBitmapTextEnd = 'n.globalAlpha=k.opacity,n.drawImage(U.colorCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce);n.globalAlpha=1;n.restore()';
  const newBitmapTextEnd = 'n.globalAlpha=k.opacity,n.drawImage(U.colorCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce);n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0;n.globalAlpha=1;n.restore()';

  if (code.includes(oldBitmapTextEnd) && !code.includes(newBitmapTextEnd)) {
    code = code.replace(oldBitmapTextEnd, newBitmapTextEnd);
    console.log('  [OK] Tc bitmap text draw shadow cleanup added');
    changed = true;
  } else if (code.includes(newBitmapTextEnd)) {
    console.log('  [SKIP] Tc bitmap shadow cleanup already present');
  } else {
    console.log('  [WARN] Tc bitmap text end not found');
  }

  // ======================================================================
  // FIX 3: Export Tc fallback path — replace xb shadow with native canvas shadow
  // ======================================================================
  const oldFallbackShadow = 'p.shadowEnabled){const U=a,Q=l,oe=M?te:Math.round(te+D.x*b),le=M?te:Math.round(te+B.x*b),we=M?te:Math.round(te+k.x*b);xb(n,U,Q,(p.shadowBlur??10)*b,(p.shadowOffsetX??3)*b,(p.shadowOffsetY??3)*b,p.shadowColor??"#000000",(p.shadowStrength??100)*Math.max(D.opacity,B.opacity,k.opacity),c,De=>{De.textBaseline="top",De.imageSmoothingEnabled=!0,De.imageSmoothingQuality="high",R&&(De.font=$,De.globalAlpha=1,De.fillText(R,oe,q)),De.font=I,De.globalAlpha=1,De.fillText(p.name,le,ee),De.font=ve,De.globalAlpha=1,De.fillText(p.title,we,ie),De.globalAlpha=1})}';

  const newFallbackShadow = 'p.shadowEnabled){n.shadowBlur=(p.shadowBlur??10)*b,n.shadowOffsetX=(p.shadowOffsetX??3)*b,n.shadowOffsetY=(p.shadowOffsetY??3)*b,n.shadowColor=p.shadowColor??"#000000"}';

  if (code.includes(oldFallbackShadow)) {
    code = code.replace(oldFallbackShadow, newFallbackShadow);
    console.log('  [OK] Tc fallback shadow replaced with native canvas shadow');
    changed = true;
  } else {
    console.log('  [WARN] Tc fallback shadow not found');
  }

  // Add shadow cleanup after fallback text draws
  // The fallback text draws end before the underline check
  const fallbackUnderline = 'if(p.underline){n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0';
  if (code.includes(fallbackUnderline)) {
    console.log('  [SKIP] Fallback underline shadow cleanup already present');
  } else {
    // Find the underline check and add shadow cleanup before it
    const underlineCheck = 'if(p.underline){';
    // Count occurrences to find the right one (inside Tc function)
    const tcStart = code.indexOf('function Tc(');
    const tcEnd = code.indexOf('async function vb(');
    const tcCode = code.substring(tcStart, tcEnd);
    const ulIdx = tcCode.lastIndexOf(underlineCheck);
    if (ulIdx >= 0) {
      const absUlIdx = tcStart + ulIdx;
      // Add shadow cleanup right before the underline check
      code = code.substring(0, absUlIdx) + 'n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0;' + code.substring(absUlIdx);
      console.log('  [OK] Tc fallback shadow cleanup added before underline');
      changed = true;
    } else {
      console.log('  [WARN] Underline check not found in Tc');
    }
  }

  if (changed) {
    fs.writeFileSync(file, code);
    console.log('  File saved.');
  } else {
    console.log('  No changes needed.');
  }
}

console.log('\nDone!');
