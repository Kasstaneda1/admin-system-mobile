// «How they pay» (design-mockups/payments: method-cash, method-check, method-card, method-zelle,
// method-other). The amount comes from PayScreen; here the technician picks one of six tiles,
// fills what the method needs and records it. One record — one method. Who has the money is the
// server's (cash, check, other — the technician; card, Zelle, Venmo, bank transfer — the office):
// the line under the button says it. A card goes on to the tip the customer picks (PayTipScreen)
// and the summary (PayCardScreen); the rest are recorded here.
// Zelle and Venmo: «Only to SEMIX CORP: (718) 555-0100» from the profile's payment_instructions
// (the bill answer, backend #192); without them — «Only to SEMIX CORP», «Ask the office for the
// company’s number. Never to your own.» (the Designer, #51).
// Not here yet: the photo of a check (server PR 13а-2).
// A send without an answer (pay/attempts.js): the chosen method, amount and fields stay as sent;
// the next press sends the same request (the server records it once) — «Already recorded» when it
// had gone through.
import React, { useMemo, useReducer, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { payAPI } from '../services/api';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { OTHER_CHOICES, alreadyLine, chosenMethod, dueOf, holderLine, methodWord, paymentBody, paymentInstructionsOf, recordedLine, shortPerson } from '../pay/model';
import { LOOK_AGAIN, attemptOf, linesLocked, noAnswer, runAttempt, startAttempt } from '../pay/attempts';
import { BigHead, Choice, Field, MethodTiles, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, TopBar, billStyles } from '../bill/parts';

export default function PayMethodScreen({ route, navigation }) {
  const { id, visit, bill, part = false, note: partNote = '', later = null } = route.params || {};
  // an attempt sent before without an answer (this screen left and opened again): its lines
  const kept = attemptOf(bill.id, 'method');
  const view = kept ? kept.view : null;
  const cents = view ? view.cents : route.params.cents;
  const insets = useSafeAreaInsets();
  // a card payment of this bill that went (or may have gone) to the server keeps the card
  const cardKept = linesLocked(attemptOf(bill.id, 'card'));
  const [tile, setTile] = useState(view ? view.tile : cardKept ? 'card' : null);
  const [otherKey, setOtherKey] = useState(view ? view.otherKey : null);
  const [otherName, setOtherName] = useState(view ? view.otherName : '');
  const [checkNumber, setCheckNumber] = useState(view ? view.checkNumber : '');
  const [note, setNote] = useState(view ? view.note : partNote);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(kept && kept.uncertain ? `No answer from the server. ${LOOK_AGAIN}` : null);
  const [, redraw] = useReducer((n) => n + 1, 0);
  const locked = linesLocked(attemptOf(bill.id, 'method'));

  const label = bill.label || `#${bill.bill_number}`;
  const company = (bill.company && (bill.company.legal_name || bill.company.name)) || 'the company';
  const instructions = paymentInstructionsOf(bill);
  const me = shortPerson(bill.technician && bill.technician.name);
  const due = dueOf(bill);
  const sub = part ? `Part of ${usd(due)} · ${usd(due - cents)} left after this`
    : (bill.paid_cents || 0) > 0 ? `The rest of ${label}` : `The whole bill ${label}${tile === 'card' ? ' · by card' : ''}`;
  const { method, name } = chosenMethod(tile, otherKey, otherName);
  const word = method ? methodWord(method, name) : null;

  const built = useMemo(() => (method ? paymentBody({ cents, method, name, note, checkNumber: tile === 'check' ? checkNumber : '', later, requestId: 'x' }) : null), [cents, method, name, note, checkNumber, tile, later]);

  const pickTile = (m) => { setTile(m); setFailed(null); };
  const record = async () => {
    if (sending || !built) return;
    let attempt = attemptOf(bill.id, 'method');
    if (!attempt) {
      if (built.error) { setFailed(built.error); return; }
      if (part && !note.trim()) { setFailed('Part of the balance: the note says why.'); return; }
      const rid = newRequestId();
      attempt = startAttempt(bill.id, 'method', {
        lines: [{ rid, body: { ...built.body, client_request_id: rid } }],
        view: { cents, tile, otherKey, otherName, checkNumber, note },
      });
    }
    setSending(true);
    setFailed(null);
    const result = await runAttempt(attempt, { record: (body) => payAPI.record(id, body) });
    setSending(false);
    redraw();
    if (result.done) {
      navigation.popTo('Pay', { id, visit, bill: result.data.bill, recorded: { key: attempt.lines[0].rid, line: recordedLine(result.data.payment) } });
      return;
    }
    if (result.already) {
      navigation.popTo('Pay', { id, visit, bill: result.bill, recorded: { key: `already-${attempt.lines[0].rid}`, line: alreadyLine(result.already) } });
      return;
    }
    const f = result.failed;
    if (f.kind === 'failed') logError('Error recording a payment:', result.error);
    if (f.kind === 'gone') { navigation.popToTop(); return; }
    setFailed(noAnswer(f) ? `${f.text} ${LOOK_AGAIN}` : f.text);
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
            <MethodTiles value={tile} onPick={pickTile} off={sending || locked || cardKept} />
          </Section>

          {tile === 'cash' ? (
            <Section label="Cash">
              <Text style={payStyles.text}>Count it with the customer. «Keep the change» is a tip: record it after, as a tip.</Text>
            </Section>
          ) : null}
          {tile === 'check' ? (
            <Section label="Check">
              <Field off={locked} label="Check number" value={checkNumber} onChange={setCheckNumber} placeholder="1042" max={30} keyboard="number-pad"
                hint={`Pay to: ${company}. A check made out to you is not accepted.`} />
            </Section>
          ) : null}
          {tile === 'card' ? (
            <Section label="Card">
              <Box kind="info" icon="info" title="Next: the customer picks a tip"
                text="Then this app shows the total. Charge it in the card app (Square) on this phone. Never type a card number into SEMIX." />
              <Field off={locked} label="Note" optional value={note} onChange={setNote} placeholder="Anything the office should know" max={500} />
            </Section>
          ) : null}
          {tile === 'zelle' || tile === 'venmo' ? (
            <Section label={tile === 'zelle' ? 'Zelle' : 'Venmo'}>
              <Box kind="warn" icon="warn" title={instructions ? `Only to ${company}: ${instructions}` : `Only to ${company}`}
                text={instructions ? 'To the company’s account, never to your own number or email. Ask the customer to show the sent payment.'
                  : 'Ask the office for the company’s number. Never to your own.'} />
              <Field off={locked} label="Note" optional value={note} onChange={setNote} placeholder="Confirmation # from their app" max={500} />
            </Section>
          ) : null}
          {tile === 'other' ? (
            <Section label="Other · which one?" need>
              <View style={styles.choices} accessibilityRole="radiogroup">
                {OTHER_CHOICES.map((c) => (
                  <Choice key={c.key} on={otherKey === c.key} title={c.title} sub={c.sub} onPress={() => { setOtherKey(c.key); setFailed(null); }} off={sending || locked} />
                ))}
              </View>
              {otherKey === 'else' ? (
                <TextInput style={payStyles.input} value={otherName} onChangeText={setOtherName} editable={!locked} maxLength={60} placeholder="What the customer used"
                  placeholderTextColor={colors.fgMutedField} accessibilityLabel="What the customer used" autoFocus />
              ) : null}
              <Field off={locked} label="Note" optional value={note} onChange={setNote} placeholder="Anything the office should know" max={500} />
            </Section>
          ) : null}
          {part && tile && tile !== 'card' && tile !== 'zelle' && tile !== 'venmo' && tile !== 'other' ? (
            <Section label="Note">
              <TextInput style={payStyles.input} value={note} onChangeText={setNote} editable={!locked} maxLength={500} placeholder="Why only part"
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
