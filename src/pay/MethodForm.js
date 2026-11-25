// «How they pay» on the Pay screen (USABILITY_2026-11-24 §5, design tech-app usab-u4-pay: a full
// payment in two taps — Cash, «Record $332.07 cash»). Was its own screen (PayMethodScreen); the
// record is the same. The technician picks one of six tiles, fills what the method needs and
// records it. One record — one method. Who has the money is the server's (cash, check, other — the
// technician; card, Zelle, Venmo, bank transfer — the office): the line under the button says it.
// A card goes on to the tip the customer picks (PayTipScreen) and the summary (PayCardScreen).
// Zelle and Venmo: «Only to SEMIX CORP: (718) 555-0100» from the profile's payment_instructions
// (the bill answer, backend #192); without them — «Only to SEMIX CORP», «Ask the office for the
// company’s number. Never to your own.» (the Designer, #51).
// A check: its photo, optional (pay/checkPhoto.js, backend #191) — taken here and uploaded by
// itself when Record is pressed, BEFORE the attempt starts: the payment's line names it
// (check_photo_file_id), so every repeat of the line carries the same file (the Teamlead on #52).
// A send without an answer (pay/attempts.js): the amount, method, fields and the photo stay as
// sent (shownOf: locked); the next press sends the same request (the server records it once) —
// «Already recorded» when it had gone through. The server refusing the photo (photo_*, 413)
// before anything was recorded drops the attempt: a new photo, a new attempt.
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { colors } from '../constants/colors';
import { payAPI } from '../services/api';
import { afterPhotoUpload, checkPhotoRefusal } from './checkPhoto';
import { takeCheckPhoto } from './takeCheckPhoto';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { OTHER_CHOICES, alreadyLine, chosenMethod, holderLine, methodWord, payError, paymentBody, paymentInstructionsOf, recordedLine } from './model';
import { LOOK_AGAIN, attemptOf, linesLocked, noAnswer, runAttempt, startAttempt } from './attempts';
import { canEnterCard, entryLocked, entryOf } from './cardEntry';
import { cardSdkReady } from './stripeSdk';
import { noteOf, shownOf } from './method';
import { CheckPhotoRow, Choice, Field, MethodTiles, Section, payStyles } from './parts';
import { Box } from '../bill/parts';

