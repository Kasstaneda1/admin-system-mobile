// «Card payment» (design-mockups/payments card-summary): the phone is back with the technician.
// Bill + Tip = one charge in the card app (Square) on this phone, its own tip screen off. Who the
// tip is for (you, split with the helper, the whole team), then «Charged · record $X» writes two
// lines (or three, split): the payment (method card, the office has the money) and the tip.
// No card numbers anywhere (the owner's В-М2). Each line has its own client_request_id, kept
// while nothing changes: a press again after no answer sends the same lines, the server answers
// each once — so a tip that did not go is sent again without a second payment.
// The lines live in pay/attempts.js, by bill, not in this screen: Back to Tip and Next again finds
// the same lines and the same ids; after the first line the server took, or a send without an
// answer, who gets the tip and the amounts do not change; after no answer the next press first
// looks at the bill.
import React, { useMemo, useReducer, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { billAPI, payAPI } from '../services/api';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { alreadyLine, chargeOf, paymentBody, tipForChoices, tipForLine, tipParts } from '../pay/model';
import { LOOK_AGAIN, answeredCount, attemptOf, linesLocked, noAnswer, runAttempt, startAttempt } from '../pay/attempts';
import { Choice, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, TopBar, billStyles } from '../bill/parts';

export default function PayCardScreen({ route, navigation }) {
  const { id, visit, bill, part = false, note = '', later = null } = route.params || {};
  // lines sent before (this screen opened again after Back): they are what is charged
  const kept = attemptOf(bill.id, 'card');
  const view = kept ? kept.view : null;
  const cents = view ? view.cents : route.params.cents;
  const tipCents = view ? view.tipCents : (route.params.tipCents || 0);
  const insets = useSafeAreaInsets();
  const [forKey, setForKey] = useState(view ? view.forKey : 'me');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(!kept ? null : kept.uncertain ? `No answer from the server. ${LOOK_AGAIN}`
    : answeredCount(kept) > 0 ? 'Press to send the tip again.' : null);
  const [, redraw] = useReducer((n) => n + 1, 0);
  const attempt = attemptOf(bill.id, 'card');
  const locked = linesLocked(attempt);
  const paidDone = answeredCount(attempt) > 0;           // the payment went, a tip did not

  const meName = bill.technician && bill.technician.name;
  const total = cents + tipCents;
  const charge = chargeOf(bill, part);
  const choices = tipForChoices(visit, meName);
  const parts = useMemo(() => tipParts(tipCents, forKey, visit), [tipCents, forKey, visit]);

  const record = async () => {
    if (sending) return;
    let current = attemptOf(bill.id, 'card');
    if (!current) {
      const payRid = newRequestId();
      const pay = paymentBody({ cents, method: 'card', note, later, requestId: payRid });
      const tips = parts.map((p) => {
        const rid = newRequestId();
        return { rid, built: paymentBody({ kind: 'tip', cents: p.cents, method: 'card', later, tipFor: p, requestId: rid }) };
      });
      const bad = [pay, ...tips.map((t) => t.built)].find((b) => b.error);
      if (bad) { setFailed(bad.error); return; }
      current = startAttempt(bill.id, 'card', {
        bill,
        lines: [{ rid: payRid, body: pay.body }, ...tips.map((t) => ({ rid: t.rid, body: t.built.body }))],
        view: { cents, tipCents, forKey },
      });
    }
    setSending(true);
    setFailed(null);
    const result = await runAttempt(current, { record: (body) => payAPI.record(id, body), readBill: async () => (await billAPI.get(id)).bill });
    setSending(false);
    redraw();
    const key = current.lines[0].rid;
    if (result.done) {
      const line = `${usd(cents)} card${tipCents > 0 ? ` + ${usd(tipCents)} tip` : ''} recorded`;
      navigation.popTo('Pay', { id, visit, bill: result.data.bill, recorded: { key, line } });
      return;
    }
    if (result.already) {
      navigation.popTo('Pay', { id, visit, bill: result.bill, recorded: { key: `already-${key}`, line: alreadyLine(result.already) } });
      return;
    }
    const f = result.failed;
    if (f.kind === 'failed') logError('Error recording a card payment:', result.error);
    if (f.kind === 'gone') { navigation.popToTop(); return; }
    setFailed(noAnswer(f) ? `${f.text} ${LOOK_AGAIN}` : f.text);
  };

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Tip" title="Card payment" onBack={() => navigation.goBack()} />
      <ScrollView style={billStyles.page} contentContainerStyle={payStyles.body}>
        <View style={styles.top}>
          <View style={styles.card}>
            <View style={styles.row} accessible accessibilityLabel={`${charge.title} ${usd(cents)}, ${charge.sub}`}>
              <View style={styles.flex}>
                <Text style={styles.name}>{charge.title}</Text>
                <Text style={styles.sub}>{charge.sub}</Text>
              </View>
              <Text style={styles.amount}>{usd(cents)}</Text>
            </View>
            <View style={[styles.row, styles.rowNext]} accessible accessibilityLabel={`Tip ${usd(tipCents)}`}>
              <View style={styles.flex}>
                <Text style={styles.name}>Tip</Text>
                <Text style={styles.sub}>{tipCents > 0 ? tipForLine(forKey, visit, meName) : 'No tip'}</Text>
              </View>
              <Text style={styles.amount}>{usd(tipCents)}</Text>
            </View>
            <View style={[styles.row, styles.rowTotal]} accessible accessibilityLabel={`Charge on the card ${usd(total)}`}>
              <Text style={[styles.flex, styles.totalName]}>Charge on the card</Text>
              <Text style={styles.totalAmount}>{usd(total)}</Text>
            </View>
          </View>
          <Box kind="info" icon="card" title={`Charge ${usd(total)} in the card app`}
            text={tipCents > 0 ? 'Square, on this phone: one charge for all of it. Its own tip screen is off, the tip is already in.' : 'Square, on this phone: one charge. Its own tip screen is off.'} />
        </View>

        {tipCents > 0 ? (
          <Section label="Tip for">
            <View style={styles.choices} accessibilityRole="radiogroup">
              {choices.map((c) => <Choice key={c.key} on={forKey === c.key} title={c.title} sub={c.sub} onPress={() => setForKey(c.key)} off={sending || locked} />)}
            </View>
          </Section>
        ) : null}
        {failed ? (
          <Box kind="danger" icon="warn" style={payStyles.gap}
            text={paidDone ? `The payment ${usd(cents)} is recorded, the tip is not yet. ${failed}` : failed} />
        ) : null}
      </ScrollView>
      <Foot bottom={insets.bottom}
        note={tipCents > 0 ? `${parts.length + 1 === 2 ? 'Two' : 'Three'} lines: payment ${usd(cents)} and tip ${usd(tipCents)}. The bill and its tax stay as they are.` : 'Money on hand: the office. Nothing to turn in.'}>
        <MainButton text={paidDone ? 'Record the tip again' : `Charged · record ${usd(total)}`} icon="check" waiting={sending} onPress={record} />
      </Foot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { padding: 16, gap: 12 },
  card: { paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  rowNext: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  rowTotal: { borderTopWidth: 1.5, borderTopColor: colors.fgDefault, alignItems: 'center' },
  name: { fontSize: 18, fontWeight: '700', color: colors.fgDefault },
  sub: { fontSize: 15, color: colors.fgSecondary },
  amount: { fontSize: 18, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  totalName: { fontSize: 21, fontWeight: '800', color: colors.fgDefault },
  totalAmount: { fontSize: 24, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  choices: { gap: 8 },
});
