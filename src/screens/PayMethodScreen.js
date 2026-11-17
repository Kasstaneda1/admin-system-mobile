// «How they pay» (design-mockups/payments: method-cash, method-check, method-card, method-zelle,
// method-other). The amount comes from PayScreen; here the technician picks one of six tiles,
// fills what the method needs and records it. One record — one method. Who has the money is the
// server's (cash, check, other — the technician; card, Zelle, Venmo, bank transfer — the office):
// the line under the button says it. A card goes on to the tip the customer picks (PayTipScreen)
// and the summary (PayCardScreen); the rest are recorded here.
// Not here yet: the company's Zelle number (the profile's payment_instructions does not come with
// the bill yet) — the screen says «the company» instead.
// A check: its photo, optional (pay/checkPhoto.js, backend #191) — taken here, uploaded by itself
// when Record is pressed, then the payment names it (check_photo_file_id). Once uploaded the same
// file goes with every repeat of the press, so the request stays the same.
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { payAPI } from '../services/api';
import { checkPhotoRefusal } from '../pay/checkPhoto';
import { takeCheckPhoto } from '../pay/takeCheckPhoto';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { OTHER_CHOICES, chosenMethod, dueOf, holderLine, methodWord, payError, paymentBody, recordedLine, shortPerson } from '../pay/model';
import { BigHead, CheckPhotoRow, Choice, Field, MethodTiles, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, TopBar, billStyles } from '../bill/parts';