// amount: { cents, part, error } of the Pay screen; partNote: its «Why only part?» note;
// onRecorded({ key, line }) — the record went (or had gone) through
export function useMethodForm({ id, visit, bill, amount, partNote, later, navigation, onRecorded }) {
  const billId = bill ? bill.id : null;
  const kept = billId ? attemptOf(billId, 'method') : null;
  // a card payment of this bill that went (or may have gone) to the server keeps the card
  const cardKept = billId ? linesLocked(attemptOf(billId, 'card')) : false;
  // a card charge sent from «Card details» (pay/cardEntry.js) keeps the card too
  const entryKept = billId ? entryLocked(entryOf(billId)) : false;
  // the card: in this app (Stripe, ONL-APP2) when the company and this build can, else the card app
  const canEntry = !!bill && canEnterCard(bill, cardSdkReady()) && !cardKept;

  const [tile, setTile] = useState(null);
  const [cardWayPicked, setCardWay] = useState(null);
  const [otherKey, setOtherKey] = useState(null);
  const [otherName, setOtherName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [methodNote, setMethodNote] = useState('');
  // the check's photo: { uri, bytes, fileId }
  const [photo, setPhoto] = useState(null);
  const [shooting, setShooting] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(null);
  const [, redraw] = useReducer((n) => n + 1, 0);
  // the screen is still open: Back or the swipe during the photo's upload must not start a payment
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // again after Fast Refresh, which runs the cleanup and the effect anew
    return () => { alive.current = false; };
  }, []);

  const shown = shownOf({ kept, cardKept, entryKept, picked: { tile, otherKey, otherName, checkNumber, note: methodNote, photo } });
  const { locked } = shown;
  const cents = locked ? shown.cents : amount.cents;
  const part = locked ? shown.part : amount.part;
  const note = locked ? shown.note : noteOf(part, partNote, methodNote);
  const cardWay = cardWayPicked || (entryKept || canEntry ? 'entry' : 'app');
  const entry = shown.tile === 'card' && canEntry && cardWay === 'entry';
  const { method, name } = chosenMethod(shown.tile, shown.otherKey, shown.otherName);
  const word = method ? methodWord(method, name) : null;
  const numberOf = (t) => (t === 'check' ? shown.checkNumber : '');

  const built = method && Number.isFinite(cents) ? paymentBody({ cents, method, name, note, checkNumber: numberOf(shown.tile), later, requestId: 'x' }) : null;

  // after a record (or «Collect now» again): a new payment starts from nothing chosen
  const reset = () => {
    setTile(null);
    setCardWay(null);
    setOtherKey(null);
    setOtherName('');
    setCheckNumber('');
    setMethodNote('');
    setPhoto(null);
    setFailed(null);
  };

  const pickTile = (m) => { setTile(m); setFailed(null); };
  const takePhoto = async () => {
    if (shooting || sending || locked) return;
    setShooting(true);
    try {
      const taken = await takeCheckPhoto();
      if (!taken) return;
      if (taken.error) { setFailed(taken.error); return; }
      setPhoto({ uri: taken.uri, bytes: taken.bytes, fileId: null });
      setFailed(null);
    } finally {
      setShooting(false);
    }
  };
  // The photo's file on the server, uploaded now if it is not yet: { fileId } or { stop } (shown)
  const photoFile = async () => {
    if (shown.tile !== 'check' || !photo) return { fileId: null };
    if (photo.fileId) return { fileId: photo.fileId };
    try {
      const data = await payAPI.checkPhoto(id, photo.bytes);
      const fileId = data && data.photo ? data.photo.file_id : null;
      setPhoto((p) => (p === photo ? { ...p, fileId } : p));
      return { fileId };
    } catch (error) {
      const refused = checkPhotoRefusal(error);
      if (refused) {
        if (refused.again) setPhoto(null);
        return { stop: refused.text };
      }
      const f = payError(error);
      if (f.kind === 'failed') logError('Error uploading a check photo:', error);
      if (f.kind === 'gone') { navigation.popToTop(); return { stop: null }; }
      return { stop: `The photo of the check did not go. ${f.text}` };
    }
  };
  const record = async () => {
    if (sending || shooting || !built || !bill) return;
    let attempt = attemptOf(bill.id, 'method');
    if (!attempt) {
      // the amount first: a part says why (the server: note_required)
      if (amount.error) { setFailed(amount.error); return; }
      if (built.error) { setFailed(built.error); return; }
      // the photo first: the attempt's line names its file, the same on every repeat
      setSending(true);
      setFailed(null);
      const file = afterPhotoUpload(await photoFile(), { left: !alive.current });
      // left during the upload (Back, the swipe): no payment starts — nothing recorded
      if (file.left) return;
      if (!file.go) {
        setSending(false);
        if (file.text) setFailed(file.text);
        return;
      }
      const body = file.fileId
        ? paymentBody({ cents, method, name, note, checkNumber: numberOf(shown.tile), checkPhotoFileId: file.fileId, later, requestId: 'x' }).body
        : built.body;
      const rid = newRequestId();
      attempt = startAttempt(bill.id, 'method', {
        lines: [{ rid, body: { ...body, client_request_id: rid } }],
        view: { cents, part, tile: shown.tile, otherKey, otherName, checkNumber, note, photo: photo && file.fileId ? { ...photo, fileId: file.fileId } : null },
      });
    }
    setSending(true);
    setFailed(null);
    const result = await runAttempt(attempt, { record: (b) => payAPI.record(id, b) });
    setSending(false);
    redraw();
    if (result.done) {
      reset();
      onRecorded({ key: attempt.lines[0].rid, line: recordedLine(result.data.payment) });
      return;
    }
    if (result.already) {
      reset();
      onRecorded({ key: `already-${attempt.lines[0].rid}`, line: alreadyLine(result.already) });
      return;
    }
    // the server did not take the photo with the payment (nothing recorded: the attempt is gone)
    const refused = checkPhotoRefusal(result.error);
    if (refused && refused.again && !attemptOf(bill.id, 'method')) {
      setPhoto(null);
      setFailed(refused.text);
      return;
    }
    const f = result.failed;
    if (f.kind === 'failed') logError('Error recording a payment:', result.error);
    if (f.kind === 'gone') { navigation.popToTop(); return; }
    setFailed(noAnswer(f) ? `${f.text} ${LOOK_AGAIN}` : f.text);
  };
  const toTip = () => {
    if (amount.error) { setFailed(amount.error); return; }
    navigation.navigate('PayTip', { id, visit, bill, cents, part, note, later, entry });
  };

  const otherNeed = shown.tile === 'other' && (!shown.otherKey || (shown.otherKey === 'else' && !shown.otherName.trim()));
  // a send without an answer, come back to: say that the next press sends the same payment
  const failure = failed || (locked && kept.uncertain ? `No answer from the server. ${LOOK_AGAIN}` : null);
  return {
    shown, locked, cents, part, word, method, entry, canEntry, cardWay, cardKept, entryKept, sending, shooting, failure, otherNeed,
    holder: holderLine(method),
    setCardWay, setOtherKey: (k) => { setOtherKey(k); setFailed(null); }, setOtherName, setCheckNumber, setMethodNote,
    pickTile, takePhoto, record, toTip, reset,
  };
}

