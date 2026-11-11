// A visit (TECH_APP_MY_DAY_SPEC.md §3 «Visit», §4; design A3:
// design-mockups/tech-app/shots/final-visit-*.png). Opens from a row of My day with the
// list's visit, so it shows at once; the card kept on the phone fills in history and notes;
// GET /api/my/visits/:id replaces both. What it shows is visit.js.
// The bar at the bottom (APP-3a): On my way, Finish with its outcome, No access, Undo for
// 15 minutes; the server says what may be pressed (actions.js barOf). A press waits for the
// answer; with none, «No connection. Try again» sends the same request (same client_request_id).
// Notes and photos (APP-3b): «Add note» writes a note (POST /api/my/visits/:id/notes, the same
// id again on Try again), «Photo» takes or chooses one and sends it (POST …/tasks/:id/photos);
// the visit's photos show as thumbnails (notesPhotos.js, visitExtras.js).
// The office's messages (backend #141) under «From the office», the newest first, «NEW» until
// seen; the app marks seen the ones the technician has really had on the screen (officeSeen.js).
// No map at the top (no map key yet, and no fake one).
// UPDATED in My day when it was opened (route param fresh): «Updated by the office · 11:02 AM»
// over the card while it is open, and under each field that changed what it was, from the card
// this phone kept from before (visit.js updatedOf; design notifications «visit-updated»).
// Shown, the visit is seen (fresh.js markSeen, N3-APP): its NEW or UPDATED on My day goes, as of
// the moment of the data shown (the list's or the server's answer; a card kept from before
// counts only when that moment is later than the one already seen).
//
// Fresh: on opening, on coming back to the screen or to the app, on pulling down, after each
// press (§4). The office took the visit away (404): «This visit was changed by the office»,
// back to the day.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { myDayAPI, photosAPI, session } from '../services/api';
import { logError } from '../utils/logError';
import { useAuth } from '../session/AuthContext';
import { failedText, nowWall, offlineText, skewOf, visitDay } from '../myDay/model';
import { markSeen } from '../myDay/fresh';
import { seenMark, updateSeen } from '../myDay/seenStore';
import { dropCard, keepCard, keptCard, updatedOf, visitCard } from '../myDay/visit';
import { actionBody, actionError, barOf, defaultOutcome, finishChoices, finishSubtitle, keepActed, newRequestId, noAccessWords } from '../myDay/actions';
import { myDayMark, readMyDay, updateMyDay } from '../myDay/storage';
import { callCustomer, openDirections } from '../myDay/phoneLinks';
import { NoticeBar, Tag } from '../myDay/parts';
import Icon from '../myDay/Icon';
import { ActionBar, FinishSheet, NoAccessSheet } from '../myDay/visitBar';
import { canAddExtras, noteBody, noteError, noteReady, noteRequest, photoError, photoFile, photosOf, photosTitle } from '../myDay/notesPhotos';
import { ExtrasRow, NoteSheet, PhotoGrid, PhotoSheet, PhotoViewer } from '../myDay/visitExtras';
import { SEEN_REST_MS, onScreen, seenError, toSend } from '../myDay/officeSeen';

