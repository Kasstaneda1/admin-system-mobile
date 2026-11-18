// The TAX section of a bill draft and its «Tax rate» sheet (TAX-APP; design-mockups/payments:
// app-fee-draft-off, app-tax-pick, app-tax-off, app-tax-readonly). The words and the list come
// from src/bill/tax.js; the screen sends the change and shows the bill the server answers.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { Sheet } from '../myDay/visitBar';
import { Choice } from '../pay/parts';
import { Box, MainButton, SectionHead } from './parts';
import { taxChoicesOf } from './tax';

// section: taxSection(bill); busy: the tax change on its way; want: where the switch was moved
// while it goes (null — as the bill says); onSwitch(on), onOpen()
export function TaxSection({ section, busy, want = null, onSwitch, onOpen }) {
  if (!section) return null;
  const { taxable, rate } = section;
  return (
    <View>
      <SectionHead label="Tax" />
      {taxable ? (
        <View style={[styles.row, styles.rowTop]}>
          <View style={styles.body}>
            <Text style={styles.title}>Taxable</Text>
            <Text style={styles.sub}>{taxable.sub}</Text>
          </View>
          {busy ? <ActivityIndicator color={colors.brandPressed} style={styles.wait} /> : null}
          <Switch value={want === null ? taxable.on : want} onValueChange={onSwitch} disabled={busy}
            trackColor={{ false: colors.borderControl, true: colors.brandPressed }} thumbColor={colors.fgOnFill} ios_backgroundColor={colors.borderControl}
            accessibilityLabel={`Taxable. ${taxable.sub}`} />
        </View>
      ) : null}
      {taxable && taxable.note ? (
        <View style={styles.note}><Box kind="plain" icon="info" text={taxable.note} /></View>
      ) : null}
      {rate ? (
        <RateRow rate={rate} first={!taxable} off={busy} onOpen={onOpen} />
      ) : null}
    </View>
  );
}

function RateRow({ rate, first, off, onOpen }) {
  const Wrap = rate.open ? TouchableOpacity : View;
  const label = [rate.title, rate.sub, rate.amount, rate.locked ? 'set by the office' : null].filter(Boolean).join(', ');
  return (
    <Wrap style={[styles.row, first && styles.rowTop]} onPress={rate.open ? onOpen : undefined} disabled={rate.open ? off : undefined}
      accessible accessibilityRole={rate.open ? 'button' : undefined} accessibilityLabel={label} accessibilityState={rate.open ? { disabled: off } : undefined}>
      <View style={styles.body}>
        <Text style={styles.title}>{rate.title}</Text>
        <Text style={styles.sub}>{rate.sub}</Text>
      </View>
      {rate.amount ? <Text style={styles.amount}>{rate.amount}</Text> : null}
      {rate.open ? <Icon name="chev" size={18} color={colors.fgSecondary} /> : null}
      {rate.locked ? <Icon name="lock" size={18} color={colors.fgSecondary} /> : null}
    </Wrap>
  );
}

// «Tax rate»: the rates the bill may have, one marked; Done sends the one chosen (onPick(key))
export function TaxSheet({ visible, bill, sending, bottom, onPick, onClose }) {
  const { rows, current } = bill ? taxChoicesOf(bill) : { rows: [], current: null };
  const [chosen, setChosen] = useState(current);
  useEffect(() => { if (visible) setChosen(current); }, [visible, current]);
  const company = bill && bill.company ? [bill.company.name, bill.company.state].filter(Boolean).join(' · ') : null;
  return (
    <Sheet visible={visible} onClose={sending ? () => {} : onClose} bottom={bottom}>
      <Text style={styles.sheetTitle} accessibilityRole="header">Tax rate</Text>
      <Text style={styles.sheetSub}>{company ? `Rates of ${company}, set by the office` : 'Rates set by the office'}</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listBody} accessibilityRole="radiogroup">
        {rows.map((r) => (
          <Choice key={r.key} on={chosen === r.key} title={r.title} sub={r.sub} off={sending} onPress={() => setChosen(r.key)} />
        ))}
      </ScrollView>
      <Text style={styles.hint}>A new rate? The office adds it in Tax rates.</Text>
      <MainButton text="Done" waiting={sending} onPress={() => onPick(chosen)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  rowTop: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  sub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  amount: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  wait: { marginRight: 4 },
  note: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  sheetTitle: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sheetSub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  list: { maxHeight: 340 },
  listBody: { gap: 10 },
  hint: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
});
