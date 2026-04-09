const fs = require('fs');

['index-iitzneuS.js', 'index-DJse72FL.js'].forEach(file => {
  let code = fs.readFileSync('dist/public/assets/' + file, 'utf8');
  let changes = 0;
  
  // 1. Update _c function to accept maxScale parameter
  const oldFnSig = 'function _c(r,n,a){';
  const newFnSig = 'function _c(r,n,a,_ms){const _RS=_ms||1.121;';
  if (code.includes(oldFnSig)) {
    code = code.replace(oldFnSig, newFnSig);
    changes++;
    console.log(file + ': _c function signature updated');
  }
  
  // 2. Replace hardcoded 1.121 in _c body with _RS
  // Find the _c function body
  const fnStart = code.indexOf('function _c(r,n,a,_ms)');
  if (fnStart >= 0) {
    // Find the end of _c function (it returns an object and ends with }})
    const fnEnd = code.indexOf('maxScale:', fnStart);
    if (fnEnd >= 0) {
      const fnEndFull = code.indexOf('}}', fnEnd);
      let fnBody = code.substring(fnStart, fnEndFull + 2);
      
      // Replace font size multipliers: c*1.121, u*1.121, f*1.121
      fnBody = fnBody.replace(/c\*1\.121/g, 'c*_RS');
      fnBody = fnBody.replace(/u\*1\.121/g, 'u*_RS');
      fnBody = fnBody.replace(/f\*1\.121/g, 'f*_RS');
      // Replace maxScale:1.121
      fnBody = fnBody.replace(/maxScale:1\.121/g, 'maxScale:_RS');
      // Replace the weird +fe*1.121 (REGION_PAD calculation)
      fnBody = fnBody.replace(/\+fe\*1\.121/g, '+fe*_RS');
      
      code = code.substring(0, fnStart) + fnBody + code.substring(fnEndFull + 2);
      changes++;
      console.log(file + ': _c function body patched (1.121 → _RS)');
    }
  }
  
  // 3. Update xR function similarly (if it also has 1.121)
  const xrStart = code.indexOf('function xR(');
  if (xrStart >= 0) {
    // Check if xR has 1.121
    const xrArea = code.substring(xrStart, xrStart + 4000);
    if (xrArea.includes('*1.121')) {
      // xR takes many parameters. It seems to be a different function.
      // Let me find its parameter that controls the scale
      // xR(r,n,a,l,i,c,u,f,m,p,v,x,b,E,_,w,T)
      // It has D*1.121, B*1.121, k*1.121 and maxScale:1.121
      // Add a _ms parameter at the end
      const oldXr = 'function xR(r,n,a,l,i,c,u,f,m,p,v,x,b,E,_,w,T){';
      const newXr = 'function xR(r,n,a,l,i,c,u,f,m,p,v,x,b,E,_,w,T,_xms){const _XRS=_xms||1.121;';
      if (code.includes(oldXr)) {
        code = code.replace(oldXr, newXr);
        
        // Replace 1.121 in xR body
        const xrBodyStart = code.indexOf('function xR(');
        const xrMaxScale = code.indexOf('maxScale:', xrBodyStart);
        if (xrMaxScale > 0) {
          const xrEnd = code.indexOf('}}', xrMaxScale);
          let xrBody = code.substring(xrBodyStart, xrEnd + 2);
          xrBody = xrBody.replace(/D\*1\.121/g, 'D*_XRS');
          xrBody = xrBody.replace(/B\*1\.121/g, 'B*_XRS');
          xrBody = xrBody.replace(/k\*1\.121/g, 'k*_XRS');
          xrBody = xrBody.replace(/maxScale:1\.121/g, 'maxScale:_XRS');
          xrBody = xrBody.replace(/\+xe\*1\.121/g, '+xe*_XRS');
          code = code.substring(0, xrBodyStart) + xrBody + code.substring(xrEnd + 2);
          changes++;
          console.log(file + ': xR function patched');
        }
      }
    }
  }
  
  // 4. Update _c call sites: change condition from ==='meta' to !=='syncTest'
  //    and pass maxScale parameter
  // Pattern: ==="meta"?_c(VAR,RS,LOGO):null
  // New:    !==\"syncTest\"?_c(VAR,RS,LOGO,ANIMTYPE===\"meta\"?1.121:1):null
  
  // Call site patterns found:
  // r.config.animationType==="meta"?_c(r,N,p):null
  // U.config.animationType==="meta"?_c(U,He,M.current):null
  // Je.config.animationType==="meta"?_c(Je,wa,M.current):null
  // U.config.animationType==="meta"?_c(U,Qe,M.current):null
  // Ce.config.animationType==="meta"?_c(Ce,Ae,M.current):null
  
  // Use regex to match all patterns
  const callRegex = /(\w+)\.config\.animationType==="meta"\?_c\((\w+),(\w+(?:\.\w+)?),(\w+(?:\.\w+)?)\):null/g;
  code = code.replace(callRegex, (match, v1, v2, v3, v4) => {
    changes++;
    return `(${v1}.config.animationType&&${v1}.config.animationType!=="syncTest")?_c(${v2},${v3},${v4},${v1}.config.animationType==="meta"?1.121:1):null`;
  });
  
  console.log(file + ': _c call sites updated');
  
  fs.writeFileSync('dist/public/assets/' + file, code);
  console.log(file + ': Total changes:', changes);
});
