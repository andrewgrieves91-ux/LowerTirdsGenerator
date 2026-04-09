const fs = require('fs');

['index-iitzneuS.js', 'index-DJse72FL.js'].forEach(file => {
  let code = fs.readFileSync('dist/public/assets/' + file, 'utf8');
  let changes = 0;

  // =============================================
  // FIX 1: Live.tsx render block - remove first color canvas text draw
  // =============================================
  // The first text draw draws to BOTH W (color) and me (alpha).
  // We need to keep the me (alpha) draws but remove the W (color) draws.

  // Find the first text draw block (between sn.current setup and shadowEnabled check)
  const snStart = code.indexOf('if(sn.current){const H=sn.current');
  const shadowStart = code.indexOf('if(_e.config.shadowEnabled', snStart);

  if (snStart < 0 || shadowStart < 0) {
    console.log(file + ': Could not find Live render block');
    return;
  }

  // The block between setup and shadow has the first text draw.
  // Replace the combined W+me draws with me-only draws.

  // OLD eyebrow: W.save...W.restore(),me.save...me.restore()
  const oldEyebrowDraw =
    'H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore(),me.save(),me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),me.restore())';
  const newEyebrowDraw =
    'H.eyebrowContentW>0&&(me.save(),me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),me.restore())';

  if (code.includes(oldEyebrowDraw)) {
    code = code.replace(oldEyebrowDraw, newEyebrowDraw);
    changes++;
    console.log(file + ': Removed first eyebrow color draw');
  } else {
    console.log(file + ': WARNING - eyebrow draw pattern not found');
  }

  // OLD name: W.save...W.restore();me.save...me.restore()
  const oldNameDraw =
    'W.save(),W.globalAlpha=It.opacity,W.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();me.save(),me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),me.restore()';
  const newNameDraw =
    'me.save(),me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),me.restore()';

  // This pattern appears twice: once in first draw, once inside shadow block.
  // We only want to remove the FIRST occurrence (before the shadow check).
  const firstNameIdx = code.indexOf(oldNameDraw);
  if (firstNameIdx >= 0 && firstNameIdx < shadowStart) {
    code = code.substring(0, firstNameIdx) + newNameDraw + code.substring(firstNameIdx + oldNameDraw.length);
    changes++;
    console.log(file + ': Removed first name color draw');
  } else {
    console.log(file + ': WARNING - first name draw pattern not found');
  }

  // OLD title: W.save...W.restore();me.save...me.restore()
  const oldTitleDraw =
    'W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore();me.save(),me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),me.restore()';
  const newTitleDraw =
    'me.save(),me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),me.restore()';

  // Again, only replace the FIRST occurrence (before shadowEnabled)
  const shadowStartUpdated = code.indexOf('if(_e.config.shadowEnabled', snStart);
  const firstTitleIdx = code.indexOf(oldTitleDraw);
  if (firstTitleIdx >= 0 && firstTitleIdx < shadowStartUpdated) {
    code = code.substring(0, firstTitleIdx) + newTitleDraw + code.substring(firstTitleIdx + oldTitleDraw.length);
    changes++;
    console.log(file + ': Removed first title color draw');
  } else {
    console.log(file + ': WARNING - first title draw pattern not found');
  }

  // Now move the SECOND text draw from INSIDE the shadow if-block to AFTER it.
  // Currently the shadow block ends with text draws then closing }.
  // We want: shadow composite -> close } -> text draws

  // Find the shadow block's text draws (after W.restore() from shadow composite)
  const shadowBlockTextStart =
    'W.restore();H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore());W.save(),W.globalAlpha=It.opacity,W.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore()}';

  // Replace with: close shadow block, then text draws outside
  const shadowBlockTextNew =
    'W.restore()}' +
    'H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore());' +
    'W.save(),W.globalAlpha=It.opacity,W.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();' +
    'W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore();';

  if (code.includes(shadowBlockTextStart)) {
    code = code.replace(shadowBlockTextStart, shadowBlockTextNew);
    changes++;
    console.log(file + ': Moved text draw outside shadow block');
  } else {
    console.log(file + ': WARNING - shadow block text pattern not found');
  }

  // =============================================
  // FIX 2: Export Tc bitmap path - remove first text draw
  // =============================================

  // Find the Tc function bitmap path first text draw
  const tcBitmapFirstDraw =
    ';var dt=U.colorCanvas;U.eyebrow.w>0&&(n.globalAlpha=D.opacity,n.drawImage(dt,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,oe,zt,Ie,He)),n.globalAlpha=B.opacity,n.drawImage(dt,U.name.x,U.name.y,U.name.w,U.name.h,oe,Qe,le,we),n.globalAlpha=k.opacity,n.drawImage(dt,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce),n.globalAlpha=1,n.restore(),';

  // Replace with just the variable assignment and restore (no drawing)
  const tcBitmapFirstDrawNew =
    ';var dt=U.colorCanvas;n.restore();';

  if (code.includes(tcBitmapFirstDraw)) {
    code = code.replace(tcBitmapFirstDraw, tcBitmapFirstDrawNew);
    changes++;
    console.log(file + ': Removed Tc bitmap first text draw');
  } else {
    console.log(file + ': WARNING - Tc bitmap first draw pattern not found');
  }

  // Move the second text draw from inside shadow callback to after it
  // Current: ...Ae.globalAlpha=1});n.save();U.eyebrow...n.restore();if(p.underline)
  // The second text draw is already outside the xb() call, just needs to stay.
  // Actually it's already after the xb call. Let me verify...
  // The current code after xb: });n.save();U.eyebrow...n.restore();
  // This is correct - it's already after the shadow. No change needed here.

  // =============================================
  // FIX 3: Export Tc fallback path - fix shadow opacity
  // =============================================

  // Find the fallback shadow call (second xb call in Tc)
  const oldFallbackShadow =
    'p.shadowColor??"#000000",p.shadowStrength??100,c,De=>{De.textBaseline="top",De.imageSmoothingEnabled=!0,De.imageSmoothingQuality="high",R&&(De.font=$,De.globalAlpha=D.opacity,De.fillText(R,oe,q)),De.font=I,De.globalAlpha=B.opacity,De.fillText(p.name,le,ee),De.font=ve,De.globalAlpha=k.opacity,De.fillText(p.title,we,ie),De.globalAlpha=1})';

  const newFallbackShadow =
    'p.shadowColor??"#000000",(p.shadowStrength??100)*Math.max(D.opacity,B.opacity,k.opacity),c,De=>{De.textBaseline="top",De.imageSmoothingEnabled=!0,De.imageSmoothingQuality="high",R&&(De.font=$,De.globalAlpha=1,De.fillText(R,oe,q)),De.font=I,De.globalAlpha=1,De.fillText(p.name,le,ee),De.font=ve,De.globalAlpha=1,De.fillText(p.title,we,ie),De.globalAlpha=1})';

  if (code.includes(oldFallbackShadow)) {
    code = code.replace(oldFallbackShadow, newFallbackShadow);
    changes++;
    console.log(file + ': Fixed Tc fallback shadow opacity');
  } else {
    console.log(file + ': WARNING - fallback shadow pattern not found');
  }

  if (changes > 0) {
    fs.writeFileSync('dist/public/assets/' + file, code);
  }
  console.log(file + ': Total fixes applied: ' + changes);
  console.log('---');
});
