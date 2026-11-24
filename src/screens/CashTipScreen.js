// «Cash tip» (design-mockups/payments tip): a tip outside a card payment — cash, or a tip the
// customer gives later — from the paid bill's «Add a cash tip». The company's buttons and
// Custom, who it is for, how it was given. Not part of the bill: the bill, its tax and its
// balance do not change (kind tip, BILLS_MV_DESIGN.md §3.7). A split is two lines.
// The lines live in pay/attempts.js by bill: after the first line the server took, or a send
// without an answer, the amount, who it is for and how stay as sent (also after Back and «Add a
// cash tip» again, until Pay has read the bill); the next press sends the same lines.
import React, { useReducer, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { payAPI } from '../services/api';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { alreadyLine, commaHint, holderLine, moneyCents, paymentBody, tipButtons, tipForChoices, tipParts, tipPresetsOf } from '../pay/model';
import { LOOK_AGAIN, answeredCount, attemptOf, linesLocked, noAnswer, runAttempt, startAttempt } from '../pay/attempts';
import { BigHead, Choice, Field, MethodTiles, Pills, Section, payStyles } from '../pay/parts';
import { Foot, MainButton, TopBar, billStyles } from '../bill/parts';

// a tip by Other would need its name: the five tiles are enough for a tip
const TIP_METHODS = ['cash', 'check', 'card', 'zelle', 'venmo'];

export default function CashTipScreen({ route, navigation }) {
  const { id, visit, bill } = route.params || {};
  const insets = useSafeAreaInsets();
  const buttons = tipButtons(tipPresetsOf(bill), bill.total_cents);
  const kept = attemptOf(bill.id, 'tip');
  const view = kept ? kept.view : null;
  const [picked, setPicked] = useState(view ? view.picked : buttons[buttons.length - 1].key);
  const [typed, setTyped] = useState(view ? view.typed : '');
  const [forKey, setForKey] = useState(view ? view.forKey : 'me');
  const [method, setMethod] = useState(view ? view.method : 'cash');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(kept && kept.uncertain ? `No answer from the server. ${LOOK_AGAIN}` : null);
  const [, redraw] = useReducer((n) => n + 1, 0);
  const attempt = attemptOf(bill.id, 'tip');
  const locked = linesLocked(attempt);
  const done = answeredCount(attempt);                   // lines already recorded (a split)

  const label = bill.label || `#${bill.bill_number}`;
  const meName = bill.technician && bill.technician.name;
  const cents = picked === 'custom' ? moneyCents(typed) : (buttons.find((b) => b.key === picked) || {}).cents;
  const ok = Number.isInteger(cents) && cents > 0;
  const parts = ok ? tipParts(cents, forKey, visit) : [];

  const record = async () => {
    if (sending || !ok) return;
    let current = attemptOf(bill.id, 'tip');
    if (!current) {
      const lines = parts.map((p) => {
        const rid = newRequestId();
        return { rid, built: paymentBody({ kind: 'tip', cents: p.cents, method, tipFor: p, requestId: rid }) };
      });
      const bad = lines.find((l) => l.built.error);
      if (bad) { setFailed(bad.built.error); return; }
      current = startAttempt(bill.id, 'tip', { lines: lines.map((l) => ({ rid: l.rid, body: l.built.body })), view: { picked, typed, forKey, method } });
    }
    setSending(true);
    setFailed(null);
    const result = await runAttempt(current, { record: (body) => payAPI.record(id, body) });
    setSending(false);
    redraw();
    const key = current.lines[0].rid;
    if (result.done) {
      navigation.popTo('Pay', { id, visit, bill: result.data.bill, recorded: { key, line: `${usd(cents)} tip recorded` } });
      return;
    }
    if (result.already) {
      navigation.popTo('Pay', { id, visit, bill: result.bill, recorded: { key: `already-${key}`, line: alreadyLine(result.already) } });
      return;
    }
    const f = result.failed;
    if (f.kind === 'failed') logError('Error recording a tip:', result.error);
    if (f.kind === 'gone') { navigation.popToTop(); return; }
    setFailed(noAnswer(f) ? `${f.text} ${LOOK_AGAIN}` : f.text);
  };

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Payment" title={method === 'cash' ? 'Cash tip' : 'Tip'} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={payStyles.body} keyboardShouldPersistTaps="handled">
          <BigHead label={`Tip · not part of ${label}`} big={usd(ok ? cents : 0)} sub="No tax. The bill and its balance do not change." />
          <Section label="How much">
            <Pills items={[...buttons.map((b) => ({ key: b.key, label: b.sub ? `${b.label} · ${b.sub}` : b.label })), { key: 'custom', label: 'Custom' }]}
              value={picked} onPick={(k) => k && setPicked(k)} off={sending || locked} />
            {picked === 'custom' ? <Field off={locked} big prefix="$" label={null} value={typed} onChange={setTyped} keyboard="decimal-pad" max={9} placeholder="0.00" a11y="Tip amount" autoFocus hint={commaHint(typed)} /> : null}
          </Section>
          <Section label="For">
            <View style={{ gap: 8 }} accessibilityRole="radiogroup">
              {tipForChoices(visit, meName).map((c) => <Choice key={c.key} on={forKey === c.key} title={c.title} sub={c.sub} onPress={() => setForKey(c.key)} off={sending || locked} />)}
            </View>
          </Section>
          <Section label="Pay with">
            <MethodTiles value={method} onPick={setMethod} only={TIP_METHODS} off={sending || locked} />
          </Section>
        </ScrollView>
        <Foot bottom={insets.bottom} note={holderLine(method, { kind: 'tip' })}
          failure={failed ? (done > 0 ? `${done} of ${parts.length} lines recorded. ${failed}` : failed) : null}>
          <MainButton text={ok ? `Record ${usd(cents)} tip` : 'Type the tip'} icon="check" off={!ok} waiting={sending} onPress={record} />
        </Foot>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

