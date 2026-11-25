// More, the last tab (design-mockups/app-more, style A3 like Salary and Parts): the technician
// who is signed in, the screens with no tab of their own — Warehouse, Payments, Receipts, Unpaid —
// Sign out (asked once) and the app's version. Words and rows in src/more/model.js.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import Icon from '../myDay/Icon';
import { SalaryFrame, TabTitle } from '../salary/parts';
import { MORE_SECTIONS, SIGN_OUT, initials, nameLine, roleLine, signedInLine, versionLine } from '../more/model';
import appConfig from '../../app.json';
import { nativeVersion } from '../utils/nativeVersion';
import { askPush, openPushSettings, pushState, registerDevice } from '../push/push';
import { pushRowOf } from '../push/model';

const VERSION = versionLine(appConfig, nativeVersion());

// Push on this phone, read on every opening of More and on return from Settings; turned on in
// Settings — the phone goes to the server at once
function usePushState() {
  const [state, setState] = useState(null);
  const last = useRef(null);
  const read = useCallback(async () => {
    const now = await pushState();
    if (now === 'on' && last.current === 'off') registerDevice({ fresh: true });
    last.current = now;
    setState(now);
  }, []);
  // 'ask': the system window here (after it the state is read again)
  const ask = useCallback(async () => {
    const now = await askPush();
    last.current = now;
    setState(now);
  }, []);
  useFocusEffect(useCallback(() => { read(); }, [read]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => { if (next === 'active') read(); });
    return () => sub.remove();
  }, [read]);
  return { state, ask };
}

export default function MoreScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const login = signedInLine(user);
  const push = usePushState();
  const pushOff = pushRowOf(push.state);

  const askSignOut = () => {
    Alert.alert(SIGN_OUT.title, SIGN_OUT.text, [
      { text: SIGN_OUT.cancel, style: 'cancel' },
      // The session ends here and on the server; the app shows sign in by itself
      { text: SIGN_OUT.confirm, style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SalaryFrame navigation={navigation} top={<TabTitle title="More" />} tab="More">
      <ScrollView contentContainerStyle={styles.body}>
        {pushOff ? (
          <View style={styles.pad}>
            <View style={styles.off} accessible accessibilityLabel={`${pushOff.title}. ${pushOff.text}`}>
              <View style={styles.offHead}>
                <Icon name="warn" size={22} color={colors.warningFg} />
                <View style={styles.offText}>
                  <Text style={styles.offTitle}>{pushOff.title}</Text>
                  <Text style={styles.offSub}>{pushOff.text}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.offButton} onPress={pushOff.action === 'settings' ? openPushSettings : push.ask} accessibilityRole="button">
                <Text style={styles.offButtonText}>{pushOff.button}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        <View style={styles.pad}>
          <View style={styles.me} accessible accessibilityLabel={[nameLine(user), roleLine(user), login].filter(Boolean).join(', ')}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials(user)}</Text></View>
            <View style={styles.who}>
              <Text style={styles.name} numberOfLines={1}>{nameLine(user)}</Text>
              <Text style={styles.role} numberOfLines={1}>{roleLine(user)}</Text>
              {login ? <Text style={styles.login} numberOfLines={1}>{login}</Text> : null}
            </View>
          </View>
        </View>

        {MORE_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel} accessibilityRole="header">{section.title.toUpperCase()}</Text>
            </View>
            {section.rows.map((row, i) => (
              <TouchableOpacity key={row.screen} style={[styles.row, i > 0 && styles.rowLine]}
                onPress={() => navigation.navigate(row.screen, { from: 'More' })}
                accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.sub}`}>
                <View style={styles.tile}><Icon name={row.icon} size={22} color={colors.brandPressed} /></View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowSub}>{row.sub}</Text>
                </View>
                <Icon name="chev" size={18} color={colors.fgMutedField} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={[styles.pad, styles.out]}>
          <TouchableOpacity style={styles.signOut} onPress={askSignOut} accessibilityRole="button">
            <Icon name="door" size={20} color={colors.dangerFg} />
            <Text style={styles.signOutText}>{SIGN_OUT.button}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.version}>{VERSION}</Text>
      </ScrollView>
    </SalaryFrame>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 24 },
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  avatarText: { fontSize: 19, fontWeight: '800', color: colors.brandSoftFg },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.fgDefault },
  role: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  login: { fontSize: 14, lineHeight: 19, color: colors.fgMutedField },
  off: { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  offHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  offText: { flex: 1, minWidth: 0 },
  offTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.warningFg },
  offSub: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  offButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.warningBorder, backgroundColor: colors.bgCard },
  offButtonText: { fontSize: 16, fontWeight: '700', color: colors.warningFg },
  section: { marginTop: 14, backgroundColor: colors.bgCard, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderSubtle },
  sectionHead: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingTop: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.fgMutedField },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  rowSub: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  out: { paddingTop: 24 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard },
  signOutText: { fontSize: 17, fontWeight: '700', color: colors.dangerFg },
  version: { marginTop: 12, textAlign: 'center', fontSize: 13, color: colors.fgMutedField },
});
