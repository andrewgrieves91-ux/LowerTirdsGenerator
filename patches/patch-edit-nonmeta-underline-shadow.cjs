/*
 * patch-edit-nonmeta-underline-shadow.cjs
 *
 * Adds shadow setup to the Edit page (`Ye` per-frame renderer) non-
 * Meta underline strokes. Mirrors what the Meta branch already does:
 * before each underline `H.beginPath()/stroke()` group, we set
 * `H.shadow*` from the closure-scoped `z` (shadowEnabled), `U`
 * (shadowColor), `q` (shadowBlur), `ie` (shadowOffsetX), `te`
 * (shadowOffsetY), `oe` (shadowStrength). After the strokes we
 * reset shadow* to zero.
 *
 * Three blocks are touched:
 *   - eyebrow: `if(D&&n){H.font=jn;var _eUlW=...}`
 *   - name:    `if(... ,G.fillText(l,oa,ja),D){const yn=H.measureText(l).width;...}`
 *   - title:   `if(... ,G.fillText(c,Xn,Ba),D){const yn=H.measureText(c).width;...}`
 *
 * NOTE on z-order: this patch ADDS shadow but does not reorder text
 * vs. underline within each section. Visual ordering relies on the
 * existing post-loop `if(z){for(... H.filter=_shFNM ...)}` text
 * shadow-loop, which re-renders the text on top of the underline.
 * Where the text falls on top of the underline-shadow, the re-render
 * covers it. If user reports residual underline-shadow-over-text in
 * the Edit page non-Meta path, follow up with a true reorder patch.
 *
 * Idempotent. Atomic.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BUNDLE = path.resolve(__dirname, "..", "dist", "public", "assets", "index-iitzneuS.js");

// Common shadow setup that we splice into each block. Uses unique local var
// names (`_nuC*`) so they don't collide with the Meta path's `_eu*`.
const SHADOW_SETUP =
  "if(z){" +
    "var _nuC=U," +
        "_nuR=parseInt(_nuC.slice(1,3),16)||0," +
        "_nuG=parseInt(_nuC.slice(3,5),16)||0," +
        "_nuB=parseInt(_nuC.slice(5,7),16)||0," +
        "_nuA=Math.min(oe/100,1);" +
    "H.shadowBlur=q;H.shadowOffsetX=ie;H.shadowOffsetY=te;" +
    "H.shadowColor=\"rgba(\"+_nuR+\",\"+_nuG+\",\"+_nuB+\",\"+_nuA+\")\";" +
  "}else{H.shadowBlur=0;H.shadowOffsetX=0;H.shadowOffsetY=0;}";
const SHADOW_RESET = "H.shadowBlur=0;H.shadowOffsetX=0;H.shadowOffsetY=0;";

const REPLACEMENTS = [
  // 1) Eyebrow non-Meta underline
  //    Wrap the existing `if(D&&n){...}` body with shadow setup + reset.
  {
    label: "eyebrow",
    oldStr:
      "if(D&&n){H.font=jn;var _eUlW=H.measureText(n).width,_eUlY=Qt+fa+_ulOff;H.strokeStyle=$,H.lineWidth=_ulThick,H.beginPath(),H.moveTo(Ua,_eUlY),H.lineTo(Ua+_eUlW,_eUlY),H.stroke();G.strokeStyle=\"#FFFFFF\",G.font=jn,G.lineWidth=_ulThick,G.beginPath(),G.moveTo(Ua,_eUlY),G.lineTo(Ua+_eUlW,_eUlY),G.stroke()}",
    newStr:
      "if(D&&n){" +
        SHADOW_SETUP +
        "H.font=jn;var _eUlW=H.measureText(n).width,_eUlY=Qt+fa+_ulOff;" +
        "H.strokeStyle=$,H.lineWidth=_ulThick,H.beginPath(),H.moveTo(Ua,_eUlY),H.lineTo(Ua+_eUlW,_eUlY),H.stroke();" +
        "G.strokeStyle=\"#FFFFFF\",G.font=jn,G.lineWidth=_ulThick,G.beginPath(),G.moveTo(Ua,_eUlY),G.lineTo(Ua+_eUlW,_eUlY),G.stroke();" +
        SHADOW_RESET +
      "}",
  },

  // 2) Name non-Meta underline
  //    The body lives inside `,...,D){...}`. Wrap the body content.
  {
    label: "name",
    oldStr:
      ",D){const yn=H.measureText(l).width;H.strokeStyle=$,H.lineWidth=_ulThick;const Qt=ja+Fn+_ulOff;H.beginPath(),H.moveTo(oa,Qt),H.lineTo(oa+yn,Qt),H.stroke(),G.strokeStyle=\"#FFFFFF\",G.lineWidth=_ulThick,G.beginPath(),G.moveTo(oa,Qt),G.lineTo(oa+yn,Qt),G.stroke()}",
    newStr:
      ",D){" +
        SHADOW_SETUP +
        "const yn=H.measureText(l).width;H.strokeStyle=$,H.lineWidth=_ulThick;const Qt=ja+Fn+_ulOff;" +
        "H.beginPath(),H.moveTo(oa,Qt),H.lineTo(oa+yn,Qt),H.stroke(),G.strokeStyle=\"#FFFFFF\",G.lineWidth=_ulThick,G.beginPath(),G.moveTo(oa,Qt),G.lineTo(oa+yn,Qt),G.stroke();" +
        SHADOW_RESET +
      "}",
  },

  // 3) Title non-Meta underline
  {
    label: "title",
    oldStr:
      ",D){const yn=H.measureText(c).width,Qt=Ba+Bn+_ulOff;H.strokeStyle=$,H.lineWidth=_ulThick,H.beginPath(),H.moveTo(Xn,Qt),H.lineTo(Xn+yn,Qt),H.stroke(),G.strokeStyle=\"#FFFFFF\",G.lineWidth=_ulThick,G.beginPath(),G.moveTo(Xn,Qt),G.lineTo(Xn+yn,Qt),G.stroke()}",
    newStr:
      ",D){" +
        SHADOW_SETUP +
        "const yn=H.measureText(c).width,Qt=Ba+Bn+_ulOff;H.strokeStyle=$,H.lineWidth=_ulThick,H.beginPath(),H.moveTo(Xn,Qt),H.lineTo(Xn+yn,Qt),H.stroke(),G.strokeStyle=\"#FFFFFF\",G.lineWidth=_ulThick,G.beginPath(),G.moveTo(Xn,Qt),G.lineTo(Xn+yn,Qt),G.stroke();" +
        SHADOW_RESET +
      "}",
  },
];

// Idempotency marker — `_nuC=U` is unique to this patch's setup snippet.
const MARKER = "var _nuC=U,_nuR=parseInt(_nuC.slice(1,3)";

function main() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(`bundle not found: ${BUNDLE}`);
    process.exit(1);
  }
  const original = fs.readFileSync(BUNDLE, "utf8");
  let src = original;

  if (src.includes(MARKER)) {
    console.log("[patch-edit-nonmeta-underline-shadow] already applied");
    return;
  }

  for (const r of REPLACEMENTS) {
    const n = src.split(r.oldStr).length - 1;
    if (n === 0) {
      console.error(`[patch-edit-nonmeta-underline-shadow] ${r.label}: anchor not found`);
      process.exit(1);
    }
    if (n !== 1) {
      console.error(`[patch-edit-nonmeta-underline-shadow] ${r.label}: anchor not unique (${n})`);
      process.exit(1);
    }
    src = src.replace(r.oldStr, r.newStr);
    console.log(`[patch-edit-nonmeta-underline-shadow] ${r.label}: wrapped`);
  }

  if (src === original) {
    console.log("[patch-edit-nonmeta-underline-shadow] nothing to do");
    return;
  }
  fs.writeFileSync(BUNDLE, src, "utf8");
  console.log("[patch-edit-nonmeta-underline-shadow] OK");
}
main();
