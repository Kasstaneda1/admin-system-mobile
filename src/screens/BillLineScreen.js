// Edit line / New line (design-mockups/app-invoice line-edit): the name on the bill, the
// terms of the price book's item (folded to three lines), the price with its unit, the
// quantity − 1.5 +, the tax (the office's: shown, not changed here), the line's total, what
// the office will see, Delete this line. Done saves (PATCH only what changed, or POST a new
// line) and goes back to the bill, which reads itself again. A discount is taken as the price
// book gives it: only Delete. The words and the numbers are src/bill/model.js.
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { billAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import {
  KIND_WORDS, OWN_SERVICE_KINDS, billError, editError, editHint, editOf, editTotal, lineName, lineSub, newEdit, newLineBody,
  patchOf, percentText, qtyStep, qtyText, showQty, unitWord, usd,
} from '../bill/model';
import { Box, TopBar, billStyles } from '../bill/parts';

export default function BillLineScreen({ route, navigation }) {
  const { id, mode = 'edit', line = null, kind = 'labor', tax = null } = route.params || {};
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isNew = mode === 'new';
  const [edit, setEdit] = useState(() => (isNew ? newEdit(kind) : editOf(line)));
  const [saving, setSaving] = useState(null);           // 'save' | 'delete'
  const [failed, setFailed] = useState(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const discount = !isNew && line.kind === 'discount';

  const total = editTotal(edit);
  const problem = editError(edit);
  const changes = useMemo(() => (isNew || discount ? null : patchOf(line, edit)), [isNew, discount, line, edit]);
  const dirty = isNew ? !!(edit.name.trim() || edit.price.trim()) : !!changes && Object.keys(changes).length > 0;
  const set = (patch) => { setFailed(null); setEdit((e) => ({ ...e, ...patch })); };

  const leave = () => {
    if (!dirty || saving) { navigation.goBack(); return; }
    Alert.alert('Discard the changes?', 'The line stays as it was.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const run = async (what, request) => {
    if (saving) return;
    setSaving(what);
    setFailed(null);
    try {
      await request();
      navigation.goBack();
    } catch (error) {
      const f = billError(error);
      if (f.kind === 'gone') {
        Alert.alert(f.text, 'It is no longer on your day.', [{ text: 'OK', onPress: () => navigation.popToTop() }]);
        return;
      }
      if (f.kind === 'failed') logError('Error saving a bill line:', error);
      setFailed(f.text);
    } finally {
      setSaving(null);
    }
  };

  const save = () => {
    if (discount) { navigation.goBack(); return; }
    if (problem) { setFailed(problem); return; }
    if (isNew) { run('save', () => billAPI.addLine(id, newLineBody(edit))); return; }
    if (!dirty) { navigation.goBack(); return; }
    run('save', () => billAPI.changeLine(id, line.id, changes));
  };
  const remove = () => {
    Alert.alert('Delete this line?', `${lineName(line)} goes from the bill.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run('delete', () => billAPI.removeLine(id, line.id)) },
    ]);
  };

  const step = qtyStep(edit);
  const taxText = tax && tax.rate !== null && tax.rate !== undefined
    ? `Sales tax ${percentText(tax.rate)}${tax.name ? ` · ${tax.name}` : ''}`
    : 'The company has no default tax';
  const taxable = isNew ? null : line.taxable;
  const title = isNew ? (edit.kind === 'part' ? 'New material' : 'New service') : discount ? 'Discount' : 'Edit line';

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Bill" title={title} onBack={leave} right={discount ? null : 'Done'} onRight={save} rightOff={!!saving} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={billStyles.page} contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]} keyboardShouldPersistTaps="handled">
          {discount ? (
            <View style={styles.block}>
              <Text style={styles.label}>DISCOUNT</Text>
              <Text style={styles.readName}>{lineName(line)}</Text>
              <Text style={styles.readSub}>{lineSub(line)}</Text>
              <View style={styles.lockRow}>
                <Icon name="lock" size={18} color={colors.fgSecondary} />
                <Text style={styles.lockText}>A discount is taken as the office set it in the price book.</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Line total</Text>
                <Text style={[styles.totalValue, styles.deduction]}>{usd(line.amount_cents)}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.block}>
              {isNew && edit.kind !== 'part' ? (
                <>
                  <Text style={styles.label}>KIND</Text>
                  <View style={styles.kinds} accessibilityRole="radiogroup">
                    {OWN_SERVICE_KINDS.map((k) => {
                      const on = edit.kind === k;
                      return (
                        <TouchableOpacity key={k} style={[styles.kind, on && styles.kindOn]} onPress={() => set({ kind: k })}
                          accessibilityRole="radio" accessibilityState={{ checked: on }}>
                          <Text style={[styles.kindText, on && styles.kindTextOn]}>{KIND_WORDS[k]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>NAME ON THE BILL</Text>
              <TextInput style={styles.field} value={edit.name} onChangeText={(t) => set({ name: t })} maxLength={200}
                placeholder={edit.kind === 'part' ? 'Drain hose' : 'Repair labor'} placeholderTextColor={colors.fgMutedField}
                accessibilityLabel="Name on the bill" />

              {edit.description ? (
                <>
                  <Text style={styles.label}>TERMS ON THE BILL</Text>
                  <View style={styles.terms}>
                    <Text style={styles.termsText} numberOfLines={termsOpen ? undefined : 3}>{edit.description}</Text>
                    <View style={styles.termsFoot}>
                      <Text style={styles.termsFrom}>{edit.fromBook ? `From the price book${edit.version ? ` · version ${edit.version}` : ''}` : 'Written for this line'}</Text>
                      <TouchableOpacity style={styles.showAll} onPress={() => setTermsOpen((o) => !o)} accessibilityRole="button">
                        <Text style={styles.showAllText}>{termsOpen ? 'Show less' : 'Show all'}</Text>
                        <Icon name="chevd" size={18} color={colors.brandPressed} style={termsOpen ? styles.flip : null} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : null}

              <View style={styles.pair}>
                <View style={styles.half}>
                  <Text style={styles.label}>PRICE</Text>
                  <View style={styles.priceBox}>
                    <Text style={styles.dollar}>$</Text>
                    <TextInput style={styles.priceInput} value={edit.price} onChangeText={(t) => set({ price: t })} keyboardType="decimal-pad"
                      placeholder="0.00" placeholderTextColor={colors.fgMutedField} accessibilityLabel={unitWord(edit) ? `Price per ${unitWord(edit)}` : 'Price'} />
                    {unitWord(edit) ? <Text style={styles.unit}>{`/ ${unitWord(edit)}`}</Text> : null}
                  </View>
                </View>
                {showQty(edit) ? (
                <View style={styles.half}>
                  <Text style={styles.label}>QUANTITY</Text>
                  <View style={styles.qtyBox}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => set({ qty: Math.max(step, edit.qty - step) })} disabled={edit.qty <= step}
                      accessibilityRole="button" accessibilityLabel="Less" accessibilityState={{ disabled: edit.qty <= step }}>
                      <Icon name="minus" size={24} color={edit.qty <= step ? colors.fgDisabled : colors.brandPressed} />
                    </TouchableOpacity>
                    <Text style={styles.qty} accessibilityLabel={`Quantity ${qtyText(edit.qty)}`}>{qtyText(edit.qty)}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => set({ qty: edit.qty + step })} accessibilityRole="button" accessibilityLabel="More">
                      <Icon name="plus" size={24} color={colors.brandPressed} />
                    </TouchableOpacity>
                  </View>
                </View>
                ) : null}
              </View>

              <View style={styles.taxRow} accessible accessibilityLabel={`${taxable === false ? 'Not taxable' : 'Taxable'}. ${taxText}. Set by the office.`}>
                <View style={styles.flex}>
                  <Text style={styles.taxTitle}>{taxable === false ? 'Not taxable' : 'Taxable'}</Text>
                  <Text style={styles.taxSub}>{taxText}</Text>
                </View>
                <View style={styles.lockPill}>
                  <Icon name="lock" size={14} color={colors.fgSecondary} />
                  <Text style={styles.lockPillText}>Set by the office</Text>
                </View>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Line total</Text>
                <Text style={styles.totalValue}>{total === null ? '—' : usd(total)}</Text>
              </View>
            </View>
          )}

          <View style={styles.after}>
            {failed ? <Box kind="danger" icon="warn" text={failed} /> : null}
            {!discount ? <Box kind="plain" icon="info" text={editHint(isNew ? null : line, edit, user?.fullName)} /> : null}
            {!isNew ? (
              <TouchableOpacity style={[styles.delete, saving && styles.off]} onPress={remove} disabled={!!saving} accessibilityRole="button" accessibilityState={{ disabled: !!saving }}>
                <Icon name="trash" size={22} color={colors.dangerFg} />
                <Text style={styles.deleteText}>{saving === 'delete' ? 'Deleting…' : 'Delete this line'}</Text>
              </TouchableOpacity>
            ) : null}
            {saving === 'save' ? <Text style={styles.savingText}>Saving…</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingTop: 0 },
  block: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 8, backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 1.3, color: colors.fgSecondary, marginTop: 10 },
  field: { minHeight: 56, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 17, color: colors.fgDefault },
  readName: { fontSize: 20, fontWeight: '800', color: colors.fgDefault },
  readSub: { fontSize: 16, color: colors.fgSecondary },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  lockText: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderDefault, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
  kindOn: { borderWidth: 2, borderColor: colors.brandPressed, backgroundColor: colors.brandSoft },
  kindText: { fontSize: 15, fontWeight: '600', color: colors.fgDefault },
  kindTextOn: { fontWeight: '800', color: colors.brandPressed },
  terms: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle, gap: 10 },
  termsText: { fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  termsFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  termsFrom: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  showAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  showAllText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  flip: { transform: [{ rotate: '180deg' }] },
  pair: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, gap: 8 },
  priceBox: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl },
  dollar: { fontSize: 17, color: colors.fgSecondary },
  priceInput: { flex: 1, minHeight: 54, paddingHorizontal: 6, fontSize: 18, fontWeight: '600', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, fontWeight: '600', color: colors.fgSecondary },
  qtyBox: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl },
  qtyBtn: { width: 52, height: 54, alignItems: 'center', justifyContent: 'center' },
  qty: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  taxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  taxTitle: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  taxSub: { fontSize: 14, color: colors.fgSecondary },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.bgSunken },
  lockPillText: { fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1.5, borderTopColor: colors.fgDefault },
  totalLabel: { fontSize: 20, fontWeight: '800', color: colors.fgDefault },
  totalValue: { fontSize: 22, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  deduction: { color: colors.successFg },
  after: { padding: 16, gap: 12 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  deleteText: { fontSize: 18, fontWeight: '800', color: colors.dangerFg },
  off: { borderColor: colors.borderDefault },
  savingText: { fontSize: 14, color: colors.fgSecondary, textAlign: 'center' },
});
