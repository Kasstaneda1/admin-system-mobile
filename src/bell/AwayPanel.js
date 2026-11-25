// «Since you were off» on My day (APP-1 part 2; design-mockups/notifications app-bell-off,
// app-bell-off-open): a blue panel under the week, folded to one line of counts; a tap opens the
// list in place (each row opens its visit), «Got it» puts it away. Words — bell/away.js.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { FreshMark } from '../myDay/parts';

export default function AwayPanel({ away, onOpenVisit, onDone }) {
  const [open, setOpen] = useState(false);
  if (!away) return null;
  return (
    <View style={styles.box} accessibilityLabel="Since you were off">
      <TouchableOpacity style={styles.head} onPress={() => setOpen((o) => !o)} accessibilityRole="button"
        accessibilityState={{ expanded: open }} accessibilityLabel={`Since you were off. ${away.line}`}>
        <View style={styles.sun}><Icon name="sun" size={24} color={colors.infoBorder} /></View>
        <View style={styles.headText}>
          <Text style={styles.title}>Since you were off</Text>
          <Text style={styles.line}>{away.line}</Text>
        </View>
        <Icon name="chevd" size={22} color={colors.infoBorder} style={open ? styles.up : null} />
      </TouchableOpacity>
      {open ? (
        <>
          {away.rows.map((r) => (
            <TouchableOpacity key={r.key} style={styles.row} disabled={!r.visitId} onPress={() => onOpenVisit(r.visitId)}
              accessibilityRole={r.visitId ? 'button' : 'text'} accessibilityLabel={`${r.mark}. ${r.title}. ${r.sub}`}>
              <FreshMark kind={r.mark} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{r.sub}</Text>
              </View>
              {r.visitId ? <Icon name="chev" size={18} color={colors.fgSecondary} /> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.got} onPress={onDone} accessibilityRole="button">
            <Text style={styles.gotText}>Got it</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: 12, marginTop: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.infoBorder, backgroundColor: colors.infoBg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 12 },
  sun: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '800', color: colors.fgDefault },
  line: { fontSize: 15, lineHeight: 20, color: colors.infoFg },
  up: { transform: [{ rotate: '180deg' }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.infoBorder, marginHorizontal: 6 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '800', color: colors.fgDefault },
  rowSub: { fontSize: 14, color: colors.fgSecondary },
  got: { margin: 12, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  gotText: { fontSize: 17, fontWeight: '800', color: colors.fgOnFill },
});
