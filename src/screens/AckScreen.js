// «Customer signs for the bill» (design-mockups/app-invoice ack): after the issued bill reached
// the customer, they sign that they got it and choose about the replaced parts (returned / given
// up in writing, NYC §2-259 / none). Opens from the bill's Send screen once it is delivered (a
// company without «Bill before payment»: once it is issued).
// src/ack/model.js has the rules; the server keeps and checks them.
//   - One signature per bill. A bill that is not issued, not delivered or void cannot be signed
//     for: the screen says what comes first.
//   - Replaced parts by the bill's lines (§2-259): parts on it — returned or given up; none —
//     only «No parts were replaced». The customer signs under one choice: a different choice
//     after the signature is drawn wipes it, they sign again.
//   - The company's acknowledgment terms (latest version), if it has any — Read shows them; their
//     version goes with the signature. None — nothing is sent about them.
//   - No queue on the phone: without the connection «Try again online» and the signature stays
//     in the box for the next try (the delivery before it needs the server too).
//   - Signed: the line «Signed 12:50 · parts returned» and the customer's copy (Share the copy /
//     Handed a printed copy), as the approval's.
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { ackAPI, approveAPI, billAPI } from '../services/api';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { nowWall } from '../myDay/model';
import { newRequestId } from '../myDay/actions';
import { CONSENT_WORDS, billError, deliverBody } from '../bill/model';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';
import { ackBody, ackError, ackStage, ackTermsLine, billHasParts, billHeadOf, initialParts, partsChoicesOf, partsNote, partsOf, pickParts, signedLine, stageText } from '../ack/model';
import { downloadAckPdf } from '../ack/pdf';
import SignaturePad from '../approve/SignaturePad';

