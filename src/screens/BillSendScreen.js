// Giving an issued bill to the customer (design-mockups/app-invoice send). In NYC the payment
// waits until the customer has the Final Bill, so the technician marks how it reached them.
// Email and text from the system come later (the company's email, 10DLC): their tabs say
// Soon and the template shows what the customer will get. What works now:
//   - the PDF: the server's file, downloaded into the phone's cache; View shows it, Share the
//     PDF opens iOS sharing (AirDrop, Mail from the company account, Print, Files);
//   - Mark as delivered…: printed and handed, or the PDF sent — the second only with the
//     customer's consent to electronic documents (a box to tick, the server keeps its words);
//     once per bill (POST …/bill/delivered). A share that went out offers the mark at once.
// Showing the bill on the phone does not count: the customer must keep a copy.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { billAPI } from '../services/api';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { nowWall, clock, momentWall } from '../myDay/model';
import { Sheet } from '../myDay/visitBar';
import { CONSENT_WORDS, DELIVERY_CHOICES, billError, deliverBody, deliveryOf, emailOf, pdfName } from '../bill/model';
import { downloadBillPdf } from '../bill/pdf';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

export default function BillSendScreen({ route, navigation }) {
  const { id } = route.params || {};
  const insets = useSafeAreaInsets();
  const [bill, setBill] = useState(null);
  const [problem, setProblem] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const data = await billAPI.get(id);
      if (n === seq.current) { setBill(data.bill); setProblem(null); }
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading a bill to send:', error);
      setProblem(failed);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ---------- the PDF ----------
  const [pdf, setPdf] = useState(null);                  // { uri } once downloaded
  const [pdfBusy, setPdfBusy] = useState(null);          // 'view' | 'share'
  const getPdf = useCallback(async () => {
    if (pdf) return pdf;
    const file = await downloadBillPdf(id, bill);
    setPdf(file);
    return file;
  }, [pdf, id, bill]);
  const pdfFailed = (error) => {
    const failed = billError(error);
    if (failed.kind === 'failed') logError('Error downloading a bill PDF:', error);
    Alert.alert('The PDF did not open', failed.kind === 'offline' ? 'No connection. The PDF comes from the office’s server: try again online.' : failed.text);
  };
  const viewPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy('view');
    try {
      const file = await getPdf();
      navigation.navigate('BillPdf', { uri: file.uri, label: bill.label });
    } catch (error) {
      pdfFailed(error);
    } finally {
      setPdfBusy(null);
    }
  };
  const sharePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy('share');
    try {
      const file = await getPdf();
      const result = await Share.share({ url: file.uri, title: `Bill ${bill.label}` });
      // shared: the mark comes next, with «Sent the PDF» already chosen
      if (result && result.action === Share.sharedAction && !bill.delivered_at) openMark('shared');
    } catch (error) {
      pdfFailed(error);
    } finally {
      setPdfBusy(null);
    }
  };

  // ---------- Mark as delivered ----------
  const [markOpen, setMarkOpen] = useState(false);
  const [via, setVia] = useState(null);
  const [to, setTo] = useState('');
  const [consent, setConsent] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markFailed, setMarkFailed] = useState(null);
  // the sheet's words scroll inside it: with the keyboard up it stays under the status bar
  const { height } = useWindowDimensions();
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const sheetMax = Math.max(240, height - keyboard - insets.top - 48);
  const openMark = (preset = null) => {
    setVia(preset);
    setConsent(false);
    setMarkFailed(null);
    setMarkOpen(true);
  };
  const mark = async () => {
    if (marking) return;
    const { body, error } = deliverBody(via, to, consent);
    if (error) { setMarkFailed(error); return; }
    setMarking(true);
    setMarkFailed(null);
    try {
      const data = await billAPI.delivered(id, body);
      if (data && data.bill) setBill(data.bill);
      setMarkOpen(false);
    } catch (e) {
      const failed = billError(e);
      if (failed.kind === 'failed') logError('Error marking a bill delivered:', e);
      setMarkFailed(failed.kind === 'offline' ? 'No connection. The mark goes to the office’s server: try again online.' : failed.text);
      if (failed.kind === 'refused') load();
    } finally {
      setMarking(false);
    }
  };

  const now = nowWall(Date.now());
  const label = bill ? bill.label || `#${bill.bill_number}` : '';
  const email = useMemo(() => (bill ? emailOf(bill) : null), [bill]);
  const delivered = bill ? deliveryOf(bill, now) : null;
  const issuedAt = bill ? momentWall(bill.issued_at) : null;

  if (!bill) {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        <TopBar back="Bill" title="Send" onBack={() => navigation.goBack()} />
        <View style={billStyles.noData}>
          {problem ? (
            <>
              <Text style={billStyles.noDataTitle}>{problem.kind === 'offline' ? 'No connection' : 'Could not load the bill'}</Text>
              <Text style={billStyles.noDataText}>{problem.kind === 'offline' ? 'The bill is kept by the office’s server. Try again when you are back online.' : problem.text}</Text>
              <View style={styles.stretch}><PlainButton text="Try again" icon="refresh" onPress={load} /></View>
            </>
          ) : <ActivityIndicator color={colors.brand} />}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Bill" title={`Send ${label}`} onBack={() => navigation.goBack()} />
      <ScrollView style={billStyles.page} contentContainerStyle={styles.body}>
        <View style={styles.head}>
          {delivered ? (
            <Box kind="done" icon="checkc" title={delivered.title} text={`${delivered.line}. The bill is with the customer.`} />
          ) : (
            <Box kind="done" icon="checkc" title={`Bill ${label} is issued`}
              text={`${issuedAt ? `Frozen at ${clock(issuedAt.minutes)}. ` : ''}The PDF is ready. Give it to the customer before taking the payment.`} />
          )}
          <TouchableOpacity style={styles.pdfRow} onPress={viewPdf} disabled={!!pdfBusy} accessibilityRole="button" accessibilityLabel={`View ${pdfName(bill)}`}>
            <Icon name="doc" size={24} color={colors.brandPressed} />
            <View style={styles.flex}>
              <Text style={styles.pdfName}>{pdfName(bill)}</Text>
              <Text style={styles.pdfSub}>The customer’s copy, frozen at the issue</Text>
            </View>
            {pdfBusy === 'view' ? <ActivityIndicator color={colors.brandPressed} /> : <Text style={styles.link}>View</Text>}
          </TouchableOpacity>
          <View style={styles.tabs}>
            {[['mail', 'Email'], ['sms', 'Text']].map(([icon, word], i) => (
              <View key={word} style={[styles.tab, i === 0 && styles.tabOn]} accessible accessibilityLabel={`${word}, soon`}>
                <Icon name={icon} size={18} color={i === 0 ? colors.brandPressed : colors.fgSecondary} />
                <Text style={[styles.tabText, i === 0 && styles.tabTextOn]}>{word}</Text>
                <Text style={styles.soon}>Soon</Text>
              </View>
            ))}
          </View>
          <Box kind="info" icon="info" text="Sending starts once the company email and text messages are set up. This is how the email will look." />
        </View>
        <View style={billStyles.section}>
          {[['To', email.to], ['Subject', email.subject], ['Message', email.message]].map(([k, v], i) => (
            <View key={k} style={[styles.field, i > 0 && styles.fieldNext]}>
              <Text style={styles.fieldLabel}>{k.toUpperCase()}</Text>
              <Text style={styles.fieldText}>{v}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Foot bottom={insets.bottom} note={delivered ? null : 'Shown on your phone only does not count: the customer must keep a copy.'}>
        {delivered ? null : <MainButton text="Mark as delivered…" icon="check" onPress={() => openMark(null)} />}
        <PlainButton text="Share the PDF" icon="share" waiting={pdfBusy === 'share'} onPress={sharePdf} />
      </Foot>

      <Sheet visible={markOpen} onClose={() => setMarkOpen(false)} bottom={keyboard ? 8 : insets.bottom} keyboard>
        <ScrollView style={{ maxHeight: sheetMax }} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.sheetTitle} accessibilityRole="header">{`How did the customer get ${label}?`}</Text>
        <Text style={styles.sheetSub}>Saved in the bill history with your name and time.</Text>
        <View style={styles.choices} accessibilityRole="radiogroup">
          {DELIVERY_CHOICES.map((c) => {
            const on = via === c.via;
            return (
              <TouchableOpacity key={c.via} style={[styles.choice, on && styles.choiceOn]} onPress={() => { setVia(c.via); setMarkFailed(null); }}
                accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.flex}>
                  <Text style={styles.choiceTitle}>{c.title}</Text>
                  <Text style={styles.choiceHint}>{c.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.fieldLabel}>SENT TO (OPTIONAL)</Text>
        <TextInput style={styles.input} value={to} onChangeText={setTo} maxLength={255} autoCapitalize="none" autoCorrect={false}
          placeholder={bill.customer && bill.customer.email ? bill.customer.email : 'Email, phone or “handed at the door”'} placeholderTextColor={colors.fgMutedField}
          accessibilityLabel="Sent to, optional" />
        {via === 'shared' ? (
          <TouchableOpacity style={styles.consent} onPress={() => { setConsent((c) => !c); setMarkFailed(null); }} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
            <View style={[styles.box, consent && styles.boxOn]}>{consent ? <Icon name="check" size={18} color={colors.fgOnFill} /> : null}</View>
            <Text style={styles.consentText}>{CONSENT_WORDS}</Text>
          </TouchableOpacity>
        ) : null}
        {markFailed ? <Text style={styles.failed} accessibilityRole="alert">{markFailed}</Text> : null}
        <MainButton text="Mark delivered" icon="check" waiting={marking} off={!via || (via === 'shared' && !consent)} onPress={mark} />
        <TouchableOpacity style={styles.plainLink} onPress={() => setMarkOpen(false)} accessibilityRole="button">
          <Text style={styles.plainLinkText}>Back</Text>
        </TouchableOpacity>
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  body: { paddingBottom: 24 },
  head: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  pdfRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  pdfName: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  pdfSub: { fontSize: 14, color: colors.fgSecondary },
  link: { fontSize: 17, fontWeight: '700', color: colors.brandPressed, paddingHorizontal: 4, paddingVertical: 10 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: colors.bgSunken },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 10 },
  tabOn: { backgroundColor: colors.bgCard },
  tabText: { fontSize: 16, fontWeight: '600', color: colors.fgSecondary },
  tabTextOn: { fontWeight: '800', color: colors.brandPressed },
  soon: { fontSize: 12, fontWeight: '700', color: colors.fgSecondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
  field: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  fieldNext: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  fieldLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.3, color: colors.fgSecondary },
  fieldText: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  sheetBody: { gap: 10 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.fgDefault },
  sheetSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  choices: { gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  choiceOn: { borderWidth: 2, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  choiceTitle: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  choiceHint: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brandPressed, backgroundColor: colors.brandPressed },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.fgOnFill },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 17, color: colors.fgDefault },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
  boxOn: { borderColor: colors.brandPressed, backgroundColor: colors.brandPressed },
  consentText: { flex: 1, fontSize: 16, lineHeight: 21, color: colors.fgDefault },
  failed: { fontSize: 14, lineHeight: 19, color: colors.dangerFg },
  plainLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainLinkText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault, textDecorationLine: 'underline' },
});