export default function VisitScreen({ route, navigation }) {
  const { id, visit: fromList = null, n = null, savedAt: listSavedAt = null, skew: skewIn = 0, fresh = null } = route.params || {};
  // the card this phone kept from before this opening: { visit, at } | null (undefined: not read yet)
  const [before, setBefore] = useState(undefined);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const skew = useRef(skewIn);
  const [tick, setTick] = useState(Date.now());
  const now = useMemo(() => nowWall(tick, skew.current), [tick]);
  // { visit, savedAt, source: 'list' | 'kept' | 'server' }
  const [shown, setShown] = useState(fromList ? { visit: fromList, savedAt: listSavedAt, source: 'list' } : null);
  const [problem, setProblem] = useState(null);         // null | 'offline' | 'failed'
  const [refreshing, setRefreshing] = useState(false);
  const loadSeq = useRef(0);
  const gone = useRef(false);
  const seenHold = useRef(false);                        // «Seen» got no answer: wait for a fresh card
  const insets = useSafeAreaInsets();

  // reassigned or no longer there (404): the card goes from the phone too, back to the day.
  // mark: myDayMark() taken before the request that got the 404
  const leaveGone = useCallback(async (mark) => {
    if (gone.current) return;
    gone.current = true;
    await updateMyDay((cache) => dropCard(cache, userId, id), mark);
    Alert.alert('This visit was changed by the office', 'It is no longer on your day.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  }, [id, userId, navigation]);

  // The visit's photos: the server's rows (null until the first answer) and the header the
  // phone loads them with. Not kept for offline: a photo needs the connection anyway.
  const [photoRows, setPhotoRows] = useState(null);
  const [photoHeader, setPhotoHeader] = useState(null);
  const photoSeq = useRef(0);
  const sameHeader = (h) => (prev) => (prev && h && prev.Authorization === h.Authorization ? prev : h);
  const loadPhotos = useCallback(async () => {
    const seq = ++photoSeq.current;
    try {
      const [rows, header] = await Promise.all([photosAPI.list(id), session.authHeader()]);
      if (seq !== photoSeq.current) return;
      setPhotoRows(Array.isArray(rows) ? rows : []);
      setPhotoHeader(sameHeader(header));
    } catch (error) {
      if (seq !== photoSeq.current) return;
      if (error.response?.status >= 500) logError('Error loading visit photos:', error);
    }
  }, [id]);

  const load = useCallback(async ({ pull = false } = {}) => {
    if (gone.current) return;
    const seq = ++loadSeq.current;
    const mark = myDayMark();                           // an answer after sign out is not kept
    if (pull) setRefreshing(true);
    const kept = await readMyDay();
    const keptOne = keptCard(kept, userId, id);
    setBefore((b) => (b === undefined ? (keptOne ? { visit: keptOne.card, at: keptOne.savedAt } : null) : b));
    // the kept card brings history and notes; the list's visit, fresher, its state
    if (keptOne && seq === loadSeq.current) {
      setShown((s) => (s && s.source === 'server' ? s : { visit: { ...keptOne.card, ...(fromList || {}) }, savedAt: keptOne.savedAt, source: 'kept' }));
    }
    try {
      const data = await myDayAPI.visit(id);
      if (seq !== loadSeq.current || gone.current) return;
      const answeredAt = Date.now();
      skew.current = skewOf(data.server_time, answeredAt);
      const savedAt = answeredAt + skew.current;
      setShown({ visit: data.visit, savedAt, source: 'server' });
      setProblem(null);
      setTick(Date.now());
      seenHold.current = false;
      if (!data.visit.legacy) loadPhotos();
      await updateMyDay((cache) => keepCard(cache, userId, data.visit, savedAt), mark);
    } catch (error) {
      if (seq !== loadSeq.current || gone.current) return;
      const status = error.response?.status;
      if (status === 404) {
        await leaveGone(mark);
        return;
      }
      if (status >= 500) logError('Error loading a visit:', error);
      setProblem(status ? 'failed' : 'offline');
    } finally {
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }, [id, userId, fromList, leaveGone, loadPhotos]);

  // on opening and every time the screen comes back
  useFocusEffect(useCallback(() => { setTick(Date.now()); load(); }, [load]));

  // the technician has this visit on the screen: seen as of the data's moment
  const shownAt = shown ? shown.savedAt : null;
  const shownDay = shown && shown.visit ? visitDay(shown.visit) : null;
  useEffect(() => {
    if (!Number.isFinite(shownAt)) return;
    updateSeen((s) => markSeen(s, userId, [{ id, day: shownDay }], shownAt), seenMark());
  }, [id, userId, shownAt, shownDay]);
  // back to the app
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setTick(Date.now()); load(); }
    });
    return () => sub.remove();
  }, [load]);

  // the office's notes beyond the first two show after «+N more»
  const [officeOpen, setOfficeOpen] = useState(false);
  const card = useMemo(() => (shown ? visitCard(shown.visit, { n, now, officeOpen }) : null), [shown, n, now, officeOpen]);
  // the band and the old words (only for a visit UPDATED when it was opened; stays while open)
  const updated = useMemo(() => (fresh === 'updated' && shown && before !== undefined
    ? updatedOf(shown.visit, before && before.visit, before && before.at) : null), [fresh, shown, before]);
  const notice = problem && shown ? (problem === 'offline' ? offlineText(shown.savedAt, now) : failedText(shown.savedAt, now)) : null;
  // history and notes come only with the card itself
  const waiting = problem ? 'Needs connection' : 'Loading…';

  // ---------- the presses ----------
  // pending: { action, outcome, requestId } from the press until the server answers (kept
  // after no answer: Try again sends it as it was); failure: { text } of that no answer
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);
  const busy = useRef(false);                            // two quick taps send one request
  const [finishOpen, setFinishOpen] = useState(false);
  const [noAccessStep, setNoAccessStep] = useState(null); // null | 'call' | 'close'

  // The visit as the server answered a press or a note: shown, and kept on the phone (the card
  // and its row in the kept week) unless the answer came after sign out (mark)
  const keepFresh = useCallback(async (fresh, mark) => {
    const savedAt = Date.now() + skew.current;
    setShown({ visit: fresh, savedAt, source: 'server' });
    setProblem(null);
    setTick(Date.now());
    await updateMyDay((cache) => keepActed(cache, userId, fresh, savedAt), mark);
  }, [userId]);

  const send = useCallback(async ({ action, outcome = null, requestId }) => {
    if (busy.current || gone.current) return;
    busy.current = true;
    const mark = myDayMark();
    setPending({ action, outcome, requestId });
    setFailure(null);
    const keep = (fresh) => keepFresh(fresh, mark);
    try {
      const data = await myDayAPI.act(id, actionBody(action, outcome, requestId));
      setPending(null);
      if (data && data.visit) await keep(data.visit);
    } catch (error) {
      const failed = actionError(error);
      if (failed.kind === 'gone') {
        setPending(null);
        await leaveGone(mark);
      } else if (failed.kind === 'outcome') {
        // not an outcome of this kind of visit (the office changed it meanwhile): the fresh
        // visit with its outcomes, and «How did it end?» again with them
        setPending(null);
        if (failed.visit) await keep(failed.visit);
        else setShown((s) => (s ? { ...s, visit: { ...s.visit, finish_outcomes: failed.outcomes } } : s));
        Alert.alert('The office changed this visit', failed.text,
          [{ text: 'OK', onPress: () => { if (failed.outcomes.length) setFinishOpen(true); } }]);
      } else if (failed.kind === 'refused') {
        // the server's words, and the visit as it is now (another phone, the office, 15 minutes)
        setPending(null);
        if (failed.visit) await keep(failed.visit);
        Alert.alert(failed.text);
      } else {
        if (failed.kind === 'failed') logError('Error sending a visit action:', error);
        setFailure({ text: failed.text });
      }
    } finally {
      busy.current = false;
    }
  }, [id, keepFresh, leaveGone]);

  // a new press: a new request id; Finish and No access ask first
  const press = useCallback((action) => {
    if (busy.current || pending) return;
    if (action === 'finish') { setFinishOpen(true); return; }
    if (action === 'no_access') { setNoAccessStep('call'); return; }
    send({ action, requestId: newRequestId(Date.now() + skew.current) });
  }, [pending, send]);

  // the undo counts down by the minute
  const nowMs = tick + skew.current;
  const bar = useMemo(() => (shown ? barOf(shown.visit, nowMs) : null), [shown, nowMs]);
  const undoShown = !!(bar && bar.undo);
  useEffect(() => {
    if (!undoShown) return undefined;
    const timer = setInterval(() => setTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [undoShown]);
  // nothing to press on what the phone kept: the server may have changed it since
  const blocked = problem === 'offline' ? 'Needs connection' : problem === 'failed' ? 'Pull down to refresh' : null;

  // ---------- notes ----------
  // The draft stays while the screen is open (a sheet closed by mistake loses nothing);
  // noteSend: { text, requestId, sending, failed } of the latest save (Try again: the same id)
  const extras = !!(shown && canAddExtras(shown.visit));
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSend, setNoteSend] = useState(null);
  const savingNote = useRef(false);

  const saveNote = useCallback(async () => {
    if (savingNote.current || gone.current || !noteReady(noteText)) return;
    savingNote.current = true;
    const mark = myDayMark();
    const request = noteRequest(noteSend, noteText, Date.now() + skew.current);
    setNoteSend({ ...request, sending: true, failed: null });
    try {
      // 201 created, or 200 created: false for the same id again: both mean it is saved
      const data = await myDayAPI.note(id, noteBody(request));
      setNoteSend(null);
      setNoteText('');
      setNoteOpen(false);
      if (data && data.visit) await keepFresh(data.visit, mark);
    } catch (error) {
      const failed = noteError(error);
      if (failed.kind === 'gone') {
        setNoteSend(null);
        setNoteOpen(false);
        await leaveGone(mark);
      } else if (failed.kind === 'refused') {
        // 409: the visit as it is now (cancelled, an old task); 400: the text, the sheet stays
        setNoteSend(null);
        if (failed.visit) {
          setNoteOpen(false);
          await keepFresh(failed.visit, mark);
        }
        Alert.alert(failed.text);
      } else {
        if (failed.kind === 'failed') logError('Error saving a visit note:', error);
        setNoteSend({ ...request, sending: false, failed: failed.text });
      }
    } finally {
      savingNote.current = false;
    }
  }, [id, noteText, noteSend, keepFresh, leaveGone]);

  // ---------- the office's messages: «Seen» ----------
  // Where they are (onLayout, px): the head in the scroll, the office block in the head, each
  // message in the block; the scroll's offset and height. The check runs once the scroll has
  // rested SEEN_REST_MS, on the card as the server gave it.
  const place = useRef({ head: null, office: null, rows: {}, top: 0, height: 0 });
  const seenDone = useRef(new Set());                    // sent or refused: not again
  const seenBusy = useRef(false);
  const seenTimer = useRef(null);
  const cardNow = useRef(null);
  cardNow.current = card;
  const shownNow = useRef(shown);
  shownNow.current = shown;
  // a message unseen when it shows keeps «NEW» while this screen is open, after it is seen
  const [newIds, setNewIds] = useState(() => new Set());
  useEffect(() => {
    const unseen = card && card.office ? card.office.messages.filter((m) => m.unseen).map((m) => m.id) : [];
    if (unseen.some((mid) => !newIds.has(mid))) setNewIds((prev) => new Set([...prev, ...unseen]));
  }, [card]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendSeen = useRef(null);
  const seenSoon = useCallback(() => {
    clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(() => sendSeen.current && sendSeen.current(), SEEN_REST_MS);
  }, []);
  sendSeen.current = async () => {
    const office = cardNow.current && cardNow.current.office;
    const s = shownNow.current;
    if (!office || !s || s.source !== 'server' || gone.current || seenBusy.current || seenHold.current) return;
    const p = place.current;
    if (p.head === null || p.office === null) return;
    const rows = office.messages.map((m) => (p.rows[m.id] ? { id: m.id, top: p.head + p.office + p.rows[m.id].y, height: p.rows[m.id].height } : null));
    const unseen = office.messages.filter((m) => m.unseen).map((m) => m.id);
    const ids = toSend(onScreen(rows, { top: p.top, height: p.height }), unseen, seenDone.current);
    if (!ids.length) return;
    seenBusy.current = true;
    const mark = myDayMark();
    let again = true;
    try {
      const data = await myDayAPI.seen(id, ids);
      ids.forEach((mid) => seenDone.current.add(mid));
      if (data && data.visit && !gone.current) await keepFresh(data.visit, mark);
    } catch (error) {
      const failed = seenError(error);
      if (failed.kind === 'refused' || failed.kind === 'gone') {
        ids.forEach((mid) => seenDone.current.add(mid));
      } else {
        again = false;
        seenHold.current = true;
        if (failed.kind === 'failed') logError('Error marking office messages seen:', error);
      }
    } finally {
      seenBusy.current = false;
    }
    // more may have come on the screen meanwhile
    if (again) seenSoon();
  };
  useEffect(() => { seenSoon(); }, [shown, officeOpen, seenSoon]);
  useEffect(() => () => clearTimeout(seenTimer.current), []);
  const placed = (key, mid) => (e) => {
    const { y, height } = e.nativeEvent.layout;
    if (key === 'row') place.current.rows[mid] = { y, height };
    else place.current[key] = y;
    seenSoon();
  };

  // ---------- photos ----------
  // upload: { file, sending, failed } of the photo being sent; Try again sends the same file
  const photos = useMemo(() => (photoRows ? photosOf(photoRows, id, now) : null), [photoRows, id, now]);
  const [upload, setUpload] = useState(null);
  const uploading = useRef(false);
  // a photo that got no answer: its box (the last thing on the card) comes into view with
  // Try again, not under the bar at the bottom
  const scrollRef = useRef(null);
  const photoFailed = !!(upload && upload.failed);
  useEffect(() => {
    if (!photoFailed) return undefined;
    const frame = requestAnimationFrame(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [photoFailed]);
  const [photoSheet, setPhotoSheet] = useState(false);
  const pickNext = useRef(null);                          // 'camera' | 'library', once the sheet has gone
  const [viewer, setViewer] = useState(null);             // the photo open full screen

  const sendPhoto = useCallback(async (file) => {
    if (uploading.current || gone.current) return;
    uploading.current = true;
    const mark = myDayMark();
    setUpload({ file, sending: true, failed: null });
    try {
      await photosAPI.upload(id, file);
      setUpload(null);
      await loadPhotos();
    } catch (error) {
      const failed = photoError(error);
      if (failed.kind === 'gone') {
        setUpload(null);
        await leaveGone(mark);
      } else if (failed.kind === 'refused') {
        setUpload(null);
        Alert.alert(failed.text);
      } else {
        if (failed.kind === 'failed') logError('Error sending a visit photo:', error);
        setUpload({ file, sending: false, failed: failed.text });
      }
    } finally {
      uploading.current = false;
    }
  }, [id, leaveGone, loadPhotos]);

  // JPEG from the camera; from the library the compatible JPEG, not HEIC (the server takes
  // JPEG, PNG, GIF, WebP and makes them 1200 px); no location in the file
  const pickPhoto = useCallback(async (source) => {
    const options = {
      mediaTypes: ['images'],
      quality: 0.7,
      exif: false,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    try {
      if (source === 'camera') {
        const allowed = await ImagePicker.requestCameraPermissionsAsync();
        if (!allowed.granted) {
          Alert.alert('The camera is off for SEMIX', 'Allow the camera in Settings to take photos.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !Array.isArray(result.assets) || !result.assets.length) return;
      const file = photoFile(result.assets[0]);
      if (!file) {
        Alert.alert('This photo cannot be sent', 'Choose a JPEG or PNG photo, or take a new one.');
        return;
      }
      sendPhoto(file);
    } catch (error) {
      Alert.alert(source === 'camera' ? 'The camera did not open' : 'Your photos did not open', 'Try again.');
    }
  }, [sendPhoto]);

  // The camera or the library opens only once the sheet has gone (iOS cannot show it over a
  // closing sheet): on the sheet's onDismiss, or a moment later if that does not come
  const runPick = useCallback(() => {
    const source = pickNext.current;
    pickNext.current = null;
    if (source) pickPhoto(source);
  }, [pickPhoto]);
  const choosePhoto = (source) => {
    pickNext.current = source;
    setPhotoSheet(false);
    setTimeout(runPick, Platform.OS === 'ios' ? 900 : 300);
  };
  const openViewer = (index) => {
    setViewer(index);
    // the token may have run out since the thumbnails came: the same one, or a fresh one
    session.authHeader().then((h) => { if (h) setPhotoHeader(sameHeader(h)); }).catch(() => {});
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to My day">
          <Icon name="back" size={20} color={colors.fgDefault} />
          <Text style={styles.backText}>My day</Text>
        </TouchableOpacity>
      </View>
      {notice ? <View style={styles.noticeWrap}><NoticeBar text={notice} kind={problem === 'offline' ? 'offline' : 'failed'} /></View> : null}

      {!card ? (
        <View style={styles.noData}>
          {problem ? (
            <>
              <Text style={styles.noDataTitle}>{problem === 'offline' ? 'No connection' : 'Could not load the visit'}</Text>
              <TouchableOpacity style={styles.retry} onPress={() => load()} accessibilityRole="button">
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : <ActivityIndicator color={colors.brand} />}
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.body}
          onLayout={(e) => { place.current.height = e.nativeEvent.layout.height; seenSoon(); }}
          onScroll={(e) => { place.current.top = e.nativeEvent.contentOffset.y; seenSoon(); }}
          scrollEventThrottle={100}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ pull: true })} tintColor={colors.brand} />}>
          {updated ? (
            <View style={styles.upd} accessible accessibilityRole="alert" accessibilityLabel={`${updated.title}. ${updated.line}`}>
              <Icon name="refresh" size={18} color={colors.infoFg} style={styles.updIcon} />
              <View style={styles.updBody}>
                <Text style={styles.updTitle}>{updated.title}</Text>
                <Text style={styles.updLine}>{updated.line}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.head} onLayout={placed('head')}>
            <View style={styles.tagRow}>
              <Tag tag={card.tag} big />
              {card.kindLine ? <Text style={styles.kindLine} numberOfLines={1}>{card.kindLine}</Text> : null}
            </View>
            <Text style={styles.name} accessibilityRole="header">{card.name}</Text>
            <View style={updated && updated.was.address ? styles.chg : null}>
              {card.address.line1 ? <Text style={styles.addr1}>{card.address.line1}</Text> : null}
              {card.address.line2 ? <Text style={styles.addr2}>{card.address.line2}</Text> : null}
              {updated && updated.was.address ? <ChangedWas text={updated.was.address} /> : null}
            </View>

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.bigBtn, styles.bigFill]} onPress={() => openDirections(shown.visit, userId)} accessibilityRole="button" accessibilityLabel={`Directions to ${card.name}`}>
                <Icon name="nav" size={22} color={colors.fgOnFill} />
                <Text style={[styles.bigText, { color: colors.fgOnFill }]}>Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bigBtn, styles.bigGhost]} onPress={() => callCustomer(shown.visit, userId)} accessibilityRole="button" accessibilityLabel={`Call ${card.name}`}>
                <Icon name="phone" size={22} color={colors.brandPressed} />
                <Text style={[styles.bigText, { color: colors.brandPressed }]}>Call</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tiles}>
              {card.tiles.map((t) => {
                // the office moved the time: the tile says what it was, in place of its second line
                const wasText = updated && updated.was[t.key];
                const small = wasText || t.small;
                return (
                  <View key={t.key} style={[styles.tile, wasText && styles.tileChanged]} accessible accessibilityLabel={`${t.label} ${t.big} ${small}`}>
                    <Text style={styles.tileLabel}>{t.label.toUpperCase()}</Text>
                    <Text style={[styles.tileBig, t.big.length > 6 && styles.tileBigLong, t.struck && styles.struck]} numberOfLines={1} adjustsFontSizeToFit>{t.big}</Text>
                    {small ? <Text style={[styles.tileSmall, wasText && styles.tileWas]} numberOfLines={1}>{small}</Text> : null}
                  </View>
                );
              })}
            </View>

            {card.access ? (
              <View style={styles.access}>
                <Icon name="key" size={18} color={colors.warningFg} />
                <View style={styles.accessBody}>
                  <Text style={styles.accessTitle}>How to get in</Text>
                  <Text style={styles.accessText}>{card.access}</Text>
                  {updated && updated.was.access ? <ChangedWas text={updated.was.access} /> : null}
                </View>
              </View>
            ) : null}

            {card.office ? (
              <View style={styles.office} accessibilityRole="summary" onLayout={placed('office')}>
                <View style={styles.officeTop}>
                  <Icon name="message" size={18} color={colors.infoFg} />
                  <Text style={styles.officeTitle}>From the office</Text>
                </View>
                {card.office.messages.map((m, i) => {
                  const isNew = m.unseen || newIds.has(m.id);
                  return (
                    <View key={m.key} style={[styles.officeNote, i > 0 && styles.officeNoteNext]} onLayout={placed('row', m.id)}
                      accessible accessibilityLabel={`${isNew ? 'New. ' : ''}${m.head}. ${m.text}`}>
                      <View style={styles.officeHeadRow}>
                        <Text style={styles.officeHead}>{m.head}</Text>
                        {isNew ? <Text style={styles.officeNew}>NEW</Text> : null}
                      </View>
                      <Text style={styles.officeText}>{m.text}</Text>
                    </View>
                  );
                })}
                {card.office.more ? (
                  <TouchableOpacity style={styles.officeMore} onPress={() => setOfficeOpen(true)} accessibilityRole="button"
                    accessibilityLabel={`Show ${card.office.more} more notes from the office`}>
                    <Text style={styles.officeMoreText}>{`+${card.office.more} more`}</Text>
                  </TouchableOpacity>
                ) : null}
                {card.office.job ? (
                  <View style={[styles.officeNote, card.office.messages.length > 0 && styles.officeNoteNext]}>
                    {card.office.job.head ? <Text style={styles.officeHead}>{card.office.job.head}</Text> : null}
                    <Text style={styles.officeText}>{card.office.job.text}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <Section label="Problem">
            <View style={updated && updated.was.problem ? styles.chg : null}>
              <Text style={card.problem ? styles.text : styles.quiet}>{card.problem || 'No description'}</Text>
              {updated && updated.was.problem ? <ChangedWas text={updated.was.problem} /> : null}
            </View>
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
            {card.team.map((line) => (
              <Text key={line.label} style={styles.teamLine}><Text style={styles.teamLabel}>{line.label}</Text>{`  ${line.value}`}</Text>
            ))}
          </Section>

          {card.full && card.history.length ? (
            <Section label={card.historyTitle}>
              {card.history.map((h) => (
                <View key={h.key} style={[styles.hist, h.mark === 'this' ? styles.histThis : h.mark === 'later' ? styles.histLater : styles.histPast]}>
                  <Text style={styles.histTitle}>{h.title}</Text>
                  <Text style={styles.histText} numberOfLines={3}>{h.text}</Text>
                </View>
              ))}
            </Section>
          ) : null}
          {!card.full && !shown.visit.legacy ? (
            <Section label="This job">
              <Text style={styles.quiet}>{waiting}</Text>
            </Section>
          ) : null}

          <Section label={card.full ? card.notesTitle : 'Notes'}>
            {!card.full ? <Text style={styles.quiet}>{waiting}</Text> : null}
            {card.full && !card.notes.length ? <Text style={styles.quiet}>No notes yet</Text> : null}
            {card.notes.map((note) => (
              <View key={note.key} style={styles.note}>
                <Text style={styles.noteHead}>{note.head}</Text>
                <Text style={styles.noteText}>{note.text}</Text>
              </View>
            ))}
            {extras ? <ExtrasRow blocked={blocked} onNote={() => setNoteOpen(true)} onPhoto={() => setPhotoSheet(true)} /> : null}
          </Section>

          {!shown.visit.legacy ? (
            <Section label={photos ? photosTitle(photos.length) : 'Photos'}>
              <PhotoGrid photos={photos} header={photoHeader} upload={upload} waiting={waiting}
                onOpen={openViewer}
                onRetry={() => upload && sendPhoto(upload.file)}
                onCancel={() => setUpload(null)} />
            </Section>
          ) : null}
        </ScrollView>
      )}

      {card && bar ? (
        <ActionBar bar={bar} pending={pending} failure={failure} blocked={blocked} bottom={insets.bottom}
          onPress={press}
          onRetry={() => pending && send(pending)}
          onCancel={() => { setPending(null); setFailure(null); }}
          onNote={extras ? () => setNoteOpen(true) : null} />
      ) : null}
      {shown ? (
        <>
          <FinishSheet visible={finishOpen} choices={finishChoices(shown.visit)} initial={defaultOutcome(shown.visit)}
            subtitle={finishSubtitle(shown.visit, n)} bottom={insets.bottom}
            onClose={() => setFinishOpen(false)}
            onFinish={(outcome) => { setFinishOpen(false); send({ action: 'finish', outcome, requestId: newRequestId(Date.now() + skew.current) }); }} />
          <NoAccessSheet step={noAccessStep} words={noAccessWords(shown.visit)} bottom={insets.bottom}
            onClose={() => setNoAccessStep(null)}
            onCall={() => { callCustomer(shown.visit, userId); setNoAccessStep('close'); }}
            onNext={() => setNoAccessStep('close')}
            onConfirm={() => { setNoAccessStep(null); send({ action: 'no_access', requestId: newRequestId(Date.now() + skew.current) }); }} />
          <NoteSheet visible={noteOpen && extras} text={noteText} sending={!!(noteSend && noteSend.sending)} failure={noteSend ? noteSend.failed : null}
            bottom={insets.bottom} onChangeText={setNoteText} onSave={saveNote} onClose={() => setNoteOpen(false)} />
          <PhotoSheet visible={photoSheet} bottom={insets.bottom} onCamera={() => choosePhoto('camera')} onLibrary={() => choosePhoto('library')}
            onClose={() => setPhotoSheet(false)} onDismiss={runPick} />
          <PhotoViewer photos={photos} index={viewer} header={photoHeader} onClose={() => setViewer(null)} />
        </>
      ) : null}
    </SafeAreaView>
  );
}

// Under a field the office changed: «CHANGED» and what it was ('was 88-12 Queens Blvd, Apt 5A');
// a field there was none of before: «NEW» alone
function ChangedWas({ text }) {
  if (text === 'new') {
    return (
      <View style={styles.chgWas} accessible accessibilityLabel="New">
        <Text style={styles.chgPill}>NEW</Text>
      </View>
    );
  }
  return (
    <View style={styles.chgWas} accessible accessibilityLabel={`Changed, ${text}`}>
      <Text style={styles.chgPill}>CHANGED</Text>
      <Text style={styles.chgText} numberOfLines={3}>{text}</Text>
    </View>
  );
}

function Section({ label, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingLeft: 4, paddingRight: 14, borderRadius: 22 },
  backText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault },
  noticeWrap: { paddingHorizontal: 16, paddingTop: 8 },
  body: { paddingBottom: 32 },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  kindLine: { fontSize: 14, fontWeight: '600', color: colors.fgSecondary, flexShrink: 1 },
  name: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.fgDefault },
  addr1: { fontSize: 17, lineHeight: 22, color: colors.fgDefault, marginTop: 2 },
  addr2: { fontSize: 17, lineHeight: 22, color: colors.fgSecondary },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  bigBtn: { flex: 1, height: 56, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigFill: { backgroundColor: colors.brandPressed },
  bigGhost: { backgroundColor: colors.bgCard, borderWidth: 1.5, borderColor: colors.brandPressed },
  bigText: { fontSize: 17, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tile: { flex: 1, minHeight: 74, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgSubtle },
  tileLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.fgSecondary },
  tileBig: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: colors.fgDefault },
  tileBigLong: { fontSize: 18, lineHeight: 32 },
  tileSmall: { fontSize: 12, fontWeight: '600', color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through', color: colors.fgSecondary },
  // «Updated by the office» (design .upd) and a field that changed (.chg, .chg-was)
  upd: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.infoBorder, backgroundColor: colors.infoBg },
  updIcon: { marginTop: 1 },
  updBody: { flex: 1 },
  updTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.infoFg },
  updLine: { fontSize: 15, lineHeight: 20, color: colors.infoFg },
  chg: { marginTop: 4, marginHorizontal: -2, paddingVertical: 8, paddingLeft: 12, paddingRight: 10, borderLeftWidth: 4, borderLeftColor: colors.infoBorder, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.infoBg },
  chgWas: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chgPill: { paddingHorizontal: 6, height: 18, lineHeight: 18, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.infoBorder, color: colors.fgOnFill, fontSize: 11, fontWeight: '800', letterSpacing: 0.66 },
  chgText: { flexShrink: 1, fontSize: 14, lineHeight: 19, color: colors.infoFg },
  tileChanged: { borderWidth: 2, borderColor: colors.infoBorder },
  tileWas: { color: colors.infoFg },
  access: { flexDirection: 'row', gap: 10, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  accessBody: { flex: 1 },
  accessTitle: { fontSize: 15, fontWeight: '700', color: colors.warningFg },
  accessText: { fontSize: 15, lineHeight: 20, color: colors.warningFg },
  office: { marginTop: 10, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.infoBorder, backgroundColor: colors.infoBg },
  officeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  officeTitle: { fontSize: 15, fontWeight: '700', color: colors.infoFg },
  officeNote: { paddingBottom: 8, paddingLeft: 26 },
  officeNoteNext: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.infoBorder },
  officeHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  officeHead: { fontSize: 13, fontWeight: '600', color: colors.infoFg },
  officeNew: { height: 18, lineHeight: 18, paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.infoBorder, color: colors.fgOnFill, fontSize: 11, fontWeight: '800', letterSpacing: 0.66 },
  officeText: { fontSize: 16, lineHeight: 22, color: colors.infoFg },
  officeMore: { minHeight: 44, justifyContent: 'center', paddingLeft: 26 },
  officeMoreText: { fontSize: 15, fontWeight: '700', color: colors.infoFg },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 8, borderTopWidth: 10, borderTopColor: colors.bgPage },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.fgSecondary },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  quiet: { fontSize: 15, lineHeight: 20, color: colors.fgMutedField },
  appliance: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applianceText: { flex: 1, fontSize: 15, color: colors.fgSecondary },
  applianceType: { fontWeight: '700', color: colors.fgDefault },
  teamLine: { fontSize: 15, color: colors.fgDefault },
  teamLabel: { fontWeight: '600', color: colors.fgSecondary },
  hist: { paddingLeft: 12, paddingVertical: 4, borderLeftWidth: 4 },
  histPast: { borderLeftColor: colors.borderStrong },
  histThis: { borderLeftColor: colors.accent },
  histLater: { borderLeftColor: colors.brand },
  histTitle: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  histText: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  note: { padding: 12, borderRadius: 12, backgroundColor: colors.bgSubtle, gap: 2 },
  noteHead: { fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  noteText: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  noData: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  noDataTitle: { fontSize: 22, fontWeight: '700', color: colors.fgDefault },
  retry: { alignSelf: 'stretch', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPressed },
  retryText: { fontSize: 17, fontWeight: '700', color: colors.fgOnFill },
});
