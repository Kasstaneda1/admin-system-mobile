// The customer's signature with a finger (design app-invoice approve: the box with ×, the line,
// «Sign with your finger», Clear). A canvas in a WebView (react-native-webview, already in the
// app: no new native module): strokes stay in the page; the screen asks for the PNG when the
// customer approves (ref.png() → a PNG data URL or null when nothing is drawn). The PNG has a
// clear background and dark ink, at the phone's pixel density but at most 2× (the server takes
// at most 400 KB; a signature is some 20–40 KB).
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../constants/colors';

const PAGE = (ink) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:transparent;overflow:hidden;-webkit-user-select:none;user-select:none}
canvas{display:block;width:100%;height:100%;touch-action:none}</style></head><body><canvas id="c"></canvas><script>
(function(){
  var c=document.getElementById('c'),x=c.getContext('2d'),r=Math.min(window.devicePixelRatio||1,2),drawn=false,last=null;
  function size(){var w=c.clientWidth,h=c.clientHeight;c.width=Math.round(w*r);c.height=Math.round(h*r);x.setTransform(r,0,0,r,0,0);
    x.lineWidth=2.6;x.lineCap='round';x.lineJoin='round';x.strokeStyle=${JSON.stringify(ink)};drawn=false;}
  function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
  function at(e){var t=e.touches?e.touches[0]:e,b=c.getBoundingClientRect();return{x:t.clientX-b.left,y:t.clientY-b.top};}
  function start(e){e.preventDefault();last=at(e);x.beginPath();x.arc(last.x,last.y,1.2,0,6.3);x.fillStyle=x.strokeStyle;x.fill();
    if(!drawn){drawn=true;post({type:'drawn'});}}
  function move(e){if(!last)return;e.preventDefault();var p=at(e);x.beginPath();x.moveTo(last.x,last.y);x.lineTo(p.x,p.y);x.stroke();last=p;}
  function end(){last=null;}
  c.addEventListener('touchstart',start,{passive:false});c.addEventListener('touchmove',move,{passive:false});
  c.addEventListener('touchend',end);c.addEventListener('touchcancel',end);
  window.semixClear=function(){x.clearRect(0,0,c.width,c.height);drawn=false;post({type:'cleared'});};
  window.semixPng=function(n){post({type:'png',n:n,data:drawn?c.toDataURL('image/png'):null});};
  size();post({type:'ready'});
})();
</script></body></html>`;

const SignaturePad = forwardRef(function SignaturePad({ onDrawn, disabled = false }, ref) {
  const web = useRef(null);
  const asks = useRef(new Map()); // n → resolve of a png() waiting for the page
  const counter = useRef(0);
  const [drawn, setDrawn] = useState(false);

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
    if (m.type === 'drawn') { setDrawn(true); onDrawn && onDrawn(true); }
    if (m.type === 'cleared') { setDrawn(false); onDrawn && onDrawn(false); }
    if (m.type === 'png') {
      const resolve = asks.current.get(m.n);
      if (resolve) { asks.current.delete(m.n); resolve(typeof m.data === 'string' ? m.data : null); }
    }
  };

  return (
    <View style={[styles.box, disabled && styles.off]} accessible accessibilityLabel={drawn ? 'Signature, signed' : 'Signature box: the customer signs with a finger'}>
      <WebView ref={web} originWhitelist={['*']} source={{ html: PAGE(colors.fgDefault) }} onMessage={onMessage}
        scrollEnabled={false} bounces={false} overScrollMode="never" style={styles.web} containerStyle={styles.webBox}
        javaScriptEnabled pointerEvents={disabled ? 'none' : 'auto'} />
      <Text style={styles.x} pointerEvents="none">×</Text>
      <View style={styles.base} pointerEvents="none" />
      <View style={styles.foot} pointerEvents="box-none">
        <Text style={styles.cap} pointerEvents="none">Sign with your finger</Text>
        <TouchableOpacity onPress={() => web.current?.injectJavaScript('window.semixClear();true;')} disabled={!drawn || disabled}
          accessibilityRole="button" accessibilityLabel="Clear the signature" hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}>
          <Text style={[styles.clear, (!drawn || disabled) && styles.clearOff]}>Clear</Text>
        </TouchableOpacity>
      </View>
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
});
