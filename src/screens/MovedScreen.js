// A grey row of the day log, opened: the visit the office took off this day, read only
// (moved.js says what it shows and why). Made from the row My day passes, so it needs no
// connection and asks the server nothing. Design final-a3, «Visit · moved by the office»:
// no Directions, no Call, no actions; the bar at the bottom only goes back.
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { nowWall } from '../myDay/model';
import { movedCard } from '../myDay/moved';
import { Tag } from '../myDay/parts';
import Icon from '../myDay/Icon';

export default function MovedScreen({ route, navigation }) {
  const { visit = null, date = null, skew = 0 } = route.params || {};
  const insets = useSafeAreaInsets();
  const card = useMemo(() => (visit ? movedCard(visit, nowWall(Date.now(), skew), date) : null), [visit, date, skew]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to My day">
          <Icon name="back" size={20} color={colors.fgDefault} />
          <Text style={styles.backText}>My day</Text>
        </TouchableOpacity>
      </View>

      {card ? (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.head}>
            <View style={styles.tagRow}>
              <Tag tag={card.tag} big />
              {card.kindLine ? <Text style={styles.kindLine} numberOfLines={1}>{card.kindLine}</Text> : null}
            </View>
            <Text style={styles.name} accessibilityRole="header">{card.name}</Text>
            {card.address.line1 ? <Text style={styles.addr1}>{card.address.line1}</Text> : null}
            {card.address.line2 ? <Text style={styles.addr2}>{card.address.line2}</Text> : null}

            <View style={styles.box} accessible accessibilityRole="summary" accessibilityLabel={`${card.box.title}. ${card.box.text}`}>
              <Icon name={card.tag.icon} size={18} color={colors.fgDefault} style={styles.boxIcon} />
              <View style={styles.boxBody}>
                <Text style={styles.boxTitle}>{card.box.title}</Text>
                <Text style={styles.boxText}>{card.box.text}</Text>
              </View>
            </View>

            <View style={styles.tiles}>
              {card.tiles.map((t) => (
                <View key={t.key} style={styles.tile} accessible accessibilityLabel={`${t.label} was ${t.big} ${t.small}`.trim()}>
                  <Text style={styles.tileLabel}>{t.label.toUpperCase()}</Text>
                  <Text style={[styles.tileBig, t.big.length > 6 && styles.tileBigLong, t.struck && styles.struck]} numberOfLines={1} adjustsFontSizeToFit>{t.big}</Text>
                  {t.small ? <Text style={styles.tileSmall} numberOfLines={1}>{t.small}</Text> : null}
                </View>
              ))}
            </View>
            <Text style={styles.was}>{card.was}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel} accessibilityRole="header">PROBLEM</Text>
            <Text style={card.problem ? styles.text : styles.quiet}>{card.problem || 'No description'}</Text>
            {card.appliances.map((a) => (
              <View key={a.key} style={styles.appliance}>
                <Icon name="wrench" size={14} color={colors.fgSecondary} />
                <Text style={styles.applianceText}>
                  <Text style={styles.applianceType}>{a.type}</Text>
                  {a.model ? `  ${a.model}` : ''}
                  {a.serial ? `  ·  ${a.serial}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.noData}>
          <Text style={styles.quiet}>Nothing to show for this visit.</Text>
        </View>
      )}

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.backWide} onPress={() => navigation.goBack()} accessibilityRole="button">
          <Icon name="back" size={18} color={colors.brandPressed} />
          <Text style={styles.backWideText}>Back to my day</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// As the visit card's (VisitScreen), the box as the design's .moved-box
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingLeft: 4, paddingRight: 14, borderRadius: 22 },
  backText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault },
  body: { paddingBottom: 32 },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  kindLine: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary, flexShrink: 1 },
  name: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.fgDefault },
  addr1: { fontSize: 17, lineHeight: 22, color: colors.fgDefault, marginTop: 2 },
  addr2: { fontSize: 17, lineHeight: 22, color: colors.fgSecondary },
  box: { flexDirection: 'row', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.bgSubtle },
  boxIcon: { marginTop: 1 },
  boxBody: { flex: 1 },
  boxTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.fgDefault },
  boxText: { fontSize: 15, lineHeight: 20, color: colors.fgDefault },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tile: { flex: 1, minHeight: 74, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle },
  tileLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.fgSecondary },
  tileBig: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.fgDefault },
  tileBigLong: { fontSize: 18, lineHeight: 32 },
  tileSmall: { fontSize: 12, fontWeight: '600', color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through', color: colors.fgMutedField },
  was: { marginTop: 6, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 8, borderTopWidth: 10, borderTopColor: colors.bgPage },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  quiet: { fontSize: 15, lineHeight: 20, color: colors.fgMutedField },
  appliance: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applianceText: { flex: 1, fontSize: 15, color: colors.fgSecondary },
  applianceType: { fontWeight: '700', color: colors.fgDefault },
  noData: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  bar: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderDefault, backgroundColor: colors.bgCard },
  backWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.bgCard },
  backWideText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
});
