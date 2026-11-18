// The text under a line in Edit line (QUEUE 8-5, BILL_LINE_TEXTS_SPEC.md §3): the text folded
// to three lines, where it comes from, Edit (the whole screen to write in), Reset to default
// for a price book line edited here, and «Changes apply to this bill only». The words are
// src/bill/lineText.js; the line's Done saves it with the rest of the line.
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { TopBar } from './parts';
import { TEXT_MAX, THIS_BILL_ONLY, countText } from './lineText';

// text: the line's text now; source: textSourceOf(…); onEdit(), onReset()
export function LineTextBlock({ text, source, onEdit, onReset, off = false }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140 || text.split('\n').length > 3;
  return (
    <View style={styles.block}>
      <TouchableOpacity style={styles.card} onPress={onEdit} disabled={off} accessibilityRole="button"
        accessibilityLabel={text ? `Text under the line: ${text}. Edit` : 'Add text under the line'}>
        {text ? (
          <Text style={styles.text} numberOfLines={open ? undefined : 3}>{text}</Text>
        ) : (
          <View style={styles.empty}>
            <Icon name="plus" size={18} color={colors.brandPressed} />
            <Text style={styles.emptyText}>Add text under the line</Text>
          </View>
        )}
      </TouchableOpacity>
      {text || source.label ? (
        <View style={styles.foot}>
          <Text style={styles.from}>{source.label || ''}</Text>
          {long ? (
            <TouchableOpacity style={styles.link} onPress={() => setOpen((o) => !o)} accessibilityRole="button">
              <Text style={styles.linkText}>{open ? 'Show less' : 'Show all'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <View style={styles.actions}>
        {text ? (
          <TouchableOpacity style={styles.link} onPress={onEdit} disabled={off} accessibilityRole="button">
            <Icon name="note" size={18} color={colors.brandPressed} />
            <Text style={styles.linkText}>Edit text</Text>
          </TouchableOpacity>
        ) : null}
        {source.reset ? (
          <TouchableOpacity style={styles.link} onPress={onReset} disabled={off} accessibilityRole="button">
            <Icon name="undo" size={18} color={colors.brandPressed} />
            <Text style={styles.linkText}>Reset to default</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.only}>{THIS_BILL_ONLY}</Text>
    </View>
  );
}

// The whole screen to write the text: Cancel / Text under the line / Done; the count of letters
export function LineTextEditor({ visible, text, lineName, onDone, onClose }) {
  const [value, setValue] = useState(text);
  useEffect(() => { if (visible) setValue(text); }, [visible, text]);
  const cancel = () => {
    if (value === text) { onClose(); return; }
    Alert.alert('Discard this text?', 'The line keeps the text it had.', [
      { text: 'Keep writing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={cancel}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <TopBar back="Line" title="Text under the line" onBack={cancel} right="Done" onRight={() => onDone(value)} wide={false} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editBody}>
            {lineName ? <Text style={styles.editFor} numberOfLines={1}>{lineName}</Text> : null}
            <TextInput style={styles.editField} value={value} onChangeText={setValue} multiline autoFocus
              maxLength={TEXT_MAX} textAlignVertical="top" placeholder="What the customer reads under this line, e.g. The control board needs to be replaced."
              placeholderTextColor={colors.fgMutedField} accessibilityLabel="Text under the line" />
            <View style={styles.editFoot}>
              <Text style={styles.only}>{THIS_BILL_ONLY}</Text>
              {countText(value) ? <Text style={styles.count}>{countText(value)}</Text> : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: 6 },
  card: { minHeight: 56, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, backgroundColor: colors.bgCard, justifyContent: 'center' },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  from: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  linkText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  only: { fontSize: 13, lineHeight: 18, color: colors.fgSecondary },
  screen: { flex: 1, backgroundColor: colors.bgCard },
  editBody: { flex: 1, padding: 16, gap: 10 },
  editFor: { fontSize: 15, fontWeight: '700', color: colors.fgSecondary },
  editField: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderControl, fontSize: 17, lineHeight: 24, color: colors.fgDefault },
  editFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  count: { fontSize: 13, fontWeight: '600', color: colors.fgSecondary, fontVariant: ['tabular-nums'] },
});
