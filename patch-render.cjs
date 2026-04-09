const fs = require('fs');

const newBlock = 'if(sn.current){const H=sn.current,G=tr/H.maxScale,ke=H.drawPad,Oe=Yn?ln+nr:ln+It.x;var _Ga,_fa,_Fn;if(Yn){const Ye=_e.config.eyebrowGap??8,Re=_e.config.titleGap??10;_Ga=_e.config.posY;_fa=_Ga+H.nameContentH*G+Re;_Fn=_Ga-H.eyebrowContentH*G-Ye}else{_Ga=Ze;_fa=ta;_Fn=Ln}H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore(),me.save(),me.globalAlpha=pn.opacity,me.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),me.restore());W.save(),W.globalAlpha=It.opacity,W.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();me.save(),me.globalAlpha=It.opacity,me.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),me.restore();W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore();me.save(),me.globalAlpha=nn.opacity,me.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),me.restore();if(_e.config.shadowEnabled??!1){const jn=_e.config.shadowBlur??10,Gn=_e.config.shadowOffsetX??0,Xa=_e.config.shadowOffsetY??0,Xr=_e.config.shadowColor??"rgba(0,0,0,0.8)",qr=_e.config.shadowStrength??100,aa=V.width,ds=V.height,_so=Math.max(pn.opacity,It.opacity,nn.opacity),qa=document.createElement("canvas");qa.width=aa,qa.height=ds;const Aa=qa.getContext("2d");H.eyebrowContentW>0&&Aa.drawImage(H.alphaCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G);Aa.drawImage(H.alphaCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G);Aa.drawImage(H.alphaCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G);const Se=document.createElement("canvas");Se.width=aa,Se.height=ds;const Ee=Se.getContext("2d");Ee.shadowBlur=jn,Ee.shadowOffsetX=Gn,Ee.shadowOffsetY=Xa,Ee.shadowColor=Xr,Ee.drawImage(qa,0,0),Ee.globalCompositeOperation="destination-out",Ee.drawImage(qa,0,0),W.save(),W.globalAlpha=_so*Math.min(qr/100,1),W.drawImage(Se,0,0),qr>100&&(W.globalAlpha=_so*(qr-100)/100,W.drawImage(Se,0,0)),W.restore();H.eyebrowContentW>0&&(W.save(),W.globalAlpha=pn.opacity,W.drawImage(H.colorCanvas,H.eyebrow.x,H.eyebrow.y,H.eyebrow.w,H.eyebrow.h,Oe-ke*G,_Fn-ke*G,H.eyebrow.w*G,H.eyebrow.h*G),W.restore());W.save(),W.globalAlpha=It.opacity,W.drawImage(H.colorCanvas,H.name.x,H.name.y,H.name.w,H.name.h,Oe-ke*G,_Ga-ke*G,H.name.w*G,H.name.h*G),W.restore();W.save(),W.globalAlpha=nn.opacity,W.drawImage(H.colorCanvas,H.title.x,H.title.y,H.title.w,H.title.h,Oe-ke*G,_fa-ke*G,H.title.w*G,H.title.h*G),W.restore()}if(_e.config.underline){W.font=La;const _nw=W.measureText(_e.config.name).width;W.font=Ca;const _tw=W.measureText(_e.config.title).width;W.shadowBlur=0,W.shadowOffsetX=0,W.shadowOffsetY=0,W.strokeStyle=_e.config.color,W.lineWidth=Math.max(2,mn/24),W.globalAlpha=It.opacity,W.beginPath();const _uny=_Ga+mn+2,_uty=_fa+jt+2;W.moveTo(Oe,_uny),W.lineTo(Oe+_nw,_uny),W.moveTo(Oe,_uty),W.lineTo(Oe+_tw,_uty),W.stroke();me.strokeStyle="#FFFFFF",me.lineWidth=Math.max(2,mn/24),me.globalAlpha=It.opacity,me.beginPath(),me.moveTo(Oe,_uny),me.lineTo(Oe+_nw,_uny),me.moveTo(Oe,_uty),me.lineTo(Oe+_tw,_uty),me.stroke()}W.globalAlpha=1,me.globalAlpha=1,W.restore(),me.restore()}';

['index-iitzneuS.js', 'index-DJse72FL.js'].forEach(file => {
  let code = fs.readFileSync('dist/public/assets/' + file, 'utf8');
  
  const startStr = 'if(Yn&&sn.current){';
  const startPos = code.indexOf(startStr, 480000);
  if (startPos < 0) { console.log(file + ': START NOT FOUND'); return; }
  
  const endMarker = 'W.restore(),me.restore()}}}const';
  const endSearch = code.indexOf(endMarker, startPos);
  if (endSearch < 0) { console.log(file + ': END NOT FOUND'); return; }
  
  const endPos = endSearch + 'W.restore(),me.restore()}'.length;
  
  const oldBlock = code.substring(startPos, endPos);
  console.log(file + ':');
  console.log('  Old block: pos', startPos, 'to', endPos, '(length', oldBlock.length, ')');
  console.log('  New block length:', newBlock.length);
  
  code = code.substring(0, startPos) + newBlock + code.substring(endPos);
  fs.writeFileSync('dist/public/assets/' + file, code);
  console.log('  Render loop replaced successfully');
});
