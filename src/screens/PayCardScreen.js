// «Card payment» (design-mockups/payments card-summary): the phone is back with the technician.
// Bill + Tip = one charge in the card app (Square) on this phone, its own tip screen off. Who the
// tip is for (you, split with the helper, the whole team), then «Charged · record $X» writes two
// lines (or three, split): the payment (method card, the office has the money) and the tip.
// No card numbers anywhere (the owner's В-М2). Each line has its own client_request_id, kept
// while nothing changes: a press again after no answer sends the same lines, the server answers
// each once — so a tip that did not go is sent again without a second payment.
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { payAPI } from '../services/api';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { chargeOf, payError, paymentBody, tipForChoices, tipForLine, tipParts } from '../pay/model';
import { Choice, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, TopBar, billStyles } from '../bill/parts';

export default function PayCardScreen({ route, navigation }) {
  const { id, visit, bill, cents, part = false, note = '', later = null, tipCents = 0 } = route.params || {};
  const insets = useSafeAreaInsets();
  const [forKey, setForKey] = useState('me');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(null);
  const [paidDone, setPaidDone] = useState(false);       // the payment went, a tip did not

  const meName = bill.technician && bill.technician.name;
  const total = cents + tipCents;
  const charge = chargeOf(bill, part);
  const choices = tipForChoices(visit, meName);
  const parts = useMemo(() => tipParts(tipCents, forKey, visit), [tipCents, forKey, visit]);

  // the lines' request ids: new when who gets the tip changes
  const ids = useRef(null);
  const record = async () => {
    if (sending) return;
    const shape = JSON.stringify(parts);
    if (!ids.current || ids.current.shape !== shape) {
      ids.current = { shape, payment: ids.current ? ids.current.payment : newRequestId(), tips: parts.map(() => newRequestId()) };
    }
    const pay = paymentBody({ cents, method: 'card', note, later, requestId: ids.current.payment });
    const tips = parts.map((p, i) => paymentBody({ kind: 'tip', cents: p.cents, method: 'card', later, tipFor: p, requestId: ids.current.tips[i] }));
    const bad = [pay, ...tips].find((b) => b.error);
    if (bad) { setFailed(bad.error); return; }
    setSending(true);
    setFailed(null);
    let data = null;
    try {
      data = await payAPI.record(id, pay.body);
      setPaidDone(true);
      for (const t of tips) data = await payAPI.record(id, t.body);
      const line = `${usd(cents)} card${tipCents > 0 ? ` + ${usd(tipCents)} tip` : ''} recorded`;
      navigation.popTo('Pay', { id, visit, bill: data.bill, recorded: { key: ids.current.payment, line } });
    } catch (error) {
      const f = payError(error);
      if (f.kind === 'failed') logError('Error recording a card payment:', error);
      if (f.kind === 'gone') { navigation.popToTop(); return; }
      setFailed(f.text);
    } finally {
      setSending(false);
    }
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
              {choices.map((c) => <Choice key={c.key} on={forKey === c.key} title={c.title} sub={c.sub} onPress={() => setForKey(c.key)} off={sending || paidDone} />)}
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
