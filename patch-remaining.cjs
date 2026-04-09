const fs = require('fs');

['index-iitzneuS.js', 'index-DJse72FL.js'].forEach(file => {
  let code = fs.readFileSync('dist/public/assets/' + file, 'utf8');
  let changes = 0;
  
  // 1. Fix remaining 1.121 in K function body (Live.tsx offscreen)
  // Pattern: +jt*1.121 (should be +jt*_RS)
  // This is inside the K function (between 'const K=' and 'y.useEffect')
  const kStart = code.indexOf('const K=(V,ye,_ms)');
  const kEnd = code.indexOf('y.useEffect(', kStart);
  if (kStart > 0 && kEnd > kStart) {
    let kBody = code.substring(kStart, kEnd);
    if (kBody.includes('*1.121')) {
      kBody = kBody.replace(/\*1\.121/g, '*_RS');
      code = code.substring(0, kStart) + kBody + code.substring(kEnd);
      changes++;
      console.log(file + ': K function remaining 1.121 fixed');
    }
  }
  
  // 2. Update xR call site
  // Pattern: At==="meta"?xR(l,c,n,f,p,x,E,w,C,k,N??"",$,we,He,Ce,Ae.current,dt):null
  // Need to: change condition to !=="syncTest" and pass maxScale param
  const xrCallRegex = /(\w+)==="meta"\?xR\(([^)]+)\):null/g;
  code = code.replace(xrCallRegex, (match, varName, args) => {
    // Only match xR calls (not _c calls which were already handled)
    if (!match.includes('xR(')) return match;
    changes++;
    return `(${varName}&&${varName}!=="syncTest")?xR(${args},${varName}==="meta"?1.121:1):null`;
  });
  
  if (changes > 0) {
    fs.writeFileSync('dist/public/assets/' + file, code);
  }
  console.log(file + ': remaining fixes:', changes);
});
