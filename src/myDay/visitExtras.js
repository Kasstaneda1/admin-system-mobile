// Notes and photos on the visit (APP-3b; design A3 final-note and the «Add note · Photo» row
// under Notes; the photos have no design of their own yet: thumbnails, a sheet to take or
// choose, a full-screen look). What may be added and how a failure reads is notesPhotos.js.
// Sizes in pt, colours only tokens.
import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { photoUri } from '../services/api';
import { photoSource } from './notesPhotos';
import Icon from './Icon';
import { Sheet } from './visitBar';
import { NOTE_CHIPS, NOTE_MAX, noteLength, noteReady, withChip } from './notesPhotos';

// «Add note» and «Photo» under the notes (design: two small outlined buttons); blocked:
// 'Needs connection' while the phone shows what it kept, or null
export function ExtrasRow({ blocked, onNote, onPhoto }) {
  const off = !!blocked;
  return (
    <View style={s.rowWrap}>
      <View style={s.row}>
        <TouchableOpacity style={[s.small, off && s.off]} disabled={off} onPress={onNote} accessibilityRole="button" accessibilityState={{ disabled: off }}>
          <Icon name="note" size={18} color={colors.brandPressed} />
          <Text style={s.smallText}>Add note</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.small, off && s.off]} disabled={off} onPress={onPhoto} accessibilityRole="button" accessibilityState={{ disabled: off }}>
          <Icon name="camera" size={18} color={colors.brandPressed} />
          <Text style={s.smallText}>Photo</Text>
        </TouchableOpacity>
      </View>
      {blocked ? <Text style={s.blocked}>{blocked}</Text> : null}
    </View>
  );
}