export default function AckScreen({ route, navigation }) {
  const { id, visit } = route.params || {};
  const insets = useSafeAreaInsets();
  const today = nowWall(Date.now()).date;

  // ---------- what the server says ----------
  const [state, setState] = useState({ status: 'loading' }); // loading | ready | problem
  const [bill, setBill] = useState(null);
  const [ack, setAck] = useState(null);
  const [terms, setTerms] = useState(null);
  const [rule, setRule] = useState('none');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const [billAnswer, ackAnswer, termsAnswer, listAnswer] = await Promise.all([
        billAPI.get(id), ackAPI.get(id), ackAPI.terms(id), approveAPI.list(id),
      ]);
      if (n !== seq.current) return;
      setBill(billAnswer.bill || null);
      setAck(ackAnswer.acknowledgment || null);
      setTerms(termsAnswer.terms || null);
      setRule(listAnswer.rule || 'none');
      setState({ status: 'ready' });
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading the acknowledgment:', error);
      setState({ status: 'problem', failed });
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---------- the form ----------
  const [name, setName] = useState((visit && visit.client_name) || '');
  const [parts, setParts] = useState(null);           // 'returned' | 'waived' | 'none' the customer tapped
  const picked = parts !== null ? parts : initialParts(bill); // a bill without parts: «none» at once
  const [choiceNote, setChoiceNote] = useState(false);  // the choice changed after the signature: shown over the box
  const [drawn, setDrawn] = useState(false);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState(null);             // { kind, text } of the last try
  const [termsOpen, setTermsOpen] = useState(false);
  const [scroll, setScroll] = useState(true);
  const pad = useRef(null);
  const requestId = useRef(null);                     // one id per signature: a retry after a lost answer is not a second one

  const startOver = () => {
    if (pad.current) pad.current.clear();
    setDrawn(false);
    requestId.current = null;
  };
  // a choice: another one after the signature is drawn wipes the signature
  const choose = (next) => {
    const { parts: chosenNow, clear } = pickParts(picked, next, drawn);
    setParts(chosenNow);
    setSaid(null);
    if (clear) {
      startOver();
      setChoiceNote(true);
    }
  };

  const sign = async () => {
    if (sending) return;
    const png = pad.current ? await pad.current.png() : null;
    if (!requestId.current) requestId.current = newRequestId();
    const { body, error } = ackBody({ name, png, parts: picked, terms, requestId: requestId.current, bill });
    if (error) { setSaid({ kind: 'refused', text: error }); return; }
    setSending(true);
    setSaid(null);
    try {
      const data = await ackAPI.sign(id, body);
      setAck(data.acknowledgment || null);
      requestId.current = null;
    } catch (e) {
      const failed = ackError(e);
      if (failed.kind === 'failed') logError('Error saving an acknowledgment:', e);
      setSaid(failed);
      if (failed.kind === 'gone') {
        Alert.alert('The visit changed', failed.text, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else if (failed.kind === 'resign') {
        startOver();
        load();
      } else if (failed.kind === 'signed' || failed.kind === 'stage') {
        load();
      }
    } finally {
      setSending(false);
    }
  };

  // ---------- the customer's copy ----------
  const [copyBusy, setCopyBusy] = useState(null);     // 'share' | 'handed'
  const [copyDone, setCopyDone] = useState(null);     // words of the last copy given
  const giveCopy = async (via, consent = false) => {
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
  const shareCopy = async () => {
    if (copyBusy || !ack) return;
    setCopyBusy('share');
    try {
      const file = await downloadAckPdf(id, bill);
      const result = await Share.share({ url: file.uri, title: 'Bill acknowledgment' });
      setCopyBusy(null);
      if (result && result.action === Share.sharedAction) {
        Alert.alert('Did the customer get it?', CONSENT_WORDS, [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Yes, they agreed', onPress: () => giveCopy('shared', true) },
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
  const top = <TopBar back="Bill" title="Customer signs for the bill" wide onBack={() => navigation.goBack()} />;

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
  const head = billHeadOf(bill, today);
  const termsLine = ackTermsLine(terms);
  const signing = !ack && stage === 'open';
  const hasParts = billHasParts(bill);
  const choices = partsChoicesOf(bill);
  const chosen = choices.find((p) => p.choice === picked) || null;
  const mustChoose = !chosen;
  const signedParts = ack ? partsOf(ack.replaced_parts) : null;

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      {top}
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} scrollEnabled={scroll} canCancelContentTouches={scroll} keyboardShouldPersistTaps="handled">
          {head && head.delivered ? (
            <View style={styles.pad}>
              <View style={styles.chip} accessible accessibilityLabel={head.delivered}>
                <Icon name="check" size={16} color={colors.successFg} />
                <Text style={styles.chipText}>{head.delivered}</Text>
              </View>
            </View>
          ) : null}
          {said ? <Box kind="warn" icon="warn" text={said.text} style={styles.boxGap} /> : null}

          {ack ? (
            <View style={styles.pad}>
              <Text style={styles.label}>THE CUSTOMER SIGNED</Text>
              <View style={styles.card} accessible accessibilityLabel={`${signedLine(ack, today)}, by ${ack.signer_name}`}>
                <View style={styles.rowTop}>
                  <Text style={styles.cardTitle}>{head ? head.label : 'Bill'}</Text>
                  {head ? <Text style={styles.big}>{head.total}</Text> : null}
                </View>
                <View style={[styles.tag, styles.tagGap]}><Icon name="checkc" size={16} color={colors.successFg} /><Text style={styles.tagText}>{signedLine(ack, today)}</Text></View>
                <Text style={styles.sub}>{ack.signer_name}</Text>
              </View>
              {signedParts ? (
                <View style={[styles.card, styles.termsRow]}>
                  <Icon name="doc" size={22} color={colors.fgSecondary} />
                  <View style={styles.flex}>
                    <Text style={styles.termsTitle}>{signedParts.title}</Text>
                    {signedParts.words ? <Text style={styles.sub}>“{signedParts.words}”</Text> : null}
                  </View>
                </View>
              ) : null}
              <Text style={[styles.label, styles.labelGap]}>THE CUSTOMER’S COPY</Text>
              <Text style={styles.note}>The customer keeps a copy of what they signed. Showing it on the phone does not count.</Text>
              {copyDone ? <Box kind="done" icon="checkc" text={copyDone} style={styles.gapTop} /> : null}
              <View style={styles.copyButtons}>
                <PlainButton text="Share the copy" icon="share" onPress={shareCopy} waiting={copyBusy === 'share'} off={!!copyBusy} />
                <PlainButton text="Handed a printed copy" icon="doc" onPress={() => giveCopy('handed')} waiting={copyBusy === 'handed'} off={!!copyBusy} />
              </View>
            </View>
          ) : null}

          {!ack && stage !== 'open' ? (
            <View style={styles.pad}>
              <Box kind="info" icon="info" text={stageText(stage, bill)} />
            </View>
          ) : null}

          {signing ? (
            <>
              <View style={styles.pad}>
                <View style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.cardTitle}>Bill total</Text>
                    <Text style={styles.big}>{head ? head.total : ''}</Text>
                  </View>
                  <Text style={styles.sub}>The customer got the bill and signs that they did</Text>
                </View>
                {termsLine ? (
                  <View style={[styles.card, styles.termsRow]}>
                    <Icon name="doc" size={22} color={colors.fgSecondary} />
                    <View style={styles.flex}>
                      <Text style={styles.termsTitle}>{termsLine.title}</Text>
                      <Text style={styles.sub}>{termsLine.sub}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setTermsOpen(true)} accessibilityRole="button" accessibilityLabel="Read the terms" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={styles.linkText}>Read</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.pad} accessibilityRole="radiogroup" accessibilityLabel="Replaced parts">
                <Text style={styles.label} accessibilityRole="header">REPLACED PARTS</Text>
                <Text style={styles.right}>{partsNote(rule, hasParts)}</Text>
                {choices.map((p) => {
                  const on = picked === p.choice;
                  return (
                    <TouchableOpacity key={p.choice} style={[styles.choice, on && styles.choiceOn]} onPress={() => choose(p.choice)} disabled={sending}
                      accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={p.words ? `${p.title}. ${p.words}` : p.title}>
                      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      <View style={styles.flex}>
                        <Text style={styles.choiceText}>{p.title}</Text>
                        {p.words ? <Text style={styles.choiceSub}>“{p.words}”</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {chosen ? null : (
                  <View style={styles.need}>
                    <Icon name="info" size={16} color={colors.warningFg} />
                    <Text style={styles.needText}>Choose one to sign</Text>
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>CUSTOMER NAME</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name of who signs" placeholderTextColor={colors.fgMutedField}
                  autoCapitalize="words" autoCorrect={false} returnKeyType="done" maxLength={200} accessibilityLabel="Customer name" />
              </View>
              {choiceNote ? <Box kind="warn" icon="warn" text="The choice changed: the customer signs again." style={styles.noteOverPad} /> : null}
              <View onTouchStart={() => setScroll(false)} onTouchEnd={() => setScroll(true)} onTouchCancel={() => setScroll(true)}>
                <SignaturePad ref={pad} onDrawn={(d) => { setDrawn(d); if (d) setChoiceNote(false); else requestId.current = null; }} disabled={sending || mustChoose} />
              </View>
            </>
          ) : null}
        </ScrollView>

        <Foot bottom={insets.bottom}>
          {signing ? (
            <MainButton text="Save the signature" icon="check" onPress={sign} waiting={sending} off={!drawn || !name.trim() || mustChoose} />
          ) : (
            <PlainButton text="Back to the bill" icon="back" onPress={() => navigation.goBack()} />
          )}
        </Foot>
      </KeyboardAvoidingView>

      <Modal visible={termsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTermsOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={billStyles.screen}>
          <TopBar back="Sign" title={termsLine ? termsLine.title : 'Terms'} onBack={() => setTermsOpen(false)} />
          <ScrollView contentContainerStyle={styles.termsBody}>
            <Text style={styles.sub}>{termsLine ? termsLine.sub : ''}</Text>
            <Text style={styles.termsText}>{terms ? terms.body : ''}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  problem: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary, textAlign: 'center' },
  gapTop: { marginTop: 10 },
  body: { paddingTop: 12, paddingBottom: 24 },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
  boxGap: { marginHorizontal: 16, marginBottom: 12 },
  noteOverPad: { marginHorizontal: 16, marginBottom: 8 },
  flex: { flex: 1 },
  // the delivered chip (design .iv-chip): success-soft with a success border
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.successBorder, backgroundColor: colors.successBg },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.successFg },
  label: { marginBottom: 8, fontSize: 13, fontWeight: '800', letterSpacing: 1.1, color: colors.fgSecondary },
  labelGap: { marginTop: 16 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitle: { flexShrink: 1, fontSize: 20, fontWeight: '800', color: colors.fgDefault },
  big: { fontSize: 22, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  sub: { marginTop: 4, fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.brandPressed },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingVertical: 10 },
  termsTitle: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.successBg },
  tagGap: { marginTop: 8 },
  tagText: { fontSize: 13, fontWeight: '700', color: colors.successFg },
  note: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  copyButtons: { gap: 10, marginTop: 12 },
  right: { marginBottom: 12, fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  // the choices (design .iv-opt), as on ApproveScreen
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 56, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  choiceOn: { borderWidth: 2, paddingHorizontal: 13.5, paddingVertical: 11.5, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  radio: { width: 22, height: 22, marginTop: 1, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  choiceText: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.fgDefault },
  choiceSub: { marginTop: 2, fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  need: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  needText: { fontSize: 14, fontWeight: '600', color: colors.warningFg },
  field: { paddingHorizontal: 16, paddingBottom: 12 },
  input: { minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard, fontSize: 17, color: colors.fgDefault },
  termsBody: { padding: 16, paddingBottom: 40 },
  termsText: { marginTop: 12, fontSize: 15, lineHeight: 22, color: colors.fgDefault },
});
