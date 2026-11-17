// Parts, one estimate (design-mockups/app-salary-parts parts-detail): the stage and the estimate;
// Customer and Appliance; the parts with their numbers and Estimate total; where it is — Sold,
// In Transit, Arrived, On Board, Scheduled, Installed, the current stage marked; the office's
// note. Read only, from the row the list loaded (no dates per stage yet: the server does not
// give a technician the dates of the status changes).
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import { Tag } from '../myDay/parts';
import { Box, SectionHead, TopBar, billStyles } from '../bill/parts';
import { detailOf } from '../parts/model';
import { SalaryFrame, salaryStyles } from '../salary/parts';

export default function PartsEstimateScreen({ route, navigation }) {
  const { estimate = {} } = route.params || {};
  const { user } = useAuth();
  const d = useMemo(() => detailOf(estimate, { me: user?.fullName || null, thisYear: new Date().getFullYear() }), [estimate, user]);

  return (
    <SalaryFrame navigation={navigation} tab="Parts" top={<TopBar back="Parts" title={d.title} onBack={() => navigation.goBack()} />}>
      <ScrollView contentContainerStyle={salaryStyles.bottomSpace}>
        <View style={styles.head}>
          <View style={styles.headRow}>
            <Tag tag={d.tag} big fixed />
            <Text style={styles.headLine} numberOfLines={1}>{d.line}</Text>
          </View>
          <View style={styles.who}>
            <View style={styles.whoCol} accessible accessibilityLabel={`Customer ${d.client}${d.partner ? `, with ${d.partner}` : ''}`}>
              <Text style={styles.whoLabel}>CUSTOMER</Text>
              <Text style={styles.whoValue}>{d.client}</Text>
              {d.partner ? <Text style={styles.whoSub}>{`with ${d.partner}`}</Text> : null}
            </View>
            {d.appliance ? (
              <View style={[styles.whoCol, styles.whoRight]} accessible accessibilityLabel={`Appliance ${d.appliance}`}>
                <Text style={styles.whoLabel}>APPLIANCE</Text>
                <Text style={styles.whoValue}>{d.appliance}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={billStyles.section}>
          <SectionHead label={`Parts · ${d.parts.length}`} />
          {d.parts.map((p) => (
            <View key={p.key} style={styles.part} accessible accessibilityLabel={[p.name, p.number ? `Part number ${p.number}` : null].filter(Boolean).join(', ')}>
              <Text style={styles.partName}>{p.name}</Text>
              {p.number ? <Text style={styles.partNumber}>{`Part # ${p.number}`}</Text> : null}
            </View>
          ))}
          <View style={styles.total} accessible accessibilityLabel={`Estimate total ${d.total}`}>
            <Text style={styles.totalLabel}>Estimate total</Text>
            <Text style={styles.totalValue}>{d.total}</Text>
          </View>
        </View>

        <View style={billStyles.section}>
          <SectionHead label="Where it is" />
          <View style={styles.steps}>
            {d.steps.map((s, i) => (
              <View key={s.key} style={styles.step} accessible accessibilityLabel={`${s.label}${s.state === 'now' ? ', now' : s.state === 'done' ? ', done' : ''}`}>
                <View style={styles.rail}>
                  {i > 0 ? <View style={[styles.line, (s.state === 'done' || s.state === 'now') && styles.lineDone]} /> : <View style={styles.lineNone} />}
                  <View style={[styles.dot, s.state === 'done' && styles.dotDone, s.state === 'now' && styles.dotNow]} />
                  {i < d.steps.length - 1 ? <View style={[styles.line, s.state === 'done' && styles.lineDone]} /> : <View style={styles.lineNone} />}
                </View>
                <Text style={[styles.stepText, s.state === 'done' && styles.stepDone, s.state === 'now' && styles.stepNow]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {d.note ? (
          <View style={billStyles.section}>
            <SectionHead label="Note from the office" />
            <View style={styles.note}><Box kind="info" icon="message" text={d.note} /></View>
          </View>
        ) : null}
      </ScrollView>
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headLine: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.fgSecondary },
  who: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard, overflow: 'hidden' },
  whoCol: { flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 14 },
  whoRight: { borderLeftWidth: 1, borderLeftColor: colors.borderDefault },
  whoLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.fgMutedField },
  whoValue: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  whoSub: { fontSize: 14, color: colors.fgSecondary },
  part: { gap: 2, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  partName: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  partNumber: { fontSize: 15, color: colors.fgSecondary, fontVariant: ['tabular-nums'] },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, paddingHorizontal: 16 },
  totalLabel: { fontSize: 16, color: colors.fgSecondary },
  totalValue: { fontSize: 17, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  steps: { paddingHorizontal: 16, paddingBottom: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  rail: { width: 18, alignSelf: 'stretch', alignItems: 'center' },
  line: { flex: 1, width: 2, backgroundColor: colors.borderDefault },
  lineDone: { backgroundColor: colors.brandPressed },
  lineNone: { flex: 1 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  dotDone: { borderWidth: 0, backgroundColor: colors.brandPressed },
  dotNow: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: colors.brandSoft, backgroundColor: colors.brandPressed },
  stepText: { flex: 1, fontSize: 15, color: colors.fgMutedField },
  stepDone: { color: colors.fgSecondary },
  stepNow: { fontWeight: '800', color: colors.fgDefault },
  note: { paddingHorizontal: 16, paddingBottom: 14 },
});