// «Add a note»: the field, ready words, Save note. sending: the save waits for the server;
// failure: the words of no answer (Try again sends the same note with the same id)
export function NoteSheet({ visible, text, sending, failure, bottom, onChangeText, onSave, onClose }) {
  const ready = noteReady(text);
  const off = sending || !ready;
  const length = noteLength(text);
  return (
    <Sheet visible={visible} onClose={sending ? () => {} : onClose} bottom={bottom} keyboard>
      <Text style={s.title} accessibilityRole="header">Add a note</Text>
      <Text style={s.sub}>The office and the next technician will see it.</Text>
      <TextInput style={s.field} value={text} onChangeText={onChangeText} multiline autoFocus editable={!sending}
        maxLength={NOTE_MAX} placeholder="What should the office know?" placeholderTextColor={colors.fgMutedField}
        textAlignVertical="top" accessibilityLabel="Note" />
      {length > NOTE_MAX - 200 ? <Text style={s.count}>{`${length} / ${NOTE_MAX}`}</Text> : null}
      <View style={s.chips}>
        {NOTE_CHIPS.map((chip) => (
          <TouchableOpacity key={chip} style={s.chip} disabled={sending} onPress={() => onChangeText(withChip(text, chip))} accessibilityRole="button"
            accessibilityLabel={`Add: ${chip}`}>
            <Text style={s.chipText}>{chip}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {failure ? (
        <View style={s.fail} accessibilityRole="alert">
          <Icon name="wifioff" size={16} color={colors.warningFg} />
          <Text style={s.failText}>{failure}</Text>
        </View>
      ) : null}
      <TouchableOpacity style={[s.primary, off && s.off]} disabled={off} onPress={onSave} accessibilityRole="button"
        accessibilityState={{ disabled: off, busy: !!sending }}>
        {sending ? <ActivityIndicator color={colors.fgOnFill} /> : (
          <>
            <Icon name="check" size={20} color={colors.fgOnFill} />
            <Text style={s.primaryText}>{failure ? 'Try again' : 'Save note'}</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={s.plain} onPress={onClose} disabled={!!sending} accessibilityRole="button">
        <Text style={s.plainText}>Cancel</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

// «Add a photo»: take one or choose one. The camera opens after the sheet has gone (onDismiss)
export function PhotoSheet({ visible, bottom, onCamera, onLibrary, onClose, onDismiss }) {
  return (
    <Sheet visible={visible} onClose={onClose} bottom={bottom} onDismiss={onDismiss}>
      <Text style={s.title} accessibilityRole="header">Add a photo</Text>
      <Text style={s.sub}>The office sees it on this visit.</Text>
      <TouchableOpacity style={s.primary} onPress={onCamera} accessibilityRole="button">
        <Icon name="camera" size={20} color={colors.fgOnFill} />
        <Text style={s.primaryText}>Take a photo</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.ghost} onPress={onLibrary} accessibilityRole="button">
        <Text style={s.ghostText}>Choose from library</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.plain} onPress={onClose} accessibilityRole="button">
        <Text style={s.plainText}>Cancel</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

// One photo from the server with the technician's token; a quiet tile when it cannot load
function ServerImage({ photo, header, style, resizeMode = 'cover' }) {
  const [broken, setBroken] = useState(false);
  if (broken || !header) {
    return (
      <View style={[style, s.broken]}>
        <Icon name="camera" size={22} color={colors.fgMutedField} />
      </View>
    );
  }
  return (
    <Image source={photoSource(photoUri(photo.path), header)} style={style} resizeMode={resizeMode}
      onError={() => setBroken(true)} accessibilityIgnoresInvertColors />
  );
}

// The photos of the visit: thumbnails, newest first; a tile while one is being sent; under
// them, a photo that got no answer, with Try again and Cancel.
// photos: photosOf() or null (not loaded); upload: { sending, failed } or null
export function PhotoGrid({ photos, header, upload, waiting, onOpen, onRetry, onCancel }) {
  return (
    <View>
      {photos === null && !upload ? <Text style={s.quiet}>{waiting}</Text> : null}
      {photos !== null && !photos.length && !upload ? <Text style={s.quiet}>No photos yet</Text> : null}
      {(photos && photos.length) || (upload && upload.sending) ? (
        <View style={s.grid}>
          {upload && upload.sending ? (
            <View style={[s.thumb, s.sending]} accessibilityLabel="Sending the photo">
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : null}
          {(photos || []).map((photo, i) => (
            <TouchableOpacity key={photo.key} onPress={() => onOpen(i)} accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${i + 1}${photo.when ? `, ${photo.when}` : ''}`}>
              <ServerImage photo={photo} header={header} style={s.thumb} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {upload && upload.failed ? (
        <View style={s.failBox} accessibilityRole="alert">
          <View style={s.failLine}>
            <Icon name="wifioff" size={16} color={colors.warningFg} style={s.failIcon} />
            <Text style={s.failText}>{upload.failed}</Text>
          </View>
          <View style={s.failActions}>
            <TouchableOpacity style={s.failBtn} onPress={onRetry} accessibilityRole="button">
              <Text style={s.failBtnText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.failCancel} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel the photo">
              <Text style={s.failCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// A photo full screen; index into photos, or null when closed
export function PhotoViewer({ photos, index, header, onClose }) {
  const insets = useSafeAreaInsets();
  const photo = photos && index !== null && index >= 0 ? photos[index] : null;
  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.viewerTop}>
          <Text style={s.viewerText} numberOfLines={1}>
            {photo ? [`Photo ${index + 1} of ${photos.length}`, photo.when].filter(Boolean).join(' · ') : ''}
          </Text>
          <TouchableOpacity style={s.viewerClose} onPress={onClose} accessibilityRole="button">
            <Text style={s.viewerCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
        {photo ? <ServerImage photo={photo} header={header} style={s.viewerImage} resizeMode="contain" /> : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  rowWrap: { marginTop: 12, gap: 6 },
  row: { flexDirection: 'row', gap: 10 },
  small: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPressed, backgroundColor: colors.bgCard },
  smallText: { fontSize: 16, fontWeight: '700', color: colors.brandPressed },
  off: { opacity: 0.45 },
  blocked: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary, textAlign: 'center' },
  quiet: { fontSize: 16, color: colors.fgSecondary },

  title: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  field: { minHeight: 110, maxHeight: 200, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.focusRing, fontSize: 16, lineHeight: 22, color: colors.fgDefault, backgroundColor: colors.bgCard },
  count: { alignSelf: 'flex-end', marginTop: -4, fontSize: 13, color: colors.fgMutedField },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.fgDefault },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 14, backgroundColor: colors.brandPressed },
  primaryText: { fontSize: 18, fontWeight: '700', color: colors.fgOnFill },
  ghost: { height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brandPressed, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  plain: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  plainText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault, textDecorationLine: 'underline' },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.warningFg },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: colors.bgSunken },
  sending: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderDefault },
  broken: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSunken },
  // the photo that got no answer: its words on the first line, Try again and Cancel on the second
  failBox: { gap: 10, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  failIcon: { marginTop: 2 },
  failActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  failBtn: { height: 44, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  failBtnText: { fontSize: 15, fontWeight: '700', color: colors.fgOnFill },
  failCancel: { height: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  failCancelText: { fontSize: 15, fontWeight: '600', color: colors.warningFg, textDecorationLine: 'underline' },

  viewer: { flex: 1, backgroundColor: colors.fgDefault },
  viewerTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  viewerText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.fgOnFill },
  viewerClose: { height: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  viewerCloseText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill, textDecorationLine: 'underline' },
  viewerImage: { flex: 1, width: '100%' },
});
