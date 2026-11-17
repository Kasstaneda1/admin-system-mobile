// Salary, Job Details (design-mockups/app-salary-parts salary-job; site renderJobDetail): the
// work status and the date; Customer; Work Details (Status, Payment, Payment Status); Your
// Earnings — how the salary was counted (Amount − Tax − Parts = Base, Your share), or a note
// where the job earns nothing yet, then Salary, Cash Received and the check.
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import { Tag } from '../myDay/parts';
import { Box, SectionHead, TopBar, billStyles } from '../bill/parts';
import { detailOf } from '../salary/model';
import { KvRows, SalaryFrame, salaryStyles } from '../salary/parts';

export default function SalaryJobScreen({ route, navigation }) {
  const { job = {} } = route.params || {};
  const d = useMemo(() => detailOf(job), [job]);
  const earnings = [...d.rows, { key: 'Salary', label: 'Salary', value: d.salary, kind: 'salary' }, ...d.after];
  const helper = String(job.work_status || '').toLowerCase() === '2nd tech payout';

  return (
    <SalaryFrame navigation={navigation} top={<TopBar back="Jobs" title="Job Details" onBack={() => navigation.goBack()} />}>
      <ScrollView contentContainerStyle={salaryStyles.bottomSpace}>
        <View style={styles.head}>
          <Tag tag={d.tag} big fixed />
          <Text style={styles.date}>{d.date}</Text>
        </View>
        <View style={billStyles.section}>
          <SectionHead label="Customer" />
          <View style={styles.who}>
            <Text style={styles.client}>{d.client}</Text>
            {d.company ? <Text style={styles.company}>{d.company}</Text> : null}
          </View>
        </View>
        <View style={billStyles.section}>
          <SectionHead label="Work Details" />
          <KvRows rows={d.work} />
        </View>
        <View style={billStyles.section}>
          <SectionHead label="Your Earnings" />
          {d.note ? <View style={styles.note}><Box kind={helper ? 'plain' : 'warn'} icon={helper ? 'people' : 'info'} text={d.note} /></View> : null}
          <KvRows rows={earnings} />
        </View>
      </ScrollView>
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingTop: 4 },
  date: { fontSize: 15, fontWeight: '600', color: colors.fgSecondary },
  who: { gap: 2, paddingHorizontal: 16, paddingBottom: 14 },
  client: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  company: { fontSize: 15, color: colors.fgSecondary },
  note: { paddingHorizontal: 16, paddingBottom: 12 },
});