export default function PayMethodScreen({ route, navigation }) {
  const { id, visit, bill, cents, part = false, note: partNote = '', later = null } = route.params || {};
  const insets = useSafeAreaInsets();
  const [tile, setTile] = useState(null);
  const [otherKey, setOtherKey] = useState(null);
  const [otherName, setOtherName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [note, setNote] = useState(partNote);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(null);
  const [photo, setPhoto] = useState(null);             // the check's photo: { uri, bytes, fileId }
  const [shooting, setShooting] = useState(false);
  // a press without an answer: the photo already named stays (a new one would make a new request)
  const [unsure, setUnsure] = useState(false);

  const label = bill.label || `#${bill.bill_number}`;
  const company = (bill.company && (bill.company.legal_name || bill.company.name)) || 'the company';
  const me = shortPerson(bill.technician && bill.technician.name);
  const due = dueOf(bill);
  const sub = part ? `Part of ${usd(due)} · ${usd(due - cents)} left after this`
    : (bill.paid_cents || 0) > 0 ? `The rest of ${label}` : `The whole bill ${label}${tile === 'card' ? ' · by card' : ''}`;
  const { method, name } = chosenMethod(tile, otherKey, otherName);
  const word = method ? methodWord(method, name) : null;

  // the same press again (no answer) sends the same request: the server answers it once
  const requestId = useRef(null);
  const sent = useRef(null);
  const built = useMemo(() => (method ? paymentBody({ cents, method, name, note, checkNumber: tile === 'check' ? checkNumber : '', later, requestId: 'x' }) : null), [cents, method, name, note, checkNumber, tile, later]);

  const pickTile = (m) => { setTile(m); setFailed(null); };
  const takePhoto = async () => {
    if (shooting || sending) return;
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
    if (tile !== 'check' || !photo) return { fileId: null };
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
    if (sending || shooting || !built) return;
    if (built.error) { setFailed(built.error); return; }
    if (part && !note.trim()) { setFailed('Part of the balance: the note says why.'); return; }
    setSending(true);
    setFailed(null);
    const file = await photoFile();
    if (file.stop !== undefined) {
      setSending(false);
      if (file.stop) setFailed(file.stop);
      return;
    }
    const withPhoto = file.fileId ? paymentBody({ cents, method, name, note, checkNumber: tile === 'check' ? checkNumber : '', checkPhotoFileId: file.fileId, later, requestId: 'x' }) : built;
    const key = JSON.stringify({ ...withPhoto.body, client_request_id: null });
    if (sent.current !== key) { requestId.current = newRequestId(); sent.current = key; }
    const body = { ...withPhoto.body, client_request_id: requestId.current };
    try {
      const data = await payAPI.record(id, body);
      navigation.popTo('Pay', { id, visit, bill: data.bill, recorded: { key: requestId.current, line: recordedLine(data.payment) } });
    } catch (error) {
      // the server did not take the photo with the payment: take it again (the payment is not written)
      const refused = checkPhotoRefusal(error);
      if (refused && refused.again && file.fileId) {
        setPhoto(null);
        setFailed(refused.text);
        return;
      }
      const f = payError(error);
      if (f.kind === 'failed') logError('Error recording a payment:', error);
      if (f.kind === 'gone') { navigation.popToTop(); return; }
      if ((f.kind === 'offline' || f.kind === 'failed') && file.fileId) setUnsure(true);
      setFailed(f.text);
    } finally {
      setSending(false);
    }
  };
  const toTip = () => {
    if (part && !note.trim()) { setFailed('Part of the balance: the note says why.'); return; }
    navigation.navigate('PayTip', { id, visit, bill, cents, part, note: note.trim(), later });
  };

  const holder = holderLine(method, { me });
  const otherNeed = tile === 'other' && (!otherKey || (otherKey === 'else' && !otherName.trim()));

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Payment" title="How they pay" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={payStyles.body} keyboardShouldPersistTaps="handled">
          <BigHead label={`Collect for ${label}`} big={usd(cents)} sub={sub} />
          <Section label="Pay with">
            <MethodTiles value={tile} onPick={pickTile} off={sending} />
          </Section>

          {tile === 'cash' ? (
            <Section label="Cash">
              <Text style={payStyles.text}>Count it with the customer. «Keep the change» is a tip: record it after, as a tip.</Text>
            </Section>
          ) : null}
          {tile === 'check' ? (
            <Section label="Check">
              <Field label="Check number" value={checkNumber} onChange={setCheckNumber} placeholder="1042" max={30} keyboard="number-pad"
                hint={`Pay to: ${company}. A check made out to you is not accepted.`} />
              <CheckPhotoRow photo={photo} onTake={takePhoto} off={sending || shooting || unsure} />
            </Section>
          ) : null}
          {tile === 'card' ? (
            <Section label="Card">
              <Box kind="info" icon="info" title="Next: the customer picks a tip"
                text="Then this app shows the total. Charge it in the card app (Square) on this phone. Never type a card number into SEMIX." />
              <Field label="Note" optional value={note} onChange={setNote} placeholder="Anything the office should know" max={500} />
            </Section>
          ) : null}
          {tile === 'zelle' || tile === 'venmo' ? (
            <Section label={tile === 'zelle' ? 'Zelle' : 'Venmo'}>
              <Box kind="warn" icon="warn" title={`Only to ${company}`}
                text="To the company’s account, never to your own number or email. Ask the customer to show the sent payment." />
              <Field label="Note" optional value={note} onChange={setNote} placeholder="Confirmation # from their app" max={500} />
            </Section>
          ) : null}
          {tile === 'other' ? (
            <Section label="Other · which one?" need>
              <View style={styles.choices} accessibilityRole="radiogroup">
                {OTHER_CHOICES.map((c) => (
                  <Choice key={c.key} on={otherKey === c.key} title={c.title} sub={c.sub} onPress={() => { setOtherKey(c.key); setFailed(null); }} off={sending} />
                ))}
              </View>
              {otherKey === 'else' ? (
                <TextInput style={payStyles.input} value={otherName} onChangeText={setOtherName} maxLength={60} placeholder="What the customer used"
                  placeholderTextColor={colors.fgMutedField} accessibilityLabel="What the customer used" autoFocus />
              ) : null}
              <Field label="Note" optional value={note} onChange={setNote} placeholder="Anything the office should know" max={500} />
            </Section>
          ) : null}
          {part && tile && tile !== 'card' && tile !== 'zelle' && tile !== 'venmo' && tile !== 'other' ? (
            <Section label="Note">
              <TextInput style={payStyles.input} value={note} onChangeText={setNote} maxLength={500} placeholder="Why only part"
                placeholderTextColor={colors.fgMutedField} accessibilityLabel="Note" />
            </Section>
          ) : null}
          {failed ? <Box kind="danger" icon="warn" style={payStyles.gap} text={failed} /> : null}
        </ScrollView>

        <Foot bottom={insets.bottom} note={tile === 'card' ? 'Hand the phone to the customer for the tip.' : holder}>
          {tile === 'card' ? (
            <MainButton text="Next · add tip" icon="chev" onPress={toTip} />
          ) : (
            <MainButton text={word ? `Record ${usd(cents)} ${word}` : 'Choose how they pay'} icon={word ? 'check' : null}
              off={!method || otherNeed} waiting={sending} onPress={record} />
          )}
        </Foot>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = { choices: { gap: 8 } };
