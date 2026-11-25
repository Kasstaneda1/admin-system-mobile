// Giving an issued bill to the customer, from the bill's screen (the visit has the same as a
// sheet, «Send the bill», T3 d6). In NYC the payment waits until the customer has the Final Bill.
// The choice is bill/CopyParts.js (rules in bill/copy.js): Email the PDF (only while the server
// sends customer emails — nothing says «Soon»), Share the PDF, Printed copy handed, and — when the
// copy is not required — Show it on this phone; the button follows the choice. View shows the PDF.
// Showing the bill on the phone does not count as given: the customer must keep a copy.
// Delivered: the customer signs that they got it (AckScreen), or the line of their signature (one
// still on this phone, ack/queue.js: «Signed · saved on this phone»).
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { ackAPI, billAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { acks } from '../ack/store';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { nowWall, clock, momentWall } from '../myDay/model';
import { billError, deliveryOf, giveRequired, pdfName, pdfReadyText } from '../bill/model';
import { buttonOf, copyRequired } from '../bill/copy';
import { CopyChoice, useCopy } from '../bill/CopyParts';
import { downloadBillPdf } from '../bill/pdf';
import { signedLine } from '../ack/model';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

export default function BillSendScreen({ route, navigation }) {
  // back: the word of the back button — the screen it goes back to (Bill, or Visit / Payment when
  // opened from there: Дизайнер, #84)
  const { id, visit, back = 'Bill' } = route.params || {};
  const insets = useSafeAreaInsets();
  const [bill, setBill] = useState(null);
  const [ack, setAck] = useState(null);               // the customer's signature for the bill, once they signed
  const [onPhone, setOnPhone] = useState(false);      // their signature still on this phone, going by itself
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [problem, setProblem] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const data = await billAPI.get(id);
      if (n === seq.current) { setBill(data.bill); setProblem(null); }
      // the signature for it: only a delivered bill has one (any issued one where Give the bill is
      // not Required); not read — the button opens the screen that reads it
      if (data.bill && data.bill.status === 'issued' && (data.bill.delivered_at || !giveRequired(visit, data.bill))) {
        if (userId !== null) await acks.flushAll(userId).catch(() => {});
        const kept = userId === null ? null : await acks.pendingOf(id, userId).catch(() => null);
        if (n === seq.current) setOnPhone(!!(kept && !kept.failed));
        const signed = await ackAPI.get(id).catch(() => null);
        if (n === seq.current && signed) setAck(signed.acknowledgment || null);
      }
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading a bill to send:', error);
      setProblem(failed);
    }
  }, [id, userId, visit]);
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
  // ---------- the copy ----------
  const copy = useCopy({ id, bill, required: copyRequired(bill, visit) });
  const [giving, setGiving] = useState(false);
  const [giveFailed, setGiveFailed] = useState(null);
  const give = async () => {
    if (giving || !bill) return;
    setGiving(true);
    setGiveFailed(null);
    const r = await copy.give();
    setGiving(false);
    if (!r.ok) { if (r.text) setGiveFailed(r.text); return; }
    if (r.show) { viewPdf(); return; }
    if (r.bill) setBill(r.bill); else load();
  };

  const now = nowWall(Date.now());
  const label = bill ? bill.label || `#${bill.bill_number}` : '';
  const delivered = bill ? deliveryOf(bill, now) : null;
  // Give the bill not Required: the customer may sign before the bill is given
  const signsFirst = !!bill && bill.status === 'issued' && !giveRequired(visit, bill);
  const issuedAt = bill ? momentWall(bill.issued_at) : null;

  if (!bill) {
    return (
      <SafeAreaView edges={['top']} style={billStyles.screen}>
        <StatusBar style="dark" />
        <TopBar back={back} title="Send" onBack={() => navigation.goBack()} />
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
      <TopBar back={back} title={`Send ${label}`} onBack={() => navigation.goBack()} />
      <ScrollView style={billStyles.page} contentContainerStyle={styles.body}>
        <View style={styles.head}>
          {delivered ? (
            <Box kind="done" icon="checkc" title={delivered.title} text={`${delivered.line}. The bill is with the customer.`} />
          ) : (
            <Box kind="done" icon="checkc" title={`Bill ${label} is issued`}
              text={`${issuedAt ? `Frozen at ${clock(issuedAt.minutes)}. ` : ''}${pdfReadyText(bill)}`} />
          )}
          <TouchableOpacity style={styles.pdfRow} onPress={viewPdf} disabled={!!pdfBusy} accessibilityRole="button" accessibilityLabel={`View ${pdfName(bill)}`}>
            <Icon name="doc" size={24} color={colors.brandPressed} />
            <View style={styles.flex}>
              <Text style={styles.pdfName}>{pdfName(bill)}</Text>
              <Text style={styles.pdfSub}>The customer’s copy, frozen when the bill became final</Text>
            </View>
            {pdfBusy === 'view' ? <ActivityIndicator color={colors.brandPressed} /> : <Text style={styles.link}>View</Text>}
          </TouchableOpacity>
          <CopyChoice copy={copy} label={delivered ? 'SEND IT AGAIN' : 'THE CUSTOMER’S COPY'} off={giving} onChange={() => setGiveFailed(null)} />
        </View>
      </ScrollView>

      <Foot bottom={insets.bottom} failure={giveFailed}>
        {delivered ? (
          <PlainButton text={giving && copy.way !== 'show' ? 'Sending…' : buttonOf('send', copy.way).text} icon={buttonOf('send', copy.way).icon} waiting={giving} onPress={give} />
        ) : (
          <MainButton text={giving && copy.way !== 'show' ? 'Sending…' : buttonOf('send', copy.way).text} icon={buttonOf('send', copy.way).icon} waiting={giving} onPress={give} />
        )}
        {(delivered || signsFirst) && !ack && onPhone ? <PlainButton text="Signed · saved on this phone" icon="checkc" onPress={() => navigation.navigate('Ack', { id, visit, back: 'Send' })} /> : null}
        {delivered && !ack && !onPhone ? <MainButton text="Customer signs for the bill" icon="check" onPress={() => navigation.navigate('Ack', { id, visit, back: 'Send' })} /> : null}
        {!delivered && signsFirst && !ack && !onPhone ? <PlainButton text="Customer signs for the bill" icon="check" onPress={() => navigation.navigate('Ack', { id, visit, back: 'Send' })} /> : null}
        {(delivered || signsFirst) && ack ? <PlainButton text={signedLine(ack, now.date)} icon="checkc" onPress={() => navigation.navigate('Ack', { id, visit, back: 'Send' })} /> : null}
      </Foot>

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
});
