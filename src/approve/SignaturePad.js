// The customer's signature with a finger (design app-invoice approve: the box with ×, the line,
// «Sign with your finger», Clear). A canvas in a WebView (react-native-webview, already in the
// app: no new native module): strokes stay in the page; the screen asks for the PNG when the
// customer approves (ref.png() → a PNG data URL or null when nothing is drawn). The PNG has a
// clear background and dark ink, at the phone's pixel density but at most 2× (the server takes
// at most 400 KB; a signature is some 20–40 KB).
// A signature is a real stroke (USABILITY_2026-11-24 §3, QA Б2): «drawn» comes once the ink is
// longer than sign/model.js MIN_INK (about 2 cm, all strokes together) — a dot or a scroll that
// started on the box is not a signature, and png() gives null for it.
// variant 'full' — the sign screen (sign/SignSheet.js): the box fills its place, Clear in a pill
// at the top right, under the line the signer's name and the day (caption); 'box' — the box of a
// form (the card payment), «Sign with your finger» and Clear under the line.
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../constants/colors';
import { MIN_INK } from '../sign/model';

const PAGE = (ink, minInk) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none}
canvas{display:block;width:100%;height:100%;touch-action:none}</style></head><body><canvas id="c"></canvas><script>
(function(){
  var c=document.getElementById('c'),x=c.getContext('2d'),r=Math.min(window.devicePixelRatio||1,2),drawn=false,last=null,ink=0,touched=false;
  function size(){var w=c.clientWidth,h=c.clientHeight;c.width=Math.round(w*r);c.height=Math.round(h*r);x.setTransform(r,0,0,r,0,0);
    x.lineWidth=2.6;x.lineCap='round';x.lineJoin='round';x.strokeStyle=${JSON.stringify(ink)};drawn=false;ink=0;touched=false;}
  function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
  function at(e){var t=e.touches?e.touches[0]:e,b=c.getBoundingClientRect();return{x:t.clientX-b.left,y:t.clientY-b.top};}
  function start(e){e.preventDefault();last=at(e);x.beginPath();x.arc(last.x,last.y,1.2,0,6.3);x.fillStyle=x.strokeStyle;x.fill();
    if(!touched){touched=true;post({type:'touched'});}}
  function move(e){if(!last)return;e.preventDefault();var p=at(e);x.beginPath();x.moveTo(last.x,last.y);x.lineTo(p.x,p.y);x.stroke();
    ink+=Math.sqrt((p.x-last.x)*(p.x-last.x)+(p.y-last.y)*(p.y-last.y));last=p;
    if(!drawn&&ink>=${minInk}){drawn=true;post({type:'drawn'});}}
  function end(){last=null;}
  c.addEventListener('touchstart',start,{passive:false});c.addEventListener('touchmove',move,{passive:false});
  c.addEventListener('touchend',end);c.addEventListener('touchcancel',end);
  window.semixClear=function(){x.clearRect(0,0,c.width,c.height);drawn=false;ink=0;touched=false;post({type:'cleared'});};
  window.semixPng=function(n){post({type:'png',n:n,data:drawn?c.toDataURL('image/png'):null});};
  size();post({type:'ready'});
})();
</script></body></html>`;

const SignaturePad = forwardRef(function SignaturePad({ onDrawn, disabled = false, variant = 'box', caption = null, style = null }, ref) {
  const web = useRef(null);
  const asks = useRef(new Map()); // n → resolve of a png() waiting for the page
  const counter = useRef(0);
  const [drawn, setDrawn] = useState(false);
  const [touched, setTouched] = useState(false); // any ink, even a dot: Clear wipes it
  const full = variant === 'full';

  useImperativeHandle(ref, () => ({
    png: () => new Promise((resolve) => {
      const n = ++counter.current;
      asks.current.set(n, resolve);
      web.current?.injectJavaScript(`window.semixPng(${n});true;`);
      // a page that does not answer (it never should): nothing drawn
      setTimeout(() => { if (asks.current.delete(n)) resolve(null); }, 4000);
    }),
    clear: () => web.current?.injectJavaScript('window.semixClear();true;'),
  }), []);

  const onMessage = (event) => {
    let m;
    try { m = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (m.type === 'touched') setTouched(true);
    if (m.type === 'drawn') { setDrawn(true); onDrawn && onDrawn(true); }
    if (m.type === 'cleared') { setTouched(false); setDrawn(false); onDrawn && onDrawn(false); }
    if (m.type === 'png') {
      const resolve = asks.current.get(m.n);
      if (resolve) { asks.current.delete(m.n); resolve(typeof m.data === 'string' ? m.data : null); }
    }
  };

  const clear = () => web.current?.injectJavaScript('window.semixClear();true;');
  const clearOff = !touched || disabled;
  const clearButton = (
    <TouchableOpacity style={full ? styles.pill : null} onPress={clear} disabled={clearOff}
      accessibilityRole="button" accessibilityLabel="Clear the signature" accessibilityState={{ disabled: clearOff }} hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}>
      <Text style={[full ? styles.pillText : styles.clear, clearOff && styles.clearOff]}>Clear</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[full ? styles.fullBox : styles.box, disabled && styles.off, style]} accessible={!full}
      accessibilityLabel={drawn ? 'Signature, signed' : 'Signature box: the customer signs with a finger'}>
      <WebView ref={web} originWhitelist={['*']} source={{ html: PAGE(colors.fgDefault, MIN_INK) }} onMessage={onMessage}
        scrollEnabled={false} bounces={false} overScrollMode="never" style={styles.web} containerStyle={full ? styles.fullWebBox : styles.webBox}
        javaScriptEnabled pointerEvents={disabled ? 'none' : 'auto'} />
      <Text style={full ? styles.fullX : styles.x} pointerEvents="none">×</Text>
      {full ? (
        <View style={styles.fullBase} pointerEvents="none"><View style={styles.fullDash} /></View>
      ) : <View style={styles.base} pointerEvents="none" />}
      {full ? (
        <>
          {caption ? <Text style={styles.fullCap} numberOfLines={1} pointerEvents="none">{caption}</Text> : null}
          <View style={styles.pillAt} pointerEvents="box-none">{clearButton}</View>
        </>
      ) : (
        <View style={styles.foot} pointerEvents="box-none">
          <Text style={styles.cap} pointerEvents="none">Sign with your finger</Text>
          {clearButton}
        </View>
      )}
    </View>
  );
});

export default SignaturePad;

const styles = StyleSheet.create({
  box: { height: 170, marginHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard, overflow: 'hidden' },
  off: { opacity: 0.5 },
  webBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 34, backgroundColor: 'transparent' },
  web: { backgroundColor: 'transparent' },
  x: { position: 'absolute', left: 18, bottom: 46, fontSize: 20, fontWeight: '700', color: colors.fgMutedField },
  base: { position: 'absolute', left: 18, right: 18, bottom: 40, borderBottomWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong },
  foot: { position: 'absolute', left: 18, right: 18, bottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cap: { fontSize: 13, color: colors.fgMutedField },
  clear: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  clearOff: { color: colors.fgDisabled },
  // the sign screen (design tech-app usab-u3-sign): the box fills its place; ink over all of it
  // but the strip of the name under the line
  fullBox: { flex: 1, borderRadius: 18, borderWidth: 2, borderColor: colors.borderControl, backgroundColor: colors.bgCard, overflow: 'hidden' },
  fullWebBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 52, backgroundColor: 'transparent' },
  fullX: { position: 'absolute', left: 24, bottom: 90, fontSize: 24, fontWeight: '600', color: colors.fgMutedField },
  // a dashed line: iOS draws no dash on one side alone — a box dashed all round, seen through a
  // strip as high as its border, so only its top edge shows
  fullBase: { position: 'absolute', left: 24, right: 24, bottom: 82, height: 1.5, overflow: 'hidden' },
  fullDash: { height: 12, borderWidth: 1.5, borderRadius: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  fullCap: { position: 'absolute', left: 24, right: 24, bottom: 46, fontSize: 15, color: colors.fgSecondary },
  pillAt: { position: 'absolute', top: 12, right: 12 },
  pill: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  pillText: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
});
