// «Get signature» of the visit's three buttons (T3, design-mockups/tech-bill-plain d2, d2-ny, d3):
// the customer's screen «Your bill» — the bill on top, the words they agree to, the box they sign
// in, «Done · signed». The visit makes the bill final before it opens this screen (bill/three.js:
// the first of the three issues it), so the customer signs the issued bill and its PDF.
// src/ack/model.js has the rules; the server keeps and checks them.
//   - The copy is required (the server's bill_before_payment — NY: Give required) and not given
//     yet: «THE CUSTOMER’S COPY» under the box (bill/CopyParts.js) — Email the PDF, Share the PDF,
//     Printed copy handed; one «Done · signed» gives the copy, then saves the signature, in that
//     order (the server takes the signature only after the copy: 409 not_delivered). The copy did
//     not go — the signature waits, the box keeps the ink, the words say why. Not required: no
//     choice (d2), «Send the bill» on the visit gives it when the customer wants one.
//   - Replaced parts by the bill's lines (NYC §2-259): parts on it — «What about the old parts?»
//     (returned / given up in writing) between the bill and the box; none — «No parts were
//     replaced» goes by itself.
//   - Over the box (README «Текст согласия»): «By signing, you confirm the work on this bill is done
//     and you agree to its Terms and conditions.» — the link shows the terms the bill printed and the
//     company's acknowledgment terms (sign/model.js consentOf); no terms — the first half alone.
//   - The signature is kept on the phone, then sent (ack/queue.js): without the connection the
//     visit's button says «Waiting for signal — it sends by itself». Refused (the bill or the terms
//     changed) — the words say why, the customer signs again.
//   - Done: back to the visit, where Get signature (and Send the bill, when the copy went) is green.
//   - Signed already: the signature, the parts and the customer's copy of it (Share / Handed).
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { ackAPI, billAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { nowWall } from '../myDay/model';
import { newRequestId } from '../myDay/actions';
import { CONSENT_WORDS, billError, deliverBody } from '../bill/model';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';
import { billCardOf, copyMissing, signWordsOf } from '../bill/copy';
import { BillCard, CopyChoice, useCopy } from '../bill/CopyParts';
import { ackBody, ackStage, ackTermsLine, billHasParts, initialParts, partsChoicesOf, partsOf, pickParts, signedLine, stageText } from '../ack/model';
import { downloadAckPdf } from '../ack/pdf';
import SignaturePad from '../approve/SignaturePad';
import { companyTerms, consentOf, signerLine } from '../sign/model';
import { acks } from '../ack/store';

export default function AckScreen({ route, navigation }) {
  // back: the word of the back button — the screen it goes back to (Visit, or Bill)
  const { id, visit, back = 'Visit' } = route.params || {};
  const insets = useSafeAreaInsets();
  const today = nowWall(Date.now()).date;
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // ---------- what the server says ----------
  const [state, setState] = useState({ status: 'loading' }); // loading | ready | problem
  const [bill, setBill] = useState(null);
  const [ack, setAck] = useState(null);
  const [terms, setTerms] = useState(null);
  const [pending, setPending] = useState(null);       // the signature kept on this phone (ack/queue.js), or null
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    // the phone's signatures go first: back online, this visit's goes before the screen reads the server
    if (userId !== null) await acks.flushAll(userId).catch(() => {});
    const kept = userId === null ? null : await acks.pendingOf(id, userId).catch(() => null);
    if (n !== seq.current) return;
    setPending(kept);
    try {
      const [billAnswer, ackAnswer, termsAnswer] = await Promise.all([billAPI.get(id), ackAPI.get(id), ackAPI.terms(id)]);
      if (n !== seq.current) return;
      setBill(billAnswer.bill || null);
      setAck(ackAnswer.acknowledgment || null);
      setTerms(termsAnswer.terms || null);
      setState({ status: 'ready' });
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading the acknowledgment:', error);
      setState({ status: 'problem', failed });
    }
  }, [id, userId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---------- the form ----------
  const [name, setName] = useState((visit && visit.client_name) || '');
  const askName = !((visit && visit.client_name) || '').trim();
  const [parts, setParts] = useState(null);           // 'returned' | 'waived' the customer tapped
  const picked = parts !== null ? parts : initialParts(bill); // a bill without parts: «none» at once
  const [sending, setSending] = useState(null);       // 'copy' | 'sign' while «Done» works
  const [said, setSaid] = useState(null);             // words of the last try
  const [termsOpen, setTermsOpen] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [scroll, setScroll] = useState(true);         // the page stands still while the finger signs
  const pad = useRef(null);
  const copy = useCopy({ id, bill, required: true });

  const choose = (next) => {
    const { parts: chosen, clear } = pickParts(picked, next, drawn);
    setParts(chosen);
    setSaid(null);
    // a different choice under a drawn signature: the customer signs again under the new one
    if (clear && pad.current) pad.current.clear();
  };

  // «Done · signed»: the copy (when required and not given), then the signature
  const done = async () => {
    if (sending) return;
    if (userId === null) { setSaid('You are signed out. Sign in again, then the customer signs.'); return; }
    const png = pad.current ? await pad.current.png() : null;
    if (!png) { setDrawn(false); setSaid('The customer signs in the box first.'); return; }
    // the form first: nothing goes while a word is missing
    const first = ackBody({ name, png, parts: picked, terms, requestId: 'check', bill });
    if (first.error) { setSaid(first.error); return; }
    setSaid(null);
    let current = bill;
    if (copyMissing(bill)) {
      setSending('copy');
      const gave = await copy.give();
      if (!gave.ok) { setSending(null); if (gave.text) setSaid(gave.text); return; }
      current = gave.bill || await billAPI.get(id).then((d) => d.bill).catch(() => bill);
      setBill(current);
    }
    setSending('sign');
    // the moment the customer signed (after the copy reached them: the server checks the order),
    // one request id per signature: the queue sends it again with the same one
    const { body } = ackBody({ name, png, parts: picked, terms, requestId: newRequestId(), bill: current });
    const r = await acks.sign({ visitId: id, userId, body, at: Date.now() });
    setSending(null);
    if (r.result === 'busy') return;
    // signed (or signed already, another try), or kept on the phone (it goes by itself): the visit shows it
    if (r.result === 'sent' || r.result === 'waiting' || r.result === 'signed') { navigation.goBack(); return; }
    setPending(await acks.pendingOf(id, userId));
    setSaid(`Signature not saved: ${String(r.failed && r.failed.text ? r.failed.text : 'try again').replace(/[.\s]*$/, '')}.`);
    if (r.result === 'gone') {
      Alert.alert('The visit changed', r.failed.text, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } else {
      load();
    }
  };

  // ---------- the customer's copy of the signature ----------
  const [copyBusy, setCopyBusy] = useState(null);     // 'share' | 'handed'
  const [copyDone, setCopyDone] = useState(null);     // words of the last copy given
  const giveAckCopy = async (via, consent = false) => {
    const { body, error } = deliverBody(via, '', consent);
    if (error) { Alert.alert('The copy is not marked', error); return; }
    setCopyBusy(via === 'shared' ? 'share' : 'handed');
    try {
      await ackAPI.copies(id, body);
      setCopyDone(via === 'shared' ? 'The PDF copy went to the customer.' : 'The customer has a printed copy.');
    } catch (e) {
      const failed = billError(e);
      if (failed.kind === 'failed') logError('Error marking an acknowledgment copy:', e);
      Alert.alert('The copy is not marked', failed.kind === 'offline' ? 'No connection. Try again online.' : failed.text);
    } finally {
      setCopyBusy(null);
    }
  };
  const shareAckCopy = async () => {
    if (copyBusy || !ack) return;
    setCopyBusy('share');
    try {
      const file = await downloadAckPdf(id, bill);
      const result = await Share.share({ url: file.uri, title: 'Bill acknowledgment' });
      setCopyBusy(null);
      if (result && result.action === Share.sharedAction) {
        Alert.alert('Did the customer get it?', CONSENT_WORDS, [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Yes, they agreed', onPress: () => giveAckCopy('shared', true) },
        ]);
      }
    } catch (e) {
      setCopyBusy(null);
      const failed = billError(e);
      if (failed.kind === 'failed') logError('Error downloading an acknowledgment copy:', e);
      Alert.alert('The PDF did not open', failed.kind === 'offline' ? 'No connection. The copy comes from the office’s server: try again online.' : failed.text);
    }
  };

  // ---------- the screen ----------
  const top = <TopBar back={back} title="Your bill" onBack={() => navigation.goBack()} />;

  if (state.status !== 'ready') {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        {top}
        <View style={styles.center}>
          {state.status === 'loading' ? <ActivityIndicator color={colors.brandPressed} /> : (
            <>
              <Text style={styles.problem}>{state.failed.kind === 'offline' ? 'No connection. The bill comes from the office’s server: try again online.' : state.failed.text}</Text>
              <PlainButton text="Try again" icon="retry" onPress={load} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const stage = ackStage(bill);
  const card = billCardOf(bill, today);
  const waitingOnPhone = !ack && !!pending && !pending.failed;
  // the customer can sign: an issued bill, given — or not given yet, the copy goes first with «Done»
  const signing = !ack && !waitingOnPhone && (stage === 'open' || stage === 'undelivered');
  const withCopy = signing && copyMissing(bill);
  const consent = consentOf({ bill, company: companyTerms(terms, (ackTermsLine(terms) || {}).title) });
  const words = signWordsOf(!!consent);
  const choices = partsChoicesOf(bill);
  const askParts = billHasParts(bill);
  const mustChoose = !choices.some((p) => p.choice === picked);
  const signed = ack || (waitingOnPhone ? { signed_at: pending.at, replaced_parts: pending.body && pending.body.replaced_parts, signer_name: pending.body && pending.body.signer_name } : null);
  const signedParts = signed ? partsOf(signed.replaced_parts) : null;

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {top}
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" scrollEnabled={scroll}>
          <BillCard card={card} compact={withCopy} style={styles.gap} />

          {signed ? (
            <>
              <View style={[styles.signedRow, waitingOnPhone && styles.signedWait]} accessible accessibilityLabel={`${signedLine(signed, today)}, by ${signed.signer_name || ''}`}>
                <Icon name="checkc" size={24} color={waitingOnPhone ? colors.warningFg : colors.successFg} />
                <View style={styles.flex}>
                  <Text style={[styles.signedTitle, waitingOnPhone && styles.waitTitle]}>{signedLine(signed, today)}</Text>
                  <Text style={styles.signedSub}>{waitingOnPhone ? 'Waiting for signal — it sends by itself' : signed.signer_name}</Text>
                </View>
              </View>
              {signedParts && signedParts.words ? <Text style={styles.partsWords}>“{signedParts.words}”</Text> : null}
              {ack ? (
                <View style={styles.gapTop}>
                  <Text style={styles.label}>THE CUSTOMER’S COPY OF THE SIGNATURE</Text>
                  {copyDone ? <Box kind="done" icon="checkc" text={copyDone} style={styles.gap} /> : null}
                  <View style={styles.copyButtons}>
                    <PlainButton text="Share the copy" icon="share" onPress={shareAckCopy} waiting={copyBusy === 'share'} off={!!copyBusy} />
                    <PlainButton text="Handed a printed copy" icon="doc" onPress={() => giveAckCopy('handed')} waiting={copyBusy === 'handed'} off={!!copyBusy} />
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {!signed && !signing ? <Box kind="info" icon="info" text={stageText(stage, bill)} /> : null}

          {signing ? (
            <>
              <Text style={styles.words}>
                {words.before}
                {words.link ? <Text style={styles.link} onPress={() => setTermsOpen(true)} accessibilityRole="link">{words.link}</Text> : null}
                {words.after}
              </Text>

              {askParts ? (
                <View style={styles.gap} accessibilityRole="radiogroup" accessibilityLabel="What about the old parts?">
                  <Text style={styles.label} accessibilityRole="header">WHAT ABOUT THE OLD PARTS?</Text>
                  {choices.map((p) => {
                    const on = picked === p.choice;
                    return (
                      <TouchableOpacity key={p.choice} style={[styles.choice, on && styles.choiceOn]} onPress={() => choose(p.choice)} disabled={!!sending}
                        accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={p.words ? `${p.title}. ${p.words}` : p.title}>
                        <View style={styles.flex}>
                          <Text style={styles.choiceText}>{p.title}</Text>
                          {p.words ? <Text style={styles.choiceSub}>“{p.words}”</Text> : null}
                        </View>
                        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {askName ? (
                <View style={styles.gap}>
                  <Text style={styles.label}>CUSTOMER NAME</Text>
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name of who signs" placeholderTextColor={colors.fgMutedField}
                    autoCapitalize="words" autoCorrect={false} returnKeyType="done" maxLength={200} accessibilityLabel="Customer name" />
                </View>
              ) : null}

              <View onTouchStart={() => setScroll(false)} onTouchEnd={() => setScroll(true)} onTouchCancel={() => setScroll(true)}>
                <SignaturePad ref={pad} variant="full" caption={signerLine(name, today)} disabled={!!sending}
                  style={withCopy ? styles.padSmall : styles.pad} onDrawn={(d) => { setDrawn(d); if (d) setSaid(null); }} />
              </View>

              {withCopy ? <CopyChoice copy={copy} label="THE CUSTOMER’S COPY" off={!!sending} onChange={() => setSaid(null)} /> : null}
            </>
          ) : null}
        </ScrollView>

        <Foot bottom={insets.bottom} failure={said}>
          {signing ? (
            <MainButton text={sending === 'copy' ? 'Sending the copy…' : sending === 'sign' ? 'Saving…' : 'Done · signed'} icon="check" onPress={done}
              waiting={!!sending} off={!drawn || mustChoose || !name.trim()} />
          ) : (
            <PlainButton text={back === 'Visit' ? 'Back to the visit' : 'Back to the bill'} icon="back" onPress={() => navigation.goBack()} />
          )}
        </Foot>
      </KeyboardAvoidingView>

      <Modal visible={termsOpen && !!consent} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTermsOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={billStyles.screen}>
          <TopBar back="Your bill" title={consent ? consent.title : 'Terms'} onBack={() => setTermsOpen(false)} />
          <ScrollView contentContainerStyle={styles.termsBody}>
            {(consent ? consent.docs : []).map((doc, d) => (
              <View key={d} style={d ? styles.docGap : null}>
                {consent.docs.length > 1 ? <Text style={styles.docTitle} accessibilityRole="header">{doc.title}</Text> : null}
                {doc.sub ? <Text style={styles.signedSub}>{doc.sub}</Text> : null}
                {doc.sections.map((s, i) => (
                  <View key={i} style={styles.section}>
                    {s.title ? <Text style={styles.sectionTitle}>{s.title}</Text> : null}
                    {s.text ? <Text style={styles.sectionText}>{s.text}</Text> : null}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  problem: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center' },
  body: { padding: 16, paddingBottom: 24 },
  gap: { marginBottom: 14 },
  gapTop: { marginTop: 16 },
  flex: { flex: 1 },
  words: { marginBottom: 12, fontSize: 17, lineHeight: 24, color: colors.fgDefault },
  link: { fontWeight: '700', color: colors.brandPressed, textDecorationLine: 'underline' },
  label: { marginBottom: 8, fontSize: 13, fontWeight: '800', letterSpacing: 1.1, color: colors.fgSecondary },
  pad: { height: 340, marginBottom: 14 },
  padSmall: { height: 240, marginBottom: 18 },
  signedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.successBorder, backgroundColor: colors.successBg },
  signedWait: { borderColor: colors.warningBorder },
  signedTitle: { fontSize: 17, fontWeight: '800', color: colors.successFg },
  waitTitle: { color: colors.warningFg },
  signedSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  partsWords: { marginTop: 8, fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  copyButtons: { gap: 10 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  choiceOn: { borderWidth: 2, paddingHorizontal: 13.5, paddingVertical: 9.5, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  choiceText: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  choiceSub: { marginTop: 2, fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard, fontSize: 17, color: colors.fgDefault },
  termsBody: { padding: 16, paddingBottom: 40 },
  docGap: { marginTop: 28 },
  docTitle: { marginBottom: 2, fontSize: 18, fontWeight: '800', color: colors.fgDefault },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.fgDefault },
  sectionText: { marginTop: 4, fontSize: 15, lineHeight: 22, color: colors.fgDefault },
});