// PAY WITH: the tiles and what the chosen method needs. With a part the note is «Why only part?»
// above, so the methods show no note field of their own.
export function MethodFields({ form, bill, part }) {
  const { shown, locked, sending, shooting } = form;
  const company = (bill.company && (bill.company.legal_name || bill.company.name)) || 'the company';
  const instructions = paymentInstructionsOf(bill);
  const tile = shown.tile;
  const noteField = (placeholder) => (part ? null : (
    <Field off={locked} label="Note" optional value={shown.note} onChange={form.setMethodNote} placeholder={placeholder} max={500} />
  ));
  return (
    <>
      <Section label="Pay with">
        <MethodTiles value={tile} onPick={form.pickTile} off={sending || locked || form.cardKept || form.entryKept} />
        {tile === 'cash' ? <Text style={payStyles.text}>Cash: count it with the customer. «Keep the change» is a tip.</Text> : null}
      </Section>
      {tile === 'check' ? (
        <Section label="Check">
          <Field off={locked} label="Check number" value={shown.checkNumber} onChange={form.setCheckNumber} placeholder="1042" max={30} keyboard="number-pad"
            hint={`Pay to: ${company}. A check made out to you is not accepted.`} />
          <CheckPhotoRow photo={shown.photo} onTake={form.takePhoto} off={sending || shooting || locked} />
        </Section>
      ) : null}
      {tile === 'card' ? (
        <Section label="Card">
          {form.canEntry ? (
            <View style={styles.choices} accessibilityRole="radiogroup">
              <Choice on={form.cardWay === 'entry'} title="Card details in this app" sub="Typed or scanned with the camera. Stripe charges it after the customer signs." off={form.entryKept}
                onPress={() => form.setCardWay('entry')} />
              <Choice on={form.cardWay === 'app'} title="Another card app" sub="Charge it there, then record it here." off={form.entryKept}
                onPress={() => form.setCardWay('app')} />
            </View>
          ) : null}
          <Box kind="info" icon="info" title="Next: the customer picks a tip"
            text={form.entry ? 'Then the card details, the customer’s signature and Charge. The card number goes to Stripe, never to SEMIX.'
              : 'Then this app shows the total. Charge it in the card app on this phone. Never type a card number into SEMIX.'} />
          {noteField('Anything the office should know')}
        </Section>
      ) : null}
      {tile === 'zelle' || tile === 'venmo' ? (
        <Section label={tile === 'zelle' ? 'Zelle' : 'Venmo'}>
          <Box kind="warn" icon="warn" title={instructions ? `Only to ${company}: ${instructions}` : `Only to ${company}`}
            text={instructions ? 'To the company’s account, never to your own number or email. Ask the customer to show the sent payment.'
              : 'Ask the office for the company’s number. Never to your own.'} />
          {noteField('Confirmation # from their app')}
        </Section>
      ) : null}
      {tile === 'other' ? (
        <Section label="Other · which one?" need>
          <View style={styles.choices} accessibilityRole="radiogroup">
            {OTHER_CHOICES.map((c) => (
              <Choice key={c.key} on={shown.otherKey === c.key} title={c.title} sub={c.sub} onPress={() => form.setOtherKey(c.key)} off={sending || locked} />
            ))}
          </View>
          {shown.otherKey === 'else' ? (
            <TextInput style={payStyles.input} value={shown.otherName} onChangeText={form.setOtherName} editable={!locked} maxLength={60} placeholder="What the customer used"
              placeholderTextColor={colors.fgMutedField} accessibilityLabel="What the customer used" autoFocus />
          ) : null}
          {noteField('Anything the office should know')}
        </Section>
      ) : null}
    </>
  );
}

const styles = { choices: { gap: 8 } };
