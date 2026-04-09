const fs = require('fs');

['index-iitzneuS.js', 'index-DJse72FL.js'].forEach(file => {
  let code = fs.readFileSync('dist/public/assets/' + file, 'utf8');
  
  // Find the Export shadow call: xb(n,a,l,...shadowStrength??100,c,Ae=>{ ... })
  // within the if(m) block
  const mBlock = code.indexOf(',m){const U=m,');
  if (mBlock < 0) { console.log(file + ': m block not found'); return; }
  
  // Find the shadow callback start (Ae=>{) after p.shadowEnabled
  const shadowEnabled = code.indexOf('p.shadowEnabled', mBlock);
  if (shadowEnabled < 0 || shadowEnabled > mBlock + 5000) { console.log(file + ': shadowEnabled not found'); return; }
  
  // 1. Multiply shadow strength by max text opacity
  const oldStrength = 'p.shadowStrength??100,c,Ae=>';
  const newStrength = '(p.shadowStrength??100)*Math.max(D.opacity,B.opacity,k.opacity),c,Ae=>';
  
  const searchArea = code.substring(shadowEnabled, shadowEnabled + 500);
  const idx = searchArea.indexOf(oldStrength);
  if (idx >= 0) {
    const absIdx = shadowEnabled + idx;
    code = code.substring(0, absIdx) + newStrength + code.substring(absIdx + oldStrength.length);
    console.log(file + ': Shadow strength multiplied by opacity');
  } else {
    console.log(file + ': WARN - shadowStrength pattern not found');
  }
  
  // 2. Fix glyph opacity in shadow callback to 1.0
  // Find callback after the strength fix
  const cbStart = code.indexOf('Ae=>{', shadowEnabled);
  if (cbStart < 0 || cbStart > shadowEnabled + 600) { console.log(file + ': callback not found'); return; }
  
  // Find the end of the callback: })
  const cbEnd = code.indexOf('})', cbStart);
  if (cbEnd < 0 || cbEnd > cbStart + 1000) { console.log(file + ': callback end not found'); return; }
  
  let cb = code.substring(cbStart, cbEnd + 2);
  const origLen = cb.length;
  cb = cb.replace(/Ae\.globalAlpha=D\.opacity/g, 'Ae.globalAlpha=1');
  cb = cb.replace(/Ae\.globalAlpha=B\.opacity/g, 'Ae.globalAlpha=1');
  cb = cb.replace(/Ae\.globalAlpha=k\.opacity/g, 'Ae.globalAlpha=1');
  
  if (cb.length !== origLen) {
    code = code.substring(0, cbStart) + cb + code.substring(cbEnd + 2);
    console.log(file + ': Shadow callback opacities fixed to 1.0');
  } else {
    console.log(file + ': WARN - No opacity replacements in callback');
  }
  
  fs.writeFileSync('dist/public/assets/' + file, code);
  console.log(file + ': Export shadow patched');
});
