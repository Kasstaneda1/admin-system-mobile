// «Cash tip» (design-mockups/payments tip): a tip outside a card payment — cash, or a tip the
// customer gives later — from the paid bill's «Add a cash tip». The company's buttons and
// Custom, who it is for, how it was given. Not part of the bill: the bill, its tax and its
// balance do not change (kind tip, BILLS_MV_DESIGN.md §3.7). A split is two lines.
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { payAPI } from '../services/api';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { holderLine, moneyCents, payError, paymentBody, shortPerson, tipButtons, tipForChoices, tipParts, tipPresetsOf } from '../pay/model';
import { BigHead, Choice, Field, MethodTiles, Pills, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, TopBar, billStyles } from '../bill/parts';

// a tip by Other would need its name: the five tiles are enough for a tip
const TIP_METHODS = ['cash', 'check', 'card', 'zelle', 'venmo'];

export default function CashTipScreen({ route, navigation }) {
  const { id, visit, bill } = route.params || {};
  const insets = useSafeAreaInsets();
  const buttons = tipButtons(tipPresetsOf(bill), bill.total_cents);
  const [picked, setPicked] = useState(buttons[buttons.length - 1].key);
  const [typed, setTyped] = useState('');
  const [forKey, setForKey] = useState('me');
  const [method, setMethod] = useState('cash');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(null);
  const [done, setDone] = useState(0);                   // lines already recorded (a split)

  const label = bill.label || `#${bill.bill_number}`;
  const meName = bill.technician && bill.technician.name;
  const cents = picked === 'custom' ? moneyCents(typed) : (buttons.find((b) => b.key === picked) || {}).cents;
  const ok = Number.isInteger(cents) && cents > 0;
  const parts = ok ? tipParts(cents, forKey, visit) : [];

  const ids = useRef(null);
  const record = async () => {
    if (sending || !ok) return;
    const shape = JSON.stringify({ parts, method });
    if (!ids.current || ids.current.shape !== shape) ids.current = { shape, list: parts.map(() => newRequestId()) };
    const bodies = parts.map((p, i) => paymentBody({ kind: 'tip', cents: p.cents, method, tipFor: p, requestId: ids.current.list[i] }));
    const bad = bodies.find((b) => b.error);
    if (bad) { setFailed(bad.error); return; }
    setSending(true);
    setFailed(null);
    try {
      let data = null;
      for (let i = 0; i < bodies.length; i += 1) {
        data = await payAPI.record(id, bodies[i].body);
        setDone(i + 1);
      }
      navigation.popTo('Pay', { id, visit, bill: data.bill, recorded: { key: ids.current.list[0], line: `${usd(cents)} tip recorded` } });
    } catch (error) {
      const f = payError(error);
      if (f.kind === 'failed') logError('Error recording a tip:', error);
      if (f.kind === 'gone') { navigation.popToTop(); return; }
      setFailed(f.text);
    } finally {
      setSending(false);
    }
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
              value={picked} onPick={(k) => k && setPicked(k)} off={sending || done > 0} />
            {picked === 'custom' ? <Field big prefix="$" label={null} value={typed} onChange={setTyped} keyboard="decimal-pad" max={9} placeholder="0.00" a11y="Tip amount" autoFocus /> : null}
          </Section>
          <Section label="For">
            <View style={{ gap: 8 }} accessibilityRole="radiogroup">
              {tipForChoices(visit, meName).map((c) => <Choice key={c.key} on={forKey === c.key} title={c.title} sub={c.sub} onPress={() => setForKey(c.key)} off={sending || done > 0} />)}
            </View>
          </Section>
          <Section label="Pay with">
            <MethodTiles value={method} onPick={setMethod} only={TIP_METHODS} off={sending || done > 0} />
          </Section>
          {failed ? <Box kind="danger" icon="warn" style={payStyles.gap} text={done > 0 ? `${done} of ${parts.length} lines recorded. ${failed}` : failed} /> : null}
        </ScrollView>
        <Foot bottom={insets.bottom} note={holderLine(method, { kind: 'tip', me: shortPerson(meName) })}>
          <MainButton text={ok ? `Record ${usd(cents)} tip` : 'Type the tip'} icon="check" off={!ok} waiting={sending} onPress={record} />
        </Foot>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

