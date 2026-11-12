// What the customer gets (design-mockups/app-invoice preview, preview-low): the bill as the
// PDF will print it (backend billPdf.js) — the company's head with its licence, FINAL BILL,
// the number («Given when issued» for a draft), the job, the dates of the visits, the payment
// terms and the amount due; bill to, the service address and the technician; the appliance;
// the lines by group; the totals; the message and the warranty. A draft says DRAFT.
// Issue the bill: the server gives the number from the company's counter, freezes the bill
// and makes its PDF; the total the technician saw goes with it (expected_total_cents), so a
// bill changed meanwhile is not issued unseen. What only the office can fix (no tax, no
// company details) keeps the button off and says why. No internet: the number comes from the
// server, so the issue waits for it.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { billAPI } from '../services/api';
import { logError } from '../utils/logError';
import { nowWall } from '../myDay/model';
import { billError, blockersOf, previewOf, retryTax } from '../bill/model';
import { Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

export default function BillPreviewScreen({ route, navigation }) {
  const { id, visit = null } = route.params || {};
  const insets = useSafeAreaInsets();
  const [bill, setBill] = useState(null);
  const [problem, setProblem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async ({ pull = false } = {}) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const data = await billAPI.get(id);
      if (n !== seq.current) return;
      setBill(data.bill);
      setProblem(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading a bill preview:', error);
      setProblem(failed);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doc = useMemo(() => (bill ? previewOf(bill, visit, nowWall(Date.now()).date) : null), [bill, visit]);
  const blockers = bill ? blockersOf(bill) : [];
  const stopped = blockers.some((b) => b.hard);
  const draft = !!bill && bill.status === 'draft';

  const issue = useCallback(async () => {
    if (!bill || issuing) return;
    setIssuing(true);
    try {
      const data = await billAPI.issue(id, bill.total_cents);
      setBill(data.bill);
      const label = data.label || (data.bill && data.bill.label) || '';
      Alert.alert(`Bill ${label} is issued`, 'It is frozen and has its PDF. Give it to the customer before taking the payment.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (error) {
      const failed = billError(error, { issue: true, company: bill.company && (bill.company.name || bill.company.legal_name) });
      if (failed.kind === 'gone') {
        Alert.alert(failed.text, 'It is no longer on your day.', [{ text: 'OK', onPress: () => navigation.popToTop() }]);
        return;
      }
      if (failed.kind === 'failed') logError('Error issuing a bill:', error);
      Alert.alert('The bill is not issued', failed.text);
      if (failed.kind === 'refused') load();
    } finally {
      setIssuing(false);
    }
  }, [bill, issuing, id, navigation, load]);

  const askIssue = () => {
    Alert.alert('Issue the bill?', 'It gets its number and its PDF and is frozen. To change it later, the office voids and reissues it.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Issue', onPress: issue },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Bill" title="What the customer gets" wide onBack={() => navigation.goBack()} />
      {!doc ? (
        <View style={billStyles.noData}>
          {problem ? (
            <>
              <Text style={billStyles.noDataTitle}>{problem.kind === 'offline' ? 'No connection' : 'Could not load the bill'}</Text>
              <Text style={billStyles.noDataText}>{problem.kind === 'offline' ? 'The bill is kept by the office’s server. Try again when you are back online.' : problem.text}</Text>
              <View style={styles.stretch}><PlainButton text="Try again" icon="refresh" onPress={() => load()} /></View>
            </>
          ) : <ActivityIndicator color={colors.brand} />}
        </View>
      ) : (
        <>
          <ScrollView style={billStyles.page} contentContainerStyle={styles.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
            <View style={styles.paper} accessibilityLabel="The bill as the customer gets it">
              {doc.stamp ? <Text style={styles.stamp}>{doc.stamp}</Text> : null}
              <Text style={styles.company}>{doc.company.name}</Text>
              {doc.company.lines.map((l) => <Text key={l} style={styles.companyLine}>{l}</Text>)}
              {doc.company.licence ? <Text style={styles.licence}>{doc.company.licence}</Text> : null}
              {doc.company.hic ? <Text style={styles.licence}>{doc.company.hic}</Text> : null}
              <View style={styles.rule} />
              <Text style={styles.final}>FINAL BILL</Text>
              <View style={styles.facts}>
                {doc.facts.map((f) => (
                  <View key={f.label} style={styles.fact}>
                    <Text style={styles.factLabel}>{f.label}</Text>
                    <Text style={[styles.factValue, f.quiet && styles.factQuiet]}>{f.value}</Text>
                  </View>
                ))}
                <View style={[styles.fact, styles.factDue]}>
                  <Text style={styles.factLabel}>Amount due</Text>
                  <Text style={styles.factValue}>{doc.amountDue}</Text>
                </View>
              </View>

              <View style={styles.cols}>
                <View style={styles.col}>
                  <Text style={styles.h}>BILL TO</Text>
                  {doc.billTo.map((l, i) => <Text key={`b${i}`} style={[styles.p, i === 0 && styles.strong]}>{l}</Text>)}
                </View>
                <View style={styles.col}>
                  <Text style={styles.h}>SERVICE ADDRESS</Text>
                  {doc.service.address.map((l, i) => <Text key={`s${i}`} style={styles.p}>{l}</Text>)}
                  {doc.service.technician ? <Text style={styles.p}>{`Technician:\n${doc.service.technician}`}</Text> : null}
                </View>
              </View>

              {doc.appliances.length ? (
                <View style={styles.block}>
                  <Text style={styles.h}>APPLIANCE</Text>
                  {doc.appliances.map((a) => <Text key={a} style={styles.p}>{a}</Text>)}
                </View>
              ) : null}

              {doc.groups.map((g) => (
                <View key={g.key} style={styles.block}>
                  <Text style={styles.h}>{g.title.toUpperCase()}</Text>
                  <View style={styles.groupRule} />
                  {g.rows.map((r) => (
                    <View key={r.key} style={styles.docLine}>
                      <View style={styles.flex}>
                        <View style={styles.nameRow}>
                          <Text style={styles.docName}>{r.name}</Text>
                          {r.tag ? <Text style={styles.docTag}>{r.tag}</Text> : null}
                        </View>
                        {r.sub ? <Text style={styles.docSub}>{r.sub}</Text> : null}
                      </View>
                      <Text style={[styles.docAmount, r.deduction && styles.deduction]}>{r.amount}</Text>
                    </View>
                  ))}
                </View>
              ))}

              <View style={styles.sums}>
                {doc.totals.map((t) => (
                  <View key={t.label} style={styles.sum}>
                    <Text style={styles.sumLabel}>{t.label}</Text>
                    <Text style={styles.sumValue}>{t.value}</Text>
                  </View>
                ))}
                <View style={[styles.sum, styles.sumTotal]}>
                  <Text style={styles.sumBig}>Total</Text>
                  <Text style={styles.sumBig}>{doc.total}</Text>
                </View>
                {doc.deposits ? (
                  <View style={styles.sum}>
                    <Text style={styles.sumLabel}>Deposits applied</Text>
                    <Text style={styles.sumValue}>{doc.deposits}</Text>
                  </View>
                ) : null}
                <View style={styles.sum}>
                  <Text style={styles.sumDue}>Amount due</Text>
                  <Text style={styles.sumDue}>{doc.amountDue}</Text>
                </View>
              </View>

              {doc.message ? <Para title="MESSAGE" text={doc.message} /> : null}
              {doc.warranty ? <Para title="WARRANTY" text={doc.warranty} /> : null}
            </View>
          </ScrollView>

          {draft ? (
            <Foot bottom={insets.bottom}
              note={blockers.length ? blockers.map((b) => b.text).join(' ') : 'Issuing gives the number, freezes the bill and makes the PDF. To change it later: Void & reissue.'}>
              <MainButton text={stopped ? 'Issue · the office has to fix it' : 'Issue the bill'} icon="doc"
                off={stopped} waiting={issuing} onPress={askIssue} />
              {retryTax(blockers) ? (
                <TouchableOpacity style={styles.retryTax} onPress={askIssue} disabled={issuing} accessibilityRole="button">
                  <Text style={styles.retryTaxText}>The office set the tax? Try again</Text>
                </TouchableOpacity>
              ) : null}
            </Foot>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

function Para({ title, text }) {
  return (
    <View style={styles.para}>
      <Text style={styles.h}>{title}</Text>
      <Text style={styles.p}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  body: { padding: 12, paddingBottom: 24 },
  paper: { padding: 16, borderRadius: 6, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderSubtle, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  stamp: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 6, fontSize: 13, fontWeight: '800', letterSpacing: 2, color: colors.fgSecondary },
  company: { fontSize: 18, fontWeight: '800', color: colors.fgDefault, paddingRight: 80 },
  companyLine: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  licence: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: colors.fgDefault, marginTop: 6 },
  rule: { height: 2, backgroundColor: colors.brandPressed, marginVertical: 12 },
  final: { fontSize: 20, fontWeight: '800', letterSpacing: 1, color: colors.brandPressed },
  facts: { marginTop: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.borderDefault, gap: 4 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factDue: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderDefault },
  factLabel: { fontSize: 14, color: colors.fgSecondary },
  factValue: { flexShrink: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  factQuiet: { fontWeight: '400', fontStyle: 'italic', color: colors.fgSecondary },
  cols: { flexDirection: 'row', gap: 12, marginTop: 14 },
  col: { flex: 1, gap: 1 },
  block: { marginTop: 14, gap: 2 },
  h: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary, marginBottom: 2 },
  p: { fontSize: 14, lineHeight: 19, color: colors.fgDefault },
  strong: { fontWeight: '700' },
  groupRule: { height: 1, backgroundColor: colors.borderStrong, marginBottom: 2 },
  docLine: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  docName: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  docTag: { fontSize: 12, fontWeight: '700', color: colors.fgDefault, paddingHorizontal: 5, borderWidth: 1, borderColor: colors.fgDefault, borderRadius: 4, overflow: 'hidden' },
  docSub: { fontSize: 13, lineHeight: 18, color: colors.fgSecondary },
  docAmount: { fontSize: 15, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  deduction: { color: colors.successFg },
  sums: { marginTop: 10, gap: 4 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  sumLabel: { flex: 1, fontSize: 14, color: colors.fgSecondary },
  sumValue: { fontSize: 14, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  sumTotal: { marginTop: 4, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: colors.fgDefault },
  sumBig: { fontSize: 18, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  sumDue: { fontSize: 18, fontWeight: '800', color: colors.brandPressed, fontVariant: ['tabular-nums'] },
  retryTax: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  retryTaxText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed, textDecorationLine: 'underline' },
  para: { marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.borderDefault, gap: 2 },
});
