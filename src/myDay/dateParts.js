// Picking the day on My day (design-mockups/app-myday-date, the owner from the phone, build 1:
// «no Today button; not clear whether the days swipe; a calendar would be nice»):
// - DateBar: ‹ a day back · [calendar · the day ▾] opens the month · › a day forward. The arrows
//   stay where they are on every day (QA before build 2: two taps on › in one place hit Today and
//   went back): ‹ at the left end, › at the right end; Today, only when another day is open, comes
//   in between the day and ›, the day's button gives it the room;
// - DaySheet: «Pick a day» with Today, the month with ‹ ›, today ringed, the open day filled, a
//   dot under the days with visits the phone already knows (datePick.js knownCounts); Today only
//   when another day is open, as in the bar. A tap on
//   a day opens it and closes the sheet; no OK / Cancel (a tap on the dim or a drag down closes).
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from './Icon';
import { Sheet } from './visitBar';
import { addMonths, dateButtonText, dayCellLabel, monthOf, monthRows, monthTitle } from './datePick';

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function TodayPill({ onPress }) {
  return (
    <TouchableOpacity style={styles.today} onPress={onPress} accessibilityRole="button" accessibilityLabel="Today">
      <Text style={styles.todayText}>Today</Text>
    </TouchableOpacity>
  );
}

export function DateBar({ selected, today, onStep, onPick, onToday }) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.pick} onPress={onPick} accessibilityRole="button"
        accessibilityLabel={`${dateButtonText(selected, today)}. Pick a day`}>
        <Icon name="cal" size={18} color={colors.brandPressed} />
        <Text style={styles.pickText} numberOfLines={1}>{dateButtonText(selected, today)}</Text>
        <Icon name="chevd" size={16} color={colors.fgMutedField} />
      </TouchableOpacity>
      {selected !== today ? <TodayPill onPress={onToday} /> : null}
      <TouchableOpacity style={styles.step} onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel="Previous day">
        <Icon name="back" size={22} color={colors.brandPressed} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.step} onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel="Next day">
        <Icon name="chev" size={22} color={colors.brandPressed} />
      </TouchableOpacity>
    </View>
  );
}

export function DaySheet({ visible, selected, today, counts, bottom, onPick, onClose }) {
  // the month shown: the open day's, each time the sheet opens. A layout effect, not a plain one:
  // it runs before the frame is drawn, so the sheet never slides in with the month left from the
  // last time (the Teamlead's note on #75)
  const [month, setMonth] = useState(monthOf(selected));
  useLayoutEffect(() => { if (visible) setMonth(monthOf(selected)); }, [visible, selected]);
  const rows = useMemo(() => monthRows(month), [month]);
  // a drag down closes the sheet, as the grab on its top says
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx) * 2,
    onPanResponderRelease: (_, g) => { if (g.dy > 60) closeRef.current(); },
  })).current;
  return (
    <Sheet visible={visible} onClose={onClose} bottom={bottom}>
      <View {...pan.panHandlers} style={styles.sheetBody}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">Pick a day</Text>
          {selected !== today ? <TodayPill onPress={() => onPick(today)} /> : null}
        </View>
        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.step} onPress={() => setMonth((m) => addMonths(m, -1))} accessibilityRole="button" accessibilityLabel="Previous month">
            <Icon name="back" size={22} color={colors.brandPressed} />
          </TouchableOpacity>
          <Text style={styles.monthText} accessibilityRole="header">{monthTitle(month)}</Text>
          <TouchableOpacity style={styles.step} onPress={() => setMonth((m) => addMonths(m, 1))} accessibilityRole="button" accessibilityLabel="Next month">
            <Icon name="chev" size={22} color={colors.brandPressed} />
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            {LETTERS.map((l, i) => <View key={i} style={styles.cell}><Text style={styles.letter}>{l}</Text></View>)}
          </View>
          {rows.map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((date, i) => {
                if (!date) return <View key={i} style={styles.cell} />;
                const on = date === selected;
                const isToday = date === today;
                const count = counts ? counts[date] : undefined;
                return (
                  <View key={date} style={styles.cell}>
                    <TouchableOpacity style={[styles.day, isToday && styles.dayToday, on && styles.dayOn]} onPress={() => onPick(date)}
                      accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={dayCellLabel(date, today, count)}>
                      <Text style={[styles.dayText, isToday && styles.dayTextToday, on && styles.dayTextOn]}>{Number(date.slice(8, 10))}</Text>
                      {count > 0 ? <View style={[styles.dot, on && styles.dotOn]} /> : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>Days with your visits</Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // the calm look: the day as plain words on the left (no frame), Today and the arrows on the right
  bar: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6, marginRight: -8 },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  // the room left of Today and the arrows: the arrows keep their places whatever the day's width
  pick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  pickText: { flexShrink: 1, fontSize: 17, fontWeight: '600', color: colors.fgDefault },
  today: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderControl, borderRadius: 10, backgroundColor: colors.bgCard },
  todayText: { fontSize: 15, fontWeight: '600', color: colors.brandPressed },

  sheetBody: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  title: { fontSize: 20, fontWeight: '700', color: colors.fgDefault },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthText: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  grid: { gap: 2 },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 24 },
  letter: { fontSize: 13, fontWeight: '700', color: colors.fgMutedField },
  day: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1, borderColor: colors.brand },
  dayOn: { backgroundColor: colors.brand, borderWidth: 0 },
  dayText: { fontSize: 16, color: colors.fgDefault },
  dayTextToday: { color: colors.brandPressed, fontWeight: '700' },
  dayTextOn: { color: colors.fgOnFill, fontWeight: '700' },
  dot: { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand },
  dotOn: { backgroundColor: colors.fgOnFill },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  legendText: { fontSize: 13, color: colors.fgMutedField },
});
