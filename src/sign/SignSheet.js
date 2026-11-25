// The sign screen (design tech-app USABILITY_2026-11-24 §3, shots/usab-u3-sign.png; rules in
// sign/model.js): opened by «Sign» on Approve and on «Customer signs for the bill». On top who
// signs, what and how much; the line «By signing, you agree to …» naming every set of terms that
// goes with this signature and «Read the terms» (sign/model.js consentOf); under it the box on the rest of the
// screen (Clear in its corner), at the bottom «Done · save the signature». Nothing scrolls.
// Under what and how much — the customer's choice on the form in their words (the written
// estimate, the replaced parts): the signature stands under them (sign/model.js choiceWords).
// «Done» lights up after a real stroke (SignaturePad, MIN_INK) and hands the PNG to the form
// (onDone), which saves it as before; the form closes this screen when it has an answer.
// Back — the signature is not kept: the customer signs again from «Sign».
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { Foot, MainButton, TopBar, billStyles } from '../bill/parts';
import SignaturePad from '../approve/SignaturePad';

export default function SignSheet({ visible, back, head, consent = null, caption, sending = false, onDone, onClose }) {
  const insets = useSafeAreaInsets();               // SafeAreaView gives a Modal no insets: the screen's own
  const pad = useRef(null);
  const [drawn, setDrawn] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  // a new opening is a new signature
  useEffect(() => { if (visible) { setDrawn(false); setTermsOpen(false); } }, [visible]);

  const done = async () => {
    if (sending || !drawn) return;
    const png = pad.current ? await pad.current.png() : null;
    if (!png) { setDrawn(false); return; }
    onDone(png);
  };
  const close = () => { if (!sending) onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={[billStyles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <View style={styles.inner}>
          <TopBar back={back} title="" onBack={close} />
          <View style={styles.page}>
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{head.title}</Text>
              {head.sub ? <Text style={styles.sub} numberOfLines={2}>{head.sub}</Text> : null}
              {head.choice ? <Text style={styles.choice}>{head.choice}</Text> : null}
              {consent ? (
                <View style={styles.consent}>
                  <Text style={styles.consentLine}>{consent.line}</Text>
                  <TouchableOpacity onPress={() => setTermsOpen(true)} accessibilityRole="button" accessibilityLabel={consent.link}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.linkWrap}>
                    <Text style={styles.link}>{consent.link}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            <SignaturePad ref={pad} variant="full" caption={caption} disabled={sending} style={styles.box} onDrawn={setDrawn} />
          </View>
          <Foot bottom={0}>
            <MainButton text="Done · save the signature" icon="check" onPress={done} waiting={sending} off={!drawn} />
          </Foot>

          {/* the terms over the box: the box keeps its ink under them */}
          {termsOpen && consent ? (
            <View style={styles.terms} accessibilityViewIsModal>
              <TopBar back="Sign" title={consent.title} onBack={() => setTermsOpen(false)} />
              <ScrollView contentContainerStyle={styles.termsBody}>
                {consent.docs.map((doc, d) => (
                  <View key={d} style={d ? styles.docGap : null}>
                    {consent.docs.length > 1 ? <Text style={styles.docTitle} accessibilityRole="header">{doc.title}</Text> : null}
                    {doc.sub ? <Text style={styles.termsSub}>{doc.sub}</Text> : null}
                    {doc.sections.map((s, i) => (
                      <View key={i} style={styles.section}>
                        {s.title ? <Text style={styles.sectionTitle}>{s.title}</Text> : null}
                        {s.text ? <Text style={styles.sectionText}>{s.text}</Text> : null}
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
              <Foot bottom={0}>
                <MainButton text="Done" icon="check" onPress={() => setTermsOpen(false)} />
              </Foot>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  head: { paddingTop: 4, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sub: { marginTop: 4, fontSize: 17, lineHeight: 23, color: colors.fgSecondary },
  choice: { marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  consent: { marginTop: 10 },
  consentLine: { fontSize: 15, lineHeight: 21, color: colors.fgDefault },
  linkWrap: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  link: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  box: { flex: 1 },
  terms: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bgPage },
  termsBody: { padding: 16, paddingBottom: 32 },
  termsSub: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  docGap: { marginTop: 28 },
  docTitle: { marginBottom: 2, fontSize: 18, fontWeight: '800', color: colors.fgDefault },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.fgDefault },
  sectionText: { marginTop: 4, fontSize: 15, lineHeight: 22, color: colors.fgDefault },
});
