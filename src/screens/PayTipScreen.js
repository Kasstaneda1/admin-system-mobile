// «Add tip» (design-mockups/payments card-tip, card-tip-on): the phone is in the customer's
// hands during a card payment. The company's buttons ($5 / $10 / $20 by default, or percent of
// the bill with tax — pd_company_profiles.tip_presets when the bill brings it), No tip and
// Custom. Next stays grey until one is picked (No tip too), then the summary for the
// technician (PayCardScreen). A tip is not part of the bill: no tax, no balance.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { firstName } from '../myDay/model';
import { usd } from '../bill/model';
import { chargeOf, moneyCents, tipButtons, tipPresetsOf } from '../pay/model';
import { Field } from '../pay/parts';
import { Foot, MainButton, TopBar, billStyles } from '../bill/parts';

export default function PayTipScreen({ route, navigation }) {
  const params = route.params || {};
  const { bill, cents, part = false } = params;
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState(null);           // a button's key, 'none' or 'custom'
  const [typed, setTyped] = useState('');

  const buttons = tipButtons(tipPresetsOf(bill), bill.total_cents);
  const custom = moneyCents(typed);
  const tip = picked === 'none' ? 0 : picked === 'custom' ? custom : (buttons.find((b) => b.key === picked) || {}).cents;
  const ready = picked !== null && Number.isInteger(tip) && tip >= 0 && (picked !== 'custom' || tip > 0);
  const tech = firstName(bill.technician && bill.technician.name);

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Card" title="Add tip" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.sum}>
            <View style={styles.sumCell} accessible accessibilityLabel={`${chargeOf(bill, part).tipLabel} ${usd(cents)}`}>
              <Text style={styles.sumLabel}>{chargeOf(bill, part).tipLabel.toUpperCase()}</Text>
              <Text style={styles.sumValue}>{usd(cents)}</Text>
            </View>
            <View style={[styles.sumCell, styles.sumNext]} accessible accessibilityLabel={`Tip ${usd(ready ? tip : 0)}`}>
              <Text style={styles.sumLabel}>TIP</Text>
              <Text style={[styles.sumValue, styles.sumTip]}>{usd(ready ? tip : 0)}</Text>
            </View>
          </View>
          <Text style={styles.ask} accessibilityRole="header">Would you like to add a tip?</Text>
          <Text style={styles.askSub}>{`For your technician${tech ? `, ${tech}` : ''}. Not part of the bill: no tax.`}</Text>
          <View style={styles.row} accessibilityRole="radiogroup">
            {buttons.map((b) => {
              const on = picked === b.key;
              return (
                <TouchableOpacity key={b.key} style={[styles.big, on && styles.on]} onPress={() => setPicked(b.key)}
                  accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={b.sub ? `${b.label}, ${b.sub}` : b.label}>
                  <Text style={[styles.bigText, on && styles.onText]}>{b.label}</Text>
                  {b.sub ? <Text style={styles.bigSub}>{b.sub}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.row} accessibilityRole="radiogroup">
            <TouchableOpacity style={[styles.small, picked === 'none' && styles.on]} onPress={() => setPicked('none')}
              accessibilityRole="radio" accessibilityState={{ checked: picked === 'none' }} accessibilityLabel="No tip">
              <Text style={[styles.smallText, picked === 'none' && styles.onText]}>No tip</Text>
              <Text style={styles.bigSub}>$0.00</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.small, picked === 'custom' && styles.on]} onPress={() => setPicked('custom')}
              accessibilityRole="radio" accessibilityState={{ checked: picked === 'custom' }} accessibilityLabel="Custom tip">
              <Text style={[styles.smallText, picked === 'custom' && styles.onText]}>Custom</Text>
              <Text style={styles.bigSub}>Type the dollars</Text>
            </TouchableOpacity>
          </View>
          {picked === 'custom' ? (
            <Field big prefix="$" label="Tip" value={typed} onChange={setTyped} keyboard="decimal-pad" max={9} placeholder="0.00" autoFocus />
          ) : null}
        </ScrollView>
        <Foot bottom={insets.bottom} note={ready ? null : 'Pick one to go on, even No tip.'}>
          <MainButton text={ready ? `Next · ${usd(cents + tip)} in all` : 'Next'} icon="chev" off={!ready}
            onPress={() => navigation.navigate('PayCard', { ...params, tipCents: tip })} />
        </Foot>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14, paddingBottom: 24 },
  sum: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  sumCell: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  sumNext: { borderLeftWidth: 1, borderLeftColor: colors.borderDefault },
  sumLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, color: colors.fgSecondary },
  sumValue: { fontSize: 22, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  sumTip: { color: colors.brandPressed },
  ask: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.fgDefault },
  askSub: { marginTop: -8, fontSize: 16, lineHeight: 21, color: colors.fgSecondary },
  row: { flexDirection: 'row', gap: 10 },
  big: { flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  small: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  on: { borderWidth: 2.5, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  bigText: { fontSize: 30, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  smallText: { fontSize: 19, fontWeight: '800', color: colors.fgDefault },
  onText: { color: colors.brandPressed },
  bigSub: { fontSize: 15, color: colors.fgSecondary },
});
