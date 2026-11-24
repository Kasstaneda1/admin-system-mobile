// The sheet before the system window for notifications (design-mockups/app-more README
// «Уведомления»): once on this phone, over My day after the first sign in, while notifications
// were never asked. «Turn on notifications» — the system window once the sheet has gone; «Not
// now» or a tap outside — closed for good (the More card stays the way to turn them on).
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { Sheet } from '../myDay/visitBar';
import { PUSH_PROMPT, promptDue } from './model';
import { askPush, markPromptShown, promptShown, pushState } from './push';

export default function PushPrompt({ bottom }) {
  const [visible, setVisible] = useState(false);
  const want = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [state, shown] = await Promise.all([pushState(), promptShown()]);
      if (alive && promptDue(state, shown)) setVisible(true);
    })();
    return () => { alive = false; };
  }, []);
  const close = (turnOn) => {
    want.current = turnOn;
    markPromptShown();
    setVisible(false);
  };
  // the system window opens once the sheet is gone (it would not over a closing sheet)
  const gone = () => {
    if (!want.current) return;
    want.current = false;
    askPush();
  };
  return (
    <Sheet visible={visible} onClose={() => close(false)} onDismiss={gone} bottom={bottom}>
      <View style={styles.body}>
        <View style={styles.badge}><Icon name="info" size={28} color={colors.brand} /></View>
        <Text style={styles.title} accessibilityRole="header">{PUSH_PROMPT.title}</Text>
        <Text style={styles.text}>{PUSH_PROMPT.text}</Text>
        <TouchableOpacity style={styles.yes} onPress={() => close(true)} accessibilityRole="button">
          <Text style={styles.yesText}>{PUSH_PROMPT.yes}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.no} onPress={() => close(false)} accessibilityRole="button">
          <Text style={styles.noText}>{PUSH_PROMPT.no}</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingTop: 4 },
  badge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: colors.fgDefault },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary },
  yes: { marginTop: 6, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  yesText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
  no: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noText: { fontSize: 16, fontWeight: '600', color: colors.brandPressed },
});
