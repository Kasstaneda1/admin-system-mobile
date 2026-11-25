// A visit (TECH_APP_MY_DAY_SPEC.md §3 «Visit», §4; design A3:
// design-mockups/tech-app/shots/final-visit-*.png). Opens from a row of My day with the
// list's visit, so it shows at once; the card kept on the phone fills in history and notes;
// GET /api/my/visits/:id replaces both. What it shows is visit.js.
// The bar at the bottom (APP-3a): Finish with its outcome (right from a planned visit), On my
// way (optional, under it), No access, Undo for
// 15 minutes; the server says what may be pressed (actions.js barOf). A press waits for the
// answer; with none, «No connection. Try again» sends the same request (same client_request_id).
// Notes and photos (APP-3b): «Add note» writes a note (POST /api/my/visits/:id/notes, the same
// id again on Try again), «Photo» takes or chooses one and sends it (POST …/tasks/:id/photos);
// the visit's photos show as thumbnails (notesPhotos.js, visitExtras.js).
// The office's messages (backend #141) under «From the office», the newest first, «NEW» until
// seen; the app marks seen the ones the technician has really had on the screen (officeSeen.js).
// The diagnosis (D1-APP; design visit-diagnosis app-visit-empty, app-after, app-after-bill):
// a block under Notes, «Printed on the bill»: Add diagnosis / Edit while the visit has no issued
// bill, Add to diagnosis after it; the field in «How did it end?», saved before the finish
// (src/diagnosis). «Someone changed it before you» shows both texts to choose from.
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
import { readVisit } from '../bell/store';
import { colors } from '../constants/colors';
import { ackAPI, approveAPI, billAPI, myDayAPI, photosAPI, session } from '../services/api';
import { logError } from '../utils/logError';
import { useAuth } from '../session/AuthContext';
import { buildDay, failedText, keptWeek, nowWall, offlineText, skewOf, visitDay, weekOf } from '../myDay/model';
import { markSeen } from '../myDay/fresh';
import { seenMark, updateSeen } from '../myDay/seenStore';
import { dropCard, keepCard, keptCard, updatedOf, visitCard } from '../myDay/visit';
import { actionBody, actionError, barOf, defaultOutcome, finishChoices, finishSubtitle, keepActed, newRequestId, noAccessWords, undoLinkOf } from '../myDay/actions';
import { myDayMark, readMyDay, updateMyDay } from '../myDay/storage';
import { callCustomer, openDirections } from '../myDay/phoneLinks';
import { callOffice } from '../myDay/officeStore';
import { visitView } from '../perms/model';
import { AccessText, NoticeBar } from '../myDay/parts';
import Icon from '../myDay/Icon';
import SkipSheet from '../steps/SkipSheet';
import { requestIdFor, skipBody, skipError } from '../steps/skip';
import { ActionBar, FinishSheet, NoAccessLink, NoAccessSheet, StepStrip, UndoLink } from '../myDay/visitBar';
import { nextButtonOf, nextOfDay, nowWordsOf, stepsOf, stripLabel } from '../myDay/steps';
import { issueFailText, pressOf, threeOf, threeOffersNext } from '../bill/three';
import { BillRow } from '../bill/ThreeParts';
import { SendSheet } from '../bill/CopyParts';
import { copyRequired } from '../bill/copy';
import { nextTodayOf } from '../myDay/access';
import { canAddExtras, noteBody, noteError, noteReady, noteRequest, photoError, photoFile, photosOf, photosTitle } from '../myDay/notesPhotos';
import { ExtrasRow, NoteSheet, PhotoGrid, PhotoSheet, PhotoViewer } from '../myDay/visitExtras';
import { SEEN_REST_MS, onScreen, seenError, toSend } from '../myDay/officeSeen';
import { billError, billTile, canBill, draftedFrom, knownOf, overApproval } from '../bill/model';
import { Box } from '../bill/parts';
import { approveError, approveTile, approveTileAfterIssue, canApprove } from '../approve/model';
import { payTile } from '../pay/model';
import { VISIT_HINT, depositRow, noDepositYet } from '../deposit/model';
import { approvals } from '../approve/store';
import { acks } from '../ack/store';
import { diagnosisBlock, diagnosisOf, finishAsksDiagnosis, finishDiagnosisChanged, finishNeedsDiagnosis, finishWaitsForDiagnosis } from '../diagnosis/model';
import { estimateRequestOf } from '../myDay/estimateRequest';
import { DiagnosisBody, DiagnosisHead, DiagnosisSheet } from '../diagnosis/parts';
import { useDiagnosis } from '../diagnosis/useDiagnosis';

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

  // The customer's signature after the work (src/ack): read with every issued bill — Get signature
  // of the three buttons (bill/three.js), and the strip's «Signs» when it has replaced parts.
  // { status, signed, pending?, name?, at?, parts? } | null.
  // The phone's signatures go first (ack/queue.js); one of this visit still on the phone counts as
  // signed (it goes by itself), as the approval's. One the server refused while it waited
  // (ackRefused) marks the Bill tile until the customer signs again (the Designer on #91): the
  // customer has likely gone, the technician must not leave without the signature.
  const [ackKnown, setAckKnown] = useState(null);
  const [ackRefused, setAckRefused] = useState(false);
  const ackSeq = useRef(0);
  const loadAck = useCallback(async (bill) => {
    if (!bill || bill.status !== 'issued') { setAckRefused(false); return; }
    const seq = ++ackSeq.current;
    // every issued bill: the three buttons' Get signature (T3); the strip's «Signs» only with parts
    setAckKnown((a) => (a && a.status === 'ok' ? a : { status: 'loading' }));
    let kept = null;
    if (userId !== null) {
      await acks.flushAll(userId).catch(() => {});
      kept = await acks.pendingOf(id, userId).catch(() => null);
      if (seq !== ackSeq.current) return;
      setAckRefused(!!(kept && kept.failed));
      if (kept && !kept.failed) { setAckKnown({ status: 'ok', signed: true, pending: true, at: kept.at || null, parts: kept.body && kept.body.replaced_parts }); return; }
    }
    try {
      const data = await ackAPI.get(id);
      if (seq !== ackSeq.current) return;
      const signed = !!(data && data.acknowledgment);
      // signed after all (the office, another phone): the refused one on this phone is moot
      if (signed && kept) { acks.drop(id, userId).catch(() => {}); setAckRefused(false); }
      const a = signed ? data.acknowledgment : null;
      setAckKnown({ status: 'ok', signed, name: a ? a.signer_name : null, at: a ? a.signed_at || a.created_at : null, parts: a ? a.replaced_parts : null });
    } catch (error) {
      if (seq !== ackSeq.current) return;
      if (error.response?.status >= 500) logError('Error loading the bill acknowledgment:', error);
      setAckKnown((a) => (a && a.status === 'ok' ? a : { status: 'unknown' }));
    }
  }, [id, userId]);

  // The visit's bill (src/bill): { status, bill } as GET …/bill answered, for the Bill tile and
  // «Open the bill»; read with the card, only where this technician works on the bill
  const [known, setKnown] = useState(null);
  const billSeq = useRef(0);
  const loadBill = useCallback(async (visit) => {
    if (!canBill(visit)) return;
    const seq = ++billSeq.current;
    try {
      const data = await billAPI.get(id);
      if (seq === billSeq.current) {
        setKnown(knownOf(data.bill));
        loadAck(data.bill);
      }
    } catch (error) {
      if (seq !== billSeq.current) return;
      const failed = billError(error);
      if (failed.kind === 'failed') logError('Error loading the visit bill:', error);
      setKnown((k) => (failed.kind === 'none' ? knownOf(null) : k && k.status !== 'loading' ? k : { status: 'unknown', bill: null }));
    }
  }, [id, loadAck]);

  // The customer's approval before the work (src/approve): the job's approvals as GET
  // …/authorizations answered and a signature still on this phone, for the Approve tile; read
  // with the card. The phone's signatures go first (they may be this visit's).
  const [approveKnown, setApproveKnown] = useState(null);
  const [approveKept, setApproveKept] = useState(null);
  const approveSeq = useRef(0);
  const loadApprove = useCallback(async (visit) => {
    if (!canApprove(visit) || userId === null) return;
    const seq = ++approveSeq.current;
    await approvals.flushAll(userId).catch(() => {});
    const kept = await approvals.pendingOf(id, userId);
    if (seq !== approveSeq.current) return;
    setApproveKept(kept);
    try {
      const data = await approveAPI.list(id);
      if (seq === approveSeq.current) setApproveKnown({ status: 'ok', list: data.authorizations || [] });
    } catch (error) {
      if (seq !== approveSeq.current) return;
      if (approveError(error).kind === 'failed') logError('Error loading the approvals:', error);
      setApproveKnown((k) => (k && k.status === 'ok' ? k : { status: 'unknown', list: [] }));
    }
  }, [id, userId]);

  const [dayVisits, setDayVisits] = useState(null);
  const load = useCallback(async ({ pull = false } = {}) => {
    if (gone.current) return;
    const seq = ++loadSeq.current;
    const mark = myDayMark();                           // an answer after sign out is not kept
    if (pull) setRefreshing(true);
    const kept = await readMyDay();
    const keptOne = keptCard(kept, userId, id);
    // today's visits the phone keeps: the next one to go to, for the last step (steps.js nextOfDay)
    const today = nowWall(Date.now(), skew.current).date;
    const week = keptWeek(kept, userId, weekOf(today)[0]);
    if (seq === loadSeq.current) setDayVisits(week && Array.isArray(week.visits) ? week.visits : null);
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
      loadBill(data.visit);
      loadApprove(data.visit);
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
      // the bill is read with the card: without it the Bill tile says so instead of waiting
      setKnown((k) => k || { status: 'unknown', bill: null });
      setApproveKnown((k) => k || { status: 'unknown', list: [] });
      // a signature kept on this phone shows on the tile without the connection too
      if (keptOne) loadApprove({ ...keptOne.card, ...(fromList || {}) });
    } finally {
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }, [id, userId, fromList, leaveGone, loadPhotos, loadBill, loadApprove]);

  // on opening and every time the screen comes back
  useFocusEffect(useCallback(() => { setTick(Date.now()); load(); }, [load]));
  // the bell: every item of this visit is read once it is open (the Architect's «NT» §7)
  useEffect(() => { readVisit(id); }, [id]);

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
  // The technician's permissions (src/perms): money by the bill's answer (else /api/me), the
  // customer's contacts by the visit's answer — without them no Approve, Pay, Deposit, amounts or Call
  const perms = shown ? visitView(user, shown.visit, known && known.bill) : null;
  const payments = !perms || perms.money;
  const hidden = !!perms && perms.call === 'office';
  // today's day as My day draws it (the week kept on the phone): its NEXT row for «How to get in»
  // and the next visit for the last step
  const myDay = useMemo(() => (dayVisits ? buildDay(dayVisits, now.date, now) : null), [dayVisits, now]);
  const nextToday = nextTodayOf(myDay, id);
  const card = useMemo(() => (shown ? visitCard(shown.visit, { n, now, officeOpen, prices: payments, nextToday }) : null), [shown, n, now, officeOpen, payments, nextToday]);
  // the band and the old words (only for a visit UPDATED when it was opened; stays while open)
  const updated = useMemo(() => (fresh === 'updated' && shown && before !== undefined
    ? updatedOf(shown.visit, before && before.visit, before && before.at) : null), [fresh, shown, before]);
  const tile = shown ? billTile(shown.visit, known) : null;
  // at diagnostics and a recall: no tile once the bill is issued, unless signed (approve/model)
  const approve = shown && payments ? approveTileAfterIssue(approveTile(shown.visit, approveKnown, approveKept, now.date), shown.visit, known) : null;
  // signed (here or on this phone, not sent yet) — the brand tile with a tick; not signed or not
  // known yet — white with a border, no tick, so «to do» never looks like «done» (Дизайнер, #44)
  // the draft grew over the customer's approval (bill/model overApproval, usability п. 6): the
  // signature is to do again — the tile is not «done», says why, and opens the new signature
  const over = !!(known && known.status === 'draft' && overApproval(known.bill));
  const approveShown = approve && over && approve.kind === 'signed' ? { ...approve, kind: 'over', warn: 'bill is higher · new signature needed' } : approve;
  const approveDone = !!approveShown && (approveShown.kind === 'signed' || approveShown.kind === 'pending');
  // the draft bill tile is filled (the next thing to open) — not while the bill is over the approval:
  // then it is white (billTileQuiet) and Approve again is the one bright place (the Designer on #90)
  const billFill = !!tile && tile.kind === 'draft' && !over;
  // a signature for the bill refused while it waited on the phone: the tile says so and opens the
  // signature screen (its yellow box has the reason)
  const billShown = tile && ackRefused ? { ...tile, warn: tile.warn ? `${tile.warn} · ${ACK_REFUSED_WARN}` : ACK_REFUSED_WARN } : tile;
  const openAck = useCallback(() => {
    if (shown) navigation.navigate('Ack', { id, visit: shown.visit, back: 'Visit' });
  }, [navigation, id, shown]);
  const openApprove = useCallback(() => {
    if (shown) navigation.navigate('Approve', { id, visit: shown.visit, again: over });
  }, [navigation, id, shown, over]);
  const drafted = tile && card && card.state === 'closed' && known && known.status === 'draft' ? draftedFrom(known.bill) : null;
  // D3: the estimate this visit asked for (Estimate needed), when the technician may open it
  const estimateRequest = shown ? estimateRequestOf(shown.visit) : null;
  // «Open the bill»: a draft or an issued bill opens as it is; none yet: the server drafts it
  const openBill = useCallback(() => {
    if (!shown) return;
    const has = known && (known.status === 'draft' || known.status === 'issued');
    navigation.navigate('Bill', { id, visit: shown.visit, create: !has });
  }, [navigation, id, shown, known]);
  // The visit's steps (steps.js — their order and what each one is live there only): the strip over
  // the tiles and the big button at the bottom. Without steps (no money permission) a closed visit
  // keeps «Open the bill» as its big button; with them it is a link under the step
  const next = useMemo(() => (myDay ? nextOfDay(myDay, id) : null), [myDay, id]);
  const steps = shown ? stepsOf({ visit: shown.visit, approve, known, ack: ackKnown, money: payments, next }) : null;
  const closedBill = !!(tile && card && card.state === 'closed');
  // The bill's three buttons (T3, bill/three.js): Get signature · Get paid · Send the bill, before
  // Finish too; with them the Bill and Pay tiles, the strip and «Open the bill» are gone
  const three = shown ? threeOf({ visit: shown.visit, known, ack: ackKnown, money: payments, now,
    deposits: shown.visit.deposits && Number.isFinite(shown.visit.deposits.open_cents) ? shown.visit.deposits.open_cents : 0 }) : null;
  const threeNext = three && card && card.state === 'closed' && threeOffersNext(three) ? nextButtonOf(next) : null;
  const billButton = closedBill && !steps && !three ? { label: 'Open the bill', onPress: openBill } : null;
  const billLink = closedBill && steps && !three && steps.main && steps.main.key !== 'bill' ? { label: 'Open the bill', onPress: openBill } : null;
  // «Pay» (src/pay): what the bill's money says under the button; the last known balance without
  // the connection (recording waits for it)
  const pay = shown && payments ? payTile(shown.visit, known, { offline: problem === 'offline' }) : null;
  // Deposit (DEP-APP, design deposits app-states): under Pay, only with the server's visit.deposits
  const deposit = shown && payments ? depositRow(shown.visit, { offline: problem === 'offline' }) : null;
  const openDeposit = useCallback(() => {
    if (shown && deposit && deposit.tap) navigation.navigate('Deposit', { id, visit: shown.visit, mode: deposit.tap, bill: known && known.bill ? known.bill : null });
  }, [shown, deposit, known, id, navigation]);
  const openPay = useCallback(() => {
    if (shown) navigation.navigate('Pay', { id, visit: shown.visit, bill: known && known.bill ? known.bill : null });
  }, [navigation, id, shown, known]);
  // A press on one of the three: an empty draft (or none yet) opens «Change»; a draft is made final
  // first, right here (the button spins, no question: the word «issue» is not on the screen); then
  // the button's screen: Get signature — the customer's screen (AckScreen, d2; the copy first under
  // the box when it is required, d2-ny); Get paid — Pay (the copy first when required, d5); Send
  // the bill — the sheet over the visit (d6). Done — the screen of what was done.
  const [threeBusy, setThreeBusy] = useState(null);
  const [threeFail, setThreeFail] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const openThree = useCallback((key, bill) => {
    if (!shown) return;
    if (key === 'send') setSendOpen(true);
    else if (key === 'sign') navigation.navigate('Ack', { id, visit: shown.visit, back: 'Visit' });
    else navigation.navigate('Pay', { id, visit: shown.visit, bill });
  }, [shown, navigation, id]);
  const sentBill = useCallback((bill) => {
    setSendOpen(false);
    if (bill) { setKnown(knownOf(bill)); loadAck(bill); } else if (shown) loadBill(shown.visit);
  }, [shown, loadAck, loadBill]);
  const showBill = useCallback((file) => {
    setSendOpen(false);
    const bill = known && known.bill;
    navigation.navigate('BillPdf', { uri: file.uri, label: bill ? bill.label || `#${bill.bill_number}` : '' });
  }, [known, navigation]);
  const pressThree = useCallback(async (key) => {
    if (!shown || !three || threeBusy) return;
    setThreeFail(null);
    const what = pressOf(three, key, known);
    if (what === 'change') { openBill(); return; }
    if (what === 'open') { openThree(key, known && known.bill); return; }
    if (what !== 'issue' || !known || !known.bill) return;
    setThreeBusy(key);
    try {
      const data = await billAPI.issue(id, known.bill.total_cents);
      if (gone.current) return;
      setKnown(knownOf(data.bill));
      loadAck(data.bill);
      openThree(key, data.bill);
    } catch (error) {
      if (gone.current) return;
      const failed = billError(error, { issue: true, company: known.bill.company && (known.bill.company.name || known.bill.company.legal_name) });
      if (failed.kind === 'failed') logError('Error making a bill final:', error);
      setThreeFail(issueFailText(failed));
      if (failed.kind === 'refused') loadBill(shown.visit);
      // over the customer's approval: the customer signs again (src/approve), as the bill's screen offers
      if (failed.reapprove) navigation.navigate('Approve', { id, visit: shown.visit, again: true });
    } finally {
      if (!gone.current) setThreeBusy(null);
    }
  }, [shown, three, threeBusy, known, openBill, openThree, id, loadAck, loadBill, navigation]);
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
    loadBill(fresh);
    loadApprove(fresh);
    await updateMyDay((cache) => keepActed(cache, userId, fresh, savedAt), mark);
  }, [userId, loadBill, loadApprove]);

  const send = useCallback(async ({ action, outcome = null, part = null, requestId }) => {
    if (busy.current || gone.current) return;
    busy.current = true;
    const mark = myDayMark();
    setPending({ action, outcome, part, requestId });
    setFailure(null);
    const keep = (fresh) => keepFresh(fresh, mark);
    try {
      const data = await myDayAPI.act(id, actionBody(action, outcome, requestId, part));
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

  // ---------- Skip (VS-APP, design-mockups/app-skip) ----------
  // The sheet of the step (omw, signs, collect, give); a tap on a reason is the skip: the visit as
  // the server answers it (the skipped button grey, the next one lit). No signal or a refusal: the
  // sheet stays with the words; the step became Required meanwhile: the sheet goes, the visit is read
  const [skipKey, setSkipKey] = useState(null);
  const [skipSending, setSkipSending] = useState(null);
  const [skipFailure, setSkipFailure] = useState(null);
  // one request id per open sheet and reason (a repeat after a lost answer is «nothing new»)
  const skipIds = useRef({});
  const openSkip = useCallback((key) => { skipIds.current = {}; setSkipFailure(null); setSkipSending(null); setSkipKey(key); }, []);
  const doSkip = useCallback(async (reason) => {
    if (!skipKey || skipSending) return;
    const body = skipBody(reason, requestIdFor(skipIds.current, reason, () => newRequestId(Date.now() + skew.current)));
    if (!body) return;
    const mark = myDayMark();
    setSkipSending(reason);
    setSkipFailure(null);
    try {
      const data = await myDayAPI.skip(id, skipKey, body);
      setSkipKey(null);
      if (data && data.visit) await keepFresh(data.visit, mark);
    } catch (error) {
      const failed = skipError(error);
      if (failed.kind === 'gone') { setSkipKey(null); await leaveGone(mark); return; }
      if (failed.close) { setSkipKey(null); Alert.alert(failed.text); load(); return; }
      setSkipFailure(failed.text);
    } finally {
      setSkipSending(null);
    }
  }, [skipKey, skipSending, id, keepFresh, leaveGone, load]);

  // ---------- the diagnosis ----------
  const diagCurrent = useMemo(() => (shown ? diagnosisOf(shown.visit) : null), [shown]);
  const diagBlock = useMemo(() => (shown ? diagnosisBlock(shown.visit) : null), [shown]);
  const diag = useDiagnosis({
    id,
    current: diagCurrent,
    begin: myDayMark,
    nowMs: () => Date.now() + skew.current,
    onAnswer: async ({ visit }, mark) => { if (visit && !gone.current) await keepFresh(visit, mark); },
    onGone: (mark) => leaveGone(mark),
  });
  // The field of «How did it end?»: the visit's text when the sheet opens; its save's failure
  const [finishText, setFinishText] = useState('');
  const [finishFailure, setFinishFailure] = useState(null);
  // the outcome marked when the sheet comes back after «Take a deposit» (design finish-choice f3)
  const [finishPick, setFinishPick] = useState(null);
  const reopenFinish = useRef(null);
  const openFinish = useCallback(() => {
    setFinishText((diagCurrent && diagCurrent.text) || '');
    setFinishFailure(null);
    setFinishPick(null);
    diag.startFinish();
    setFinishOpen(true);
  }, [diagCurrent, diag]);
  // «Take a deposit» under Deposit taken: the sheet goes, the usual Deposit screen opens; back
  // from it (a deposit taken or not), the sheet opens again with the same choice and the typed
  // diagnosis — the visit is fresh by then (the focus loads it), so the line is gone once a
  // deposit is open (iOS shows one sheet at a time: the screen waits for the sheet to go)
  const takeDepositFromFinish = useCallback((outcome) => {
    if (!shown) return;
    reopenFinish.current = outcome;
    setFinishOpen(false);
    const visit = shown.visit;
    const bill = known && known.bill ? known.bill : null;
    setTimeout(() => navigation.navigate('Deposit', { id, visit, mode: 'take', bill }), Platform.OS === 'ios' ? 500 : 0);
  }, [shown, known, id, navigation]);
  const startFinish = useRef(diag.startFinish);
  startFinish.current = diag.startFinish;
  useFocusEffect(useCallback(() => {
    if (!reopenFinish.current) return undefined;
    const timer = setTimeout(() => {
      const outcome = reopenFinish.current;
      reopenFinish.current = null;
      if (!outcome) return;
      setFinishPick(outcome);
      startFinish.current();
      setFinishOpen(true);
    }, 350);
    return () => clearTimeout(timer);
  }, []));
  // Finish: a changed diagnosis is saved first (the finish carries no text, VISIT_DIAGNOSIS_DESIGN
  // Р-4); no answer — the sheet stays with Try again; their text meanwhile — the sheet goes and
  // the diagnosis sheet shows both texts, Finish again after
  const finishVisit = useCallback(async (outcome, field, part = null) => {
    // Д-2: a diagnosis is needed and the field is empty — the button is off; this is the guard
    if (shown && finishWaitsForDiagnosis(shown.visit, outcome, finishText)) return;
    if (field && shown && finishDiagnosisChanged(shown.visit, finishText)) {
      setFinishFailure(null);
      const saved = await diag.saveForFinish(finishText);
      if (!saved.ok) {
        if (saved.kind === 'busy') return;
        if (saved.kind === 'offline' || saved.kind === 'failed') { setFinishFailure(saved.text); return; }
        setFinishOpen(false);
        if (saved.kind === 'conflict') {
          const typed = finishText;
          setTimeout(() => diag.openConflict(typed), Platform.OS === 'ios' ? 700 : 200);
        } else if (saved.kind === 'locked') Alert.alert(saved.text);
        return;
      }
    }
    setFinishOpen(false);
    send({ action: 'finish', outcome, part, requestId: newRequestId(Date.now() + skew.current) });
  }, [shown, finishText, diag, send]);

  // a new press: a new request id; Finish and No access ask first
  const press = useCallback((action) => {
    if (busy.current || pending) return;
    if (action === 'finish') { openFinish(); return; }
    if (action === 'no_access') { setNoAccessStep('call'); return; }
    send({ action, requestId: newRequestId(Date.now() + skew.current) });
  }, [pending, send, openFinish]);

  // A press on a step's button: the screen of that step (Finish asks «How did it end?» first)
  const stepPress = useCallback((key) => {
    if (!shown) return;
    const open = {
      approve: openApprove,
      finish: () => press('finish'),
      bill: openBill,
      give: () => navigation.navigate('BillSend', { id, visit: shown.visit, back: 'Visit' }),
      pay: openPay,
      signs: () => navigation.navigate('Ack', { id, visit: shown.visit }),
      next: () => (next ? navigation.replace('Visit', { id: next.id, visit: next.visit, n: next.n, skew: skew.current }) : navigation.goBack()),
    }[key];
    if (open) open();
  }, [shown, openApprove, press, openBill, openPay, navigation, id, next]);

  // the undo counts down by the minute
  const nowMs = tick + skew.current;
  // the bill is final already (one of the three went before Finish): no Deposit taken, no No access,
  // no undo of the Finish (the Architect, T3; the server checks it too once IB-BE is in)
  const billFinal = !!known && known.status === 'issued';
  // «How did it end?»: the choices in the sheet's order, the server's first marked — or the one
  // marked before «Take a deposit», while it is still offered
  const finishChoicesNow = shown ? finishChoices(shown.visit, { billFinal }) : [];
  const finishInitial = finishPick && finishChoicesNow.some((c) => c.outcome === finishPick) ? finishPick
    : shown ? defaultOutcome(shown.visit, { billFinal }) : null;
  const bar = useMemo(() => (shown ? barOf(shown.visit, nowMs, { billFinal }) : null), [shown, nowMs, billFinal]);
  const undoShown = !!(bar && bar.undo);
  useEffect(() => {
    if (!undoShown) return undefined;
    const timer = setInterval(() => setTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [undoShown]);
  // nothing to press on what the phone kept: the server may have changed it since
  const blocked = problem === 'offline' ? 'Needs connection' : problem === 'failed' ? 'Pull down to refresh' : null;
  // the bar's presses are off while one waits, failed or the visit can't be reached (ActionBar's own rule)
  const barOff = (!!pending && !failure) || !!failure || !!blocked;

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

  // The calm look (design-mockups/app-calm p2, p3): the facts as a plain list (Window · Visit ·
  // Get in) in place of the three tiles and the yellow «How to get in» box — information, not a
  // warning; the codes stay bold. Under a fact the office changed: what it was (ChangedWas).
  const factsList = card ? (
    <View style={styles.facts}>
      {card.facts.map((f) => {
        const was = updated ? (f.key === 'window' ? updated.was.window || updated.was.plan : null) : null;
        return (
          <View key={f.key} style={styles.fact} accessible accessibilityLabel={`${f.label}: ${f.value}${was ? `. Changed, ${was}` : ''}`}>
            <Text style={styles.factLabel}>{f.label}</Text>
            <View style={styles.factBody}>
              <Text style={[styles.factValue, f.struck && styles.struck]}>{f.value}</Text>
              {was ? <ChangedWas text={was} /> : null}
            </View>
          </View>
        );
      })}
      {card.access ? (
        <View style={styles.fact} accessible accessibilityLabel={`How to get in: ${card.access}`}>
          <Text style={styles.factLabel}>Get in</Text>
          <View style={styles.factBody}>
            <AccessText text={card.access} style={styles.factValue} bigStyle={styles.accessCode} />
            {updated && updated.was.access ? <ChangedWas text={updated.was.access} /> : null}
          </View>
        </View>
      ) : null}
    </View>
  ) : null;
  // The problem: the office's words, the appliances in grey under them, who else is on the visit
  const problemBody = card ? (
    <>
      <View style={updated && updated.was.problem ? styles.chg : null}>
        <Text style={card.problem ? styles.text : styles.quiet}>{card.problem || 'No description'}</Text>
        {updated && updated.was.problem ? <ChangedWas text={updated.was.problem} /> : null}
      </View>
      {card.appliances.map((a) => (
        <Text key={a.key} style={styles.applianceText}>{[a.type, a.model, a.serial].filter(Boolean).join(' · ')}</Text>
      ))}
      {card.team.map((line) => (
        <Text key={line.label} style={styles.teamLine}><Text style={styles.teamLabel}>{line.label}</Text>{`  ${line.value}`}</Text>
      ))}
    </>
  ) : null;
  const closedNow = !!card && card.state === 'closed';
  // After Finish the bill says whether it is paid (design p3 «Not paid yet»), from Get paid's state
  const payOfThree = three && three.kind === 'three' ? three.buttons.find((b) => b.key === 'pay') : null;
  const notPaid = closedNow && payOfThree ? (payOfThree.state === 'todo' ? 'Not paid yet' : payOfThree.state === 'part' && payOfThree.line ? `Partly paid · ${payOfThree.line}` : null) : null;
  const billBlock = three && three.kind === 'three' ? (
    <View style={styles.block}>
      <BillRow row={three.row} note={notPaid} onChange={openBill} onOpen={known && known.status === 'issued' ? openBill : null} />
    </View>
  ) : null;
  const diagUp = closedNow && diagBlock ? (
    <View style={styles.block}>
      <DiagnosisHead />
      <DiagnosisBody block={diagBlock} blocked={blocked} onPress={() => diag.open(diagBlock.opens)}
        changed={updated && updated.was.diagnosis ? <ChangedWas text={updated.was.diagnosis} /> : null} />
    </View>
  ) : null;

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
              <Icon name="refresh" size={18} color={colors.fgSecondary} style={styles.updIcon} />
              <View style={styles.updBody}>
                <Text style={styles.updTitle}>{updated.title}</Text>
                <Text style={styles.updLine}>{updated.line}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.head} onLayout={placed('head')}>
            <View style={styles.stateRow}>
              <Icon name={card.stateLine.icon} size={16} color={colors.fgDefault} />
              <Text style={styles.stateText} numberOfLines={2}>{card.stateLine.text}</Text>
              {/* with the three (design app-dock) Undo is a link here, not a band in the foot */}
              {three && bar && bar.undo ? (
                <UndoLink undo={undoLinkOf(bar.undo)} off={barOff} busy={!!pending && !failure && pending.action === bar.undo.action} onPress={() => press(bar.undo.action)} />
              ) : null}
            </View>
            {bar && bar.omwSkipped ? (
              <View style={styles.skLine}>
                <Icon name="skipc" size={18} color={colors.fgSecondary} />
                <Text style={styles.skLineText} numberOfLines={2}>{bar.omwSkipped}</Text>
              </View>
            ) : null}
            <Text style={styles.name} accessibilityRole="header">{card.name}</Text>
            <View style={updated && updated.was.address ? styles.chg : null}>
              {card.address.line1 || card.address.line2 ? (
                <Text style={styles.addr}>{[card.address.line1, card.address.line2].filter(Boolean).join(', ')}</Text>
              ) : null}
              {updated && updated.was.address ? <ChangedWas text={updated.was.address} /> : null}
            </View>

            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.bigBtn, styles.bigFill]} onPress={() => openDirections(shown.visit, userId)} accessibilityRole="button" accessibilityLabel={`Directions to ${card.name}`}>
                <Icon name="nav" size={22} color={colors.fgOnFill} />
                <Text style={[styles.bigText, { color: colors.fgOnFill }]}>Directions</Text>
              </TouchableOpacity>
              {hidden ? (
                <TouchableOpacity style={[styles.bigBtn, styles.bigGhost]} onPress={() => callOffice(userId)} accessibilityRole="button" accessibilityLabel="Call the office">
                  <Icon name="phone" size={22} color={colors.brandPressed} />
                  <Text style={[styles.bigText, { color: colors.brandPressed }]} numberOfLines={1} adjustsFontSizeToFit>Call the office</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.bigBtn, styles.bigGhost]} onPress={() => callCustomer(shown.visit, userId)} accessibilityRole="button" accessibilityLabel={`Call ${card.name}`}>
                  <Icon name="phone" size={22} color={colors.brandPressed} />
                  <Text style={[styles.bigText, { color: colors.brandPressed }]}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
            {perms && perms.contactsLine ? <Text style={styles.permLine}>{perms.contactsLine}</Text> : null}

            {/* before Finish: the facts, the problem, the bill; after it the diagnosis and the bill come
                first and the facts go down — the work is done, the bill is what matters now (p3) */}
            {closedNow ? <>{diagUp}{billBlock}{factsList}</> : (
              <>
                {factsList}
                <View style={styles.block}>
                  <Text style={styles.blockLabel} accessibilityRole="header">PROBLEM</Text>
                  {problemBody}
                </View>
                {billBlock}
              </>
            )}

            {/* before Finish nothing competes with the one lit button (d0): the strip comes after it */}
            {steps && !three && steps.strip.length > 1 && card.state === 'closed' ? <StepStrip strip={steps.strip} label={stripLabel(steps.strip)} /> : null}
            {approveShown ? (
              <TouchableOpacity style={[styles.billTile, !approveDone && styles.approveTodo]} onPress={openApprove} accessibilityRole="button"
                accessibilityLabel={`${approveShown.title}, ${approveShown.line}${approveShown.warn ? `, ${approveShown.warn}` : ''}`}>
                <Icon name={approveDone ? 'checkc' : 'doc'} size={26} color={approveShown.kind === 'signed' ? colors.fgSecondary : approveDone ? colors.brandPressed : colors.fgSecondary} />
                <View style={styles.billTileBody}>
                  <Text style={styles.billTileTitle}>{approveShown.title}</Text>
                  <Text style={[styles.billTileLine, approveShown.kind === 'signed' && styles.approveSigned, !approveDone && styles.approveTodoLine]}>
                    {approveShown.line}
                    {approveShown.warn ? <Text style={styles.billTileWarn}>{` · ${approveShown.warn}`}</Text> : null}
                  </Text>
                </View>
                <Icon name="chev" size={20} color={colors.fgSecondary} />
              </TouchableOpacity>
            ) : null}
            {billShown && !three ? (
              <TouchableOpacity style={[styles.billTile, billFill && styles.billTileFill, over && styles.billTileQuiet, billShown.off && styles.billTileOff]}
                onPress={ackRefused ? openAck : openBill} disabled={billShown.off} accessibilityRole="button"
                accessibilityLabel={`${billShown.title}, ${billShown.line}${billShown.warn ? `, ${billShown.warn}` : ''}`}
                accessibilityState={{ disabled: billShown.off }}>
                <Icon name="doc" size={26} color={billShown.off ? colors.fgDisabled : billFill ? colors.fgOnFill : colors.brandPressed} />
                <View style={styles.billTileBody}>
                  <Text style={[styles.billTileTitle, billFill && styles.billTileOnFill, billShown.off && styles.billTileTextOff]}>{billShown.title}</Text>
                  <Text style={[styles.billTileLine, billFill && styles.billTileOnFill, billShown.off && styles.billTileTextOff]}>
                    {billShown.line}
                    {billShown.warn ? <Text style={styles.billTileWarn}>{` · ${billShown.warn}`}</Text> : null}
                  </Text>
                </View>
                {billShown.off ? null : <Icon name="chev" size={20} color={billFill ? colors.fgOnFill : colors.fgSecondary} />}
              </TouchableOpacity>
            ) : null}
            {pay && !three ? (
              <TouchableOpacity style={[styles.billTile, pay.kind === 'paid' && styles.payPaid, ['wait', 'free', 'offline', 'loading'].includes(pay.kind) && styles.billTileOff]}
                onPress={openPay} disabled={pay.off} accessibilityRole="button" accessibilityLabel={`${pay.title}, ${pay.line}`} accessibilityState={{ disabled: pay.off }}>
                <Icon name={pay.kind === 'paid' ? 'checkc' : 'money'} size={26}
                  color={pay.kind === 'paid' ? colors.fgSecondary : ['wait', 'free', 'offline', 'loading'].includes(pay.kind) ? colors.fgSecondary : colors.brandPressed} />
                <View style={styles.billTileBody}>
                  <Text style={styles.billTileTitle}>{pay.title}</Text>
                  <Text style={[styles.billTileLine, ['due', 'left', 'show'].includes(pay.kind) && styles.payOwed, pay.kind === 'paid' && styles.approveSigned,
                    ['wait', 'free', 'offline', 'loading'].includes(pay.kind) && styles.payQuiet]}>{pay.line}</Text>
                </View>
                {pay.off ? null : <Icon name="chev" size={20} color={colors.fgSecondary} />}
              </TouchableOpacity>
            ) : null}
            {deposit ? (
              <TouchableOpacity style={[styles.billTile, deposit.kind === 'ok' && styles.payPaid, deposit.off && styles.billTileOff]}
                onPress={openDeposit} disabled={!deposit.tap} accessibilityRole="button" accessibilityLabel={`Deposit, ${deposit.line}`}
                accessibilityState={{ disabled: !deposit.tap }}>
                <Icon name={deposit.done ? 'checkc' : 'cash'} size={26}
                  color={deposit.kind === 'ok' ? colors.fgSecondary : deposit.off ? colors.fgSecondary : colors.brandPressed} />
                <View style={styles.billTileBody}>
                  <Text style={styles.billTileTitle}>Deposit</Text>
                  <Text style={[styles.billTileLine, deposit.kind === 'ok' && styles.approveSigned, deposit.off && styles.payQuiet]}>{deposit.line}</Text>
                </View>
                {deposit.tap && !deposit.off ? <Icon name="chev" size={20} color={colors.fgSecondary} /> : null}
              </TouchableOpacity>
            ) : null}
            {deposit && deposit.tap === 'take' ? <Text style={styles.depositHint}>{VISIT_HINT}</Text> : null}
            {perms && perms.paymentsLine ? <Text style={styles.permLine}>{perms.paymentsLine}</Text> : null}
            {drafted ? <Box kind="info" icon="doc" title={drafted.title} text={drafted.text} style={styles.drafted} /> : null}
            {estimateRequest ? (
              <TouchableOpacity style={styles.estReq} onPress={() => navigation.navigate('Estimate', { id: estimateRequest.id, from: 'Visit' })}
                accessibilityRole="button" accessibilityLabel={`${estimateRequest.title}, ${estimateRequest.line}`}>
                <Icon name="doc" size={22} color={colors.fgSecondary} />
                <View style={styles.billTileBody}>
                  <Text style={styles.estReqTitle}>{estimateRequest.title}</Text>
                  <Text style={styles.estReqLine}>{estimateRequest.line}</Text>
                </View>
                <Icon name="chev" size={20} color={colors.fgSecondary} />
              </TouchableOpacity>
            ) : null}


            {card.office ? (
              <View style={styles.office} accessibilityRole="summary" onLayout={placed('office')}>
                <View style={styles.officeTop}>
                  <Icon name="message" size={18} color={colors.fgSecondary} />
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

          {closedNow ? <Section label="Problem">{problemBody}</Section> : null}

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

          {diagBlock && !closedNow ? (
            <View style={styles.section}>
              <DiagnosisHead />
              <DiagnosisBody block={diagBlock} blocked={blocked} onPress={() => diag.open(diagBlock.opens)}
                changed={updated && updated.was.diagnosis ? <ChangedWas text={updated.was.diagnosis} /> : null} />
            </View>
          ) : null}

          {!shown.visit.legacy ? (
            <Section label={photos ? photosTitle(photos.length) : 'Photos'}>
              <PhotoGrid photos={photos} header={photoHeader} upload={upload} waiting={waiting}
                onOpen={openViewer}
                onRetry={() => upload && sendPhoto(upload.file)}
                onCancel={() => setUpload(null)} />
            </Section>
          ) : null}

          {/* with the three (design app-dock) No access is a quiet link at the end, not in the foot */}
          {three && bar && bar.noAccess ? (
            <NoAccessLink off={barOff} busy={!!pending && !failure && pending.action === 'no_access'} onPress={() => press('no_access')} />
          ) : null}
        </ScrollView>
      )}

      {card && bar ? (
        <ActionBar bar={bar} pending={pending} failure={failure} blocked={blocked} bottom={insets.bottom}
          onPress={press}
          onRetry={() => pending && send(pending)}
          onCancel={() => { setPending(null); setFailure(null); }}
          onNote={extras ? () => setNoteOpen(true) : null}
          bill={billButton} billLink={billLink} steps={steps} onStep={stepPress}
          three={three} threeNext={threeNext} threeBusy={threeBusy} threeFailure={threeFail} onThree={pressThree}
          onSkip={busy.current || pending ? null : openSkip} hint={nowWordsOf(shown.visit)} />
      ) : null}
      {shown ? (
        <>
          {sendOpen && known && known.bill && known.status === 'issued' ? (
            <SendSheet id={id} bill={known.bill} required={copyRequired(known.bill, shown.visit)} bottom={insets.bottom}
              onSent={sentBill} onShow={showBill} onClose={() => setSendOpen(false)} />
          ) : null}
          <FinishSheet visible={finishOpen} choices={finishChoicesNow} initial={finishInitial}
            subtitle={finishSubtitle(shown.visit, n)} bottom={insets.bottom}
            noDeposit={(outcome) => noDepositYet(shown.visit, outcome, { offline: problem === 'offline' })}
            onTakeDeposit={takeDepositFromFinish}
            onClose={() => setFinishOpen(false)}
            onFinish={finishVisit}
            diagnosis={diagCurrent ? {
              asks: (outcome) => finishAsksDiagnosis(shown.visit, outcome),
              needs: (outcome) => finishNeedsDiagnosis(shown.visit, outcome),
              text: finishText, failure: finishFailure, sending: diag.sheet.sending,
              onChangeText: (t) => { setFinishText(t); setFinishFailure(null); },
            } : null} />
          <SkipSheet stepKey={skipKey} sending={skipSending} failure={skipFailure} bottom={insets.bottom}
            onSkip={doSkip} onClose={() => setSkipKey(null)} />
          <DiagnosisSheet {...diag.sheet} visible={diag.sheet.visible && !!diagBlock} bottom={insets.bottom}
            onChangeText={diag.setText} onSave={diag.save} onUseTheirs={diag.keepTheirs} onAddMine={diag.addMine} onSaveMine={diag.saveMine} onClose={diag.close} />
          <NoAccessSheet step={noAccessStep} words={noAccessWords(shown.visit, hidden)} bottom={insets.bottom}
            onClose={() => setNoAccessStep(null)}
            onCall={() => { if (hidden) callOffice(userId); else callCustomer(shown.visit, userId); setNoAccessStep('close'); }}
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

// The Bill tile's words when the customer's signature for it was refused while it waited (#91)
const ACK_REFUSED_WARN = 'signature not accepted · new signature needed';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgCard },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingLeft: 4, paddingRight: 14, borderRadius: 22 },
  backText: { fontSize: 17, fontWeight: '600', color: colors.fgDefault },
  noticeWrap: { paddingHorizontal: 16, paddingTop: 8 },
  body: { paddingBottom: 32 },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 4 },
  // «On my way skipped · …» under the tag (design app-skip k2)
  skLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  skLineText: { flex: 1, fontSize: 15, color: colors.fgSecondary },
  // the state as one line (calm): a small icon, the words, the Undo link beside them
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 32 },
  stateText: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.fgDefault },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.fgDefault },
  addr: { fontSize: 16, lineHeight: 22, color: colors.fgSecondary },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  bigBtn: { flex: 1, height: 48, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigFill: { flex: 1.4, backgroundColor: colors.brand },
  bigGhost: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderControl },
  bigText: { fontSize: 17, fontWeight: '600' },
  // the facts (calm p2): a label column and the value in normal weight, thin rules between
  facts: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  factLabel: { width: 72, fontSize: 15, lineHeight: 21, color: colors.fgSecondary },
  factBody: { flex: 1, minWidth: 0 },
  factValue: { fontSize: 15, lineHeight: 21, color: colors.fgDefault },
  // a block of the body without a frame (Problem, Bill, Diagnosis): small caps over plain text
  block: { marginTop: 16, gap: 6 },
  blockLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, color: colors.fgSecondary },
  struck: { textDecorationLine: 'line-through', color: colors.fgSecondary },
  // «Updated by the office» (design .upd) and a field that changed (.chg, .chg-was)
  // calm: a grey 1 pt frame on white, black words (no blue)
  upd: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  updIcon: { marginTop: 1 },
  updBody: { flex: 1 },
  updTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.fgDefault },
  updLine: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  chg: { marginTop: 4, marginHorizontal: -2, paddingVertical: 8, paddingLeft: 12, paddingRight: 10, borderLeftWidth: 2, borderLeftColor: colors.borderStrong },
  chgWas: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  // CHANGED / NEW: the one framed label of the calm look (as New on My day), not a blue pill
  chgPill: { paddingHorizontal: 5, height: 19, lineHeight: 17, borderRadius: 4, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden', color: colors.fgDefault, fontSize: 12, fontWeight: '600' },
  chgText: { flexShrink: 1, fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  // The Bill tile (design app-invoice visit-done): a draft is the filled one
  // calm (QA on #112): white with a grey 1 pt frame, no teal fill
  billTile: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  billTileFill: { backgroundColor: colors.brandPressed },
  // over the approval: white, as a tile with nothing to do now (the Designer on #90)
  billTileQuiet: { borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  billTileOff: { borderColor: colors.borderDefault, backgroundColor: colors.bgSunken },
  billTileBody: { flex: 1 },
  // «Estimate requested · EST-…» (design visit-diagnosis .vd-est: indigo, as Sold)
  // calm: white, a grey 1 pt frame (no indigo)
  estReq: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  estReqTitle: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  estReqLine: { fontSize: 14, color: colors.fgSecondary },
  billTileTitle: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  billTileLine: { fontSize: 15, fontWeight: '600', color: colors.brandPressed },
  billTileOnFill: { color: colors.fgOnFill },
  billTileTextOff: { color: colors.fgDisabled },
  billTileWarn: { color: colors.warningFg },
  // Pay (design payments pay-states): owed in warning brown, paid green, waiting grey
  payPaid: { borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  payOwed: { color: colors.warningFg },
  payQuiet: { color: colors.fgSecondary },
  approveTodo: { borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  approveTodoLine: { color: colors.fgSecondary },
  approveSigned: { color: colors.fgSecondary },
  drafted: { marginTop: 10 },
  depositHint: { marginTop: 8, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  // a permission the office switched off (src/perms): one quiet line in place of what is hidden
  permLine: { marginTop: 10, fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  // the code bold, not large (calm: «Get in» is information, not a warning)
  accessCode: { fontWeight: '700', color: colors.fgDefault },
  // «From the office» (calm): white, a grey 1 pt frame, black words — no blue box
  office: { marginTop: 14, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  officeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  officeTitle: { fontSize: 15, fontWeight: '700', color: colors.fgDefault },
  officeNote: { paddingBottom: 8, paddingLeft: 26 },
  officeNoteNext: { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  officeHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  officeHead: { fontSize: 13, fontWeight: '600', color: colors.fgSecondary },
  officeNew: { height: 19, lineHeight: 17, paddingHorizontal: 5, borderRadius: 4, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden', color: colors.fgDefault, fontSize: 12, fontWeight: '600' },
  officeText: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  officeMore: { minHeight: 44, justifyContent: 'center', paddingLeft: 26 },
  officeMoreText: { fontSize: 15, fontWeight: '600', color: colors.brandPressed, textDecorationLine: 'underline' },
  // a section (calm): a thin rule over it, not a grey band; the label 600, spaced 0.8 (the Designer on #112)
  section: { marginHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, color: colors.fgSecondary },
  text: { fontSize: 16, lineHeight: 22, color: colors.fgDefault },
  quiet: { fontSize: 15, lineHeight: 20, color: colors.fgMutedField },
  appliance: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applianceText: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  applianceType: { fontWeight: '700', color: colors.fgDefault },
  teamLine: { fontSize: 15, color: colors.fgDefault },
  teamLabel: { fontWeight: '600', color: colors.fgSecondary },
  hist: { paddingLeft: 12, paddingVertical: 4, borderLeftWidth: 4 },
  histPast: { borderLeftColor: colors.borderStrong },
  // this visit black, others grey (calm: the one orange stays the button)
  histThis: { borderLeftColor: colors.fgDefault },
  histLater: { borderLeftColor: colors.borderDefault },
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
