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
  // FIX 1: Add drawPad + content sizes to Export offscreen builder return
  // ======================================================================
  const oldReturn = '{colorCanvas:U,alphaCanvas:oe,shadowCanvas:null,eyebrow:ve,name:Ne,title:z,maxScale:_RS}';
  const newReturn = '{colorCanvas:U,alphaCanvas:oe,shadowCanvas:null,eyebrow:ve,name:Ne,title:z,maxScale:_RS,drawPad:fe,nameContentW:k,nameContentH:M,titleContentW:L,titleContentH:se,eyebrowContentW:D,eyebrowContentH:B}';

  if (code.includes(oldReturn)) {
    code = code.replace(oldReturn, newReturn);
    console.log('  [OK] Added drawPad + content sizes to offscreen return');
    changed = true;
  } else {
    console.log('  [WARN] Offscreen return pattern not found');
  }

  // ======================================================================
  // FIX 2: Replace meta rendering block with drawScaled + CSS filter
  // ======================================================================
  const oldMeta = [
    'const U=m,Q=ue/U.maxScale,le=U.name.w*Q,we=U.name.h*Q,De=U.title.w*Q,Ce=U.title.h*Q,',
    'Ie=U.eyebrow.w*Q,He=U.eyebrow.h*Q;',
    'var oe,Qe,$e,zt;',
    'if(M){oe=E+he;Qe=_;$e=Qe+we+T;zt=Qe-He-w}',
    'else{oe=E+B.x*b;Qe=ee+B.y*b;$e=ie+k.y*b;zt=q+D.y*b};',
    'var dt=U.colorCanvas;n.restore();',
    // Text draws (9-arg drawImage)
    'U.eyebrow.w>0&&(n.save(),n.globalAlpha=D.opacity,',
    'n.drawImage(U.colorCanvas,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,oe,zt,Ie,He),n.restore());',
    'n.save(),n.globalAlpha=B.opacity,',
    'n.drawImage(U.colorCanvas,U.name.x,U.name.y,U.name.w,U.name.h,oe,Qe,le,we),n.restore();',
    'n.save(),n.globalAlpha=k.opacity,',
    'n.drawImage(U.colorCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce),n.restore();',
    // Shadow (destination-out)
    'if(p.shadowEnabled){',
    'var _tmpC=document.createElement("canvas");_tmpC.width=a;_tmpC.height=l;',
    'var _tmpX=_tmpC.getContext("2d");',
    'if(U.eyebrow.w>0){_tmpX.save();_tmpX.globalAlpha=D.opacity;',
    '_tmpX.drawImage(U.alphaCanvas,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,oe,zt,Ie,He);',
    '_tmpX.restore()}',
    '_tmpX.save();_tmpX.globalAlpha=B.opacity;',
    '_tmpX.drawImage(U.alphaCanvas,U.name.x,U.name.y,U.name.w,U.name.h,oe,Qe,le,we);_tmpX.restore();',
    '_tmpX.save();_tmpX.globalAlpha=k.opacity;',
    '_tmpX.drawImage(U.alphaCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce);_tmpX.restore();',
    'var _shC=document.createElement("canvas");_shC.width=a;_shC.height=l;',
    'var _shX=_shC.getContext("2d");',
    '_shX.shadowBlur=(p.shadowBlur??10)*b;_shX.shadowOffsetX=(p.shadowOffsetX??0)*b;',
    '_shX.shadowOffsetY=(p.shadowOffsetY??0)*b;_shX.shadowColor=p.shadowColor??"rgba(0,0,0,0.8)";',
    '_shX.drawImage(_tmpC,0,0);_shX.globalCompositeOperation="destination-out";_shX.drawImage(_tmpC,0,0);',
    '_shX.globalCompositeOperation="source-over";',
    'var _expStrE=p.shadowStrength??100;',
    'n.save();n.globalAlpha=Math.min(_expStrE/100,1);n.drawImage(_shC,0,0);',
    'if(_expStrE>100){n.globalAlpha=(_expStrE-100)/100;n.drawImage(_shC,0,0)}',
    'n.globalAlpha=1;n.restore();',
    // Text redraw after shadow
    'U.eyebrow.w>0&&(n.save(),n.globalAlpha=D.opacity,',
    'n.drawImage(U.colorCanvas,U.eyebrow.x,U.eyebrow.y,U.eyebrow.w,U.eyebrow.h,oe,zt,Ie,He),n.restore());',
    'n.save(),n.globalAlpha=B.opacity,',
    'n.drawImage(U.colorCanvas,U.name.x,U.name.y,U.name.w,U.name.h,oe,Qe,le,we),n.restore();',
    'n.save(),n.globalAlpha=k.opacity,',
    'n.drawImage(U.colorCanvas,U.title.x,U.title.y,U.title.w,U.title.h,oe,$e,De,Ce),n.restore()}'
  ].join('');

  const newMeta = [
    // Setup with drawScaled
    'const U=m,Q=ue/U.maxScale,_dp=U.drawPad||0;',
    'var oe,Qe,$e,zt;',
    'if(M){oe=E+he;Qe=_;',
    '$e=Qe+(U.nameContentH||U.name.h)*Q+T;',
    'zt=Qe-(U.eyebrowContentH||U.eyebrow.h)*Q-w}',
    'else{oe=E+B.x*b;Qe=ee+B.y*b;$e=ie+k.y*b;zt=q+D.y*b};',
    'var _eXe=M?oe:E+(D.x||0)*b,_nXe=M?oe:E+(B.x||0)*b,_tXe=M?oe:E+(k.x||0)*b;',
    'var _srcC=u?U.alphaCanvas:U.colorCanvas;',
    'var _dse=function(_c,_cv,_r,_dx,_dy,_a){',
    '_c.save();_c.globalAlpha=_a;_c.translate(_dx,_dy);_c.scale(Q,Q);',
    '_c.drawImage(_cv,_r.x,_r.y,_r.w,_r.h,0,0,_r.w,_r.h);_c.restore()};',
    'n.restore();',
    // Shadow pass (CSS drop-shadow filter)
    'if(p.shadowEnabled){',
    'var _shFE=function(){',
    'var _hx=p.shadowColor||"#000000",',
    '_r=parseInt(_hx.slice(1,3),16)||0,_g=parseInt(_hx.slice(3,5),16)||0,',
    '_b=parseInt(_hx.slice(5,7),16)||0,',
    '_bl=(p.shadowBlur??10)*b,_ox=(p.shadowOffsetX??0)*b,_oy=(p.shadowOffsetY??0)*b,',
    '_a=Math.min((p.shadowStrength??100)/100,1);',
    'return"drop-shadow("+_ox+"px "+_oy+"px "+_bl+"px rgba("+_r+","+_g+","+_b+","+_a+"))"}();',
    'n.filter=_shFE;',
    'U.eyebrow.w>0&&_dse(n,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);',
    '_dse(n,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);',
    '_dse(n,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity);',
    'n.filter="none"}',
    // Clean text pass
    'U.eyebrow.w>0&&_dse(n,_srcC,U.eyebrow,_eXe-_dp*Q,zt-_dp*Q,D.opacity);',
    '_dse(n,_srcC,U.name,_nXe-_dp*Q,Qe-_dp*Q,B.opacity);',
    '_dse(n,_srcC,U.title,_tXe-_dp*Q,$e-_dp*Q,k.opacity)'
  ].join('');

  if (code.includes(oldMeta)) {
    code = code.replace(oldMeta, newMeta);
    console.log('  [OK] Meta rendering: replaced with drawScaled + CSS filter');
    changed = true;
  } else {
    console.log('  [WARN] Meta rendering block not found');
  }

  // ======================================================================
  // FIX 3: Replace non-meta shadow (destination-out) with CSS filter
  // ======================================================================
  const oldNmShadow = [
    'if(p.shadowEnabled){var _gC=document.createElement("canvas");_gC.width=a;_gC.height=l;',
    'var _gX=_gC.getContext("2d");_gX.textBaseline="top";_gX.fillStyle="#ffffff";',
    'if(R){_gX.font=$;_gX.globalAlpha=D.opacity;',
    '_gX.fillText(R,xe?te+D.x*b:Math.round(te+D.x*b),q)}',
    '_gX.font=I;_gX.globalAlpha=B.opacity;',
    '_gX.fillText(p.name,xe?te+B.x*b:Math.round(te+B.x*b),ee);',
    '_gX.font=ve;_gX.globalAlpha=k.opacity;',
    '_gX.fillText(p.title,xe?te+k.x*b:Math.round(te+k.x*b),ie);',
    '_gX.globalAlpha=1;',
    'var _sC=document.createElement("canvas");_sC.width=a;_sC.height=l;',
    'var _sX=_sC.getContext("2d");',
    '_sX.shadowBlur=(p.shadowBlur??10)*b;_sX.shadowOffsetX=(p.shadowOffsetX??3)*b;',
    '_sX.shadowOffsetY=(p.shadowOffsetY??3)*b;_sX.shadowColor=p.shadowColor||"#000000";',
    '_sX.drawImage(_gC,0,0);_sX.globalCompositeOperation="destination-out";_sX.drawImage(_gC,0,0);',
    '_sX.globalCompositeOperation="source-over";',
    'var _str=p.shadowStrength??100;',
    'n.save();n.globalCompositeOperation="source-over";',
    'n.globalAlpha=Math.min(_str/100,1);n.drawImage(_sC,0,0);',
    'if(_str>100){n.globalAlpha=(_str-100)/100;n.drawImage(_sC,0,0)}',
    'n.globalAlpha=1;n.restore()}'
  ].join('');

  const newNmShadow = [
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

  if (code.includes(oldNmShadow)) {
    code = code.replace(oldNmShadow, newNmShadow);
    console.log('  [OK] Non-meta shadow: replaced destination-out with CSS filter');
    changed = true;
  } else {
    console.log('  [WARN] Non-meta shadow block not found');
  }

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
