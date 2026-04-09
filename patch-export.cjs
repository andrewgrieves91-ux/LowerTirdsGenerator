const fs = require('fs');

['index-iitzneuS.js', 'index-DJse72FL.js'].forEach(file => {
  let code = fs.readFileSync('dist/public/assets/' + file, 'utf8');
  
  // 1. Change all Export createMetaOffscreenForExport calls
  //    Already done in previous patch (createOffscreenForExport for all non-syncTest)
  //    But verify the function name change
  const oldFnName = 'function _c(';
  // Actually the Export offscreen function has a different minified name
  // Let me find it by looking for 'maxScale:1.121}}' near the Export area  
  
  // 2. Change the Export if condition from M&&m to just m
  const oldCond = ',M&&m){const U=m,';
  const newCond = ',m){const U=m,';
  if (code.includes(oldCond)) {
    code = code.replace(oldCond, newCond);
    console.log(file + ': Export if-condition changed (M&&m → m)');
  } else {
    console.log(file + ': WARN - Export if-condition not found');
  }
  
  // 3. Replace the Meta-only rendering inside the if block with unified rendering
  // Find the old block: starts after 'const U=m,' and ends with 'return}'
  // The old code calculates Meta-specific positions. I need to add a branch for non-Meta.
  
  // Old: const U=m,Q=ue/U.maxScale,oe=E+he,le=U.name.w*Q,...,return}
  // New: add Meta vs non-Meta branching for positions
  
  const oldMetaCalc = 'const U=m,Q=ue/U.maxScale,oe=E+he,le=U.name.w*Q,we=U.name.h*Q,De=U.title.w*Q,Ce=U.title.h*Q,Ie=U.eyebrow.w*Q,He=U.eyebrow.h*Q,Qe=_,$e=Qe+we+T,zt=Qe-He-w';
  const newMetaCalc = 'const U=m,Q=ue/U.maxScale,le=U.name.w*Q,we=U.name.h*Q,De=U.title.w*Q,Ce=U.title.h*Q,Ie=U.eyebrow.w*Q,He=U.eyebrow.h*Q;var oe,Qe,$e,zt;if(M){oe=E+he;Qe=_;$e=Qe+we+T;zt=Qe-He-w}else{oe=E+B.x*b;Qe=ee+B.y*b;$e=ie+k.y*b;zt=q+D.y*b}';
  
  if (code.includes(oldMetaCalc)) {
    code = code.replace(oldMetaCalc, newMetaCalc);
    console.log(file + ': Export Meta calc replaced with unified calc');
  } else {
    console.log(file + ': WARN - Export Meta calc not found');
  }
  
  // 4. Fix the shadow pass in the Export Meta block
  // The current shadow uses text opacity in the glyph mask. Change to full opacity
  // and multiply shadow composite by shared opacity.
  // Current pattern in the shadow callback:
  //   Ae.globalAlpha=D.opacity,...Ae.globalAlpha=B.opacity,...Ae.globalAlpha=k.opacity
  // Should be:
  //   Ae.globalAlpha=1.0 (draw at full opacity for clean erasure)
  //   And multiply shadow strength by max opacity
  
  // Find and replace the applyShadow call in the Meta block
  // The shadow call is: applyShadow(n,W,H,shadowBlur*b,...)
  // With the glyph drawing function that uses Ae
  
  // Instead of a complex replacement, let me find the shadow callback and fix the opacity
  // Look for the pattern inside the if(p.shadowEnabled) block within the Meta rendering
  
  // The Export Meta shadow callback draws with: Ae.globalAlpha=D.opacity, etc.
  // I need to change these to 1.0 and multiply the shadow strength by max opacity
  
  // Find the applyShadow call in the if(m) block
  const shadowStart = code.indexOf('if(p.shadowEnabled){', code.indexOf(',m){const U=m,'));
  if (shadowStart > 0 && shadowStart < shadowStart + 5000) {
    // Find the applyShadow call
    const applyStart = code.indexOf('applyShadow(', shadowStart);
    if (applyStart > 0 && applyStart < shadowStart + 500) {
      // The current shadow strength parameter is: p.shadowStrength??100
      // I need to multiply it by max opacity: (p.shadowStrength??100)*Math.max(D.opacity,B.opacity,k.opacity)
      const oldStrength = 'p.shadowStrength??100,c,';
      const newStrength = '(p.shadowStrength??100)*Math.max(D.opacity,B.opacity,k.opacity),c,';
      
      // Only replace within the Meta block area
      const blockArea = code.substring(applyStart, applyStart + 500);
      if (blockArea.includes(oldStrength)) {
        code = code.substring(0, applyStart) + blockArea.replace(oldStrength, newStrength) + code.substring(applyStart + 500);
        console.log(file + ': Export shadow strength multiplied by opacity');
      }
      
      // Fix glyph opacity in the shadow callback: change D.opacity/B.opacity/k.opacity to 1
      // Find the callback body (Ae.globalAlpha=D.opacity, etc.)
      const callbackStart = code.indexOf('(Ae)=>{', applyStart);
      if (callbackStart > 0 && callbackStart < applyStart + 400) {
        const callbackEnd = code.indexOf('})', callbackStart + 10);
        if (callbackEnd > 0) {
          let callback = code.substring(callbackStart, callbackEnd + 2);
          // Replace opacity assignments in the shadow glyph drawing
          callback = callback.replace(/Ae\.globalAlpha=D\.opacity/g, 'Ae.globalAlpha=1');
          callback = callback.replace(/Ae\.globalAlpha=B\.opacity/g, 'Ae.globalAlpha=1');
          callback = callback.replace(/Ae\.globalAlpha=k\.opacity/g, 'Ae.globalAlpha=1');
          code = code.substring(0, callbackStart) + callback + code.substring(callbackEnd + 2);
          console.log(file + ': Export shadow callback opacities fixed to 1.0');
        }
      }
    }
  }
  
  // 5. Add re-draw text after shadow (currently missing in Export)
  // After applyShadow call, add re-draw of text bitmaps
  // Find the closing of the shadow if block  
  const shadowIfEnd = code.indexOf('});return}', code.indexOf(',m){const U=m,'));
  if (shadowIfEnd > 0) {
    // Insert text re-draw before the return
    const reDraw = 'n.save();U.eyebrow.w>0&&(n.globalAlpha=D.opacity,n.drawImage(U.colorCanvas,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,oe,zt,Ie,He));n.globalAlpha=B.opacity,n.drawImage(U.colorCanvas,U.name.x,U.name.y,U.name.w,U.name.h,oe,Qe,le,we);n.globalAlpha=k.opacity,n.drawImage(U.colorCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce);n.globalAlpha=1;n.restore();';
    // Also add underline support before return
    const underline = 'if(p.underline){n.shadowBlur=0,n.shadowOffsetX=0,n.shadowOffsetY=0,n.font=I;const _nw=n.measureText(p.name).width;n.font=ve;const _tw=n.measureText(p.title).width;n.strokeStyle=p.color,n.lineWidth=Math.max(2*b,re/24),n.globalAlpha=B.opacity,n.beginPath();const _uny=Qe+re+2*b,_uty=$e+F+2*b;n.moveTo(oe,_uny),n.lineTo(oe+_nw,_uny),n.moveTo(oe,_uty),n.lineTo(oe+_tw,_uty),n.stroke()}';
    
    code = code.substring(0, shadowIfEnd + 2) + reDraw + underline + code.substring(shadowIfEnd + 2);
    console.log(file + ': Export text re-draw and underline added after shadow');
  }
  
  fs.writeFileSync('dist/public/assets/' + file, code);
  console.log(file + ': Export rendering patched');
});
