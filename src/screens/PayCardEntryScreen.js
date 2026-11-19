// «Card payment» with the card taken in the app (ONL-APP2, ONLINE_PAYMENT_SPEC.md §9 п. 2;
// backend #241; pay/cardEntry.js). After the tip (PayTipScreen): who the tip is for → Card details
// (Stripe's Payment Sheet in customFlow: it only takes the card — scanned with the camera, which
// opens first, or typed; the name on the card always) → the customer signs
// under «I authorize <Company> to charge $X …» → Charge $X → Processing… → «Payment went through»,
// when Stripe's webhook has written it on the bill (the app records nothing).
// Charge: the signature goes first (card-signature → file_id); then the sheet's confirm calls our
// handler with the card's PaymentMethod, the handler asks the server for the PaymentIntent
// (card-intent) and hands its client_secret to the SDK only on a fresh open answer — a retry after
// a lost answer sends the same client_request_id and the first PaymentMethod (§9: never confirm a
// kept client_secret). The handler reads the attempt from the store by bill, not from this screen,
// so Back and in again finds the same attempt.
// Neutral words: the screen does not say whose hands the phone is in (§9 п. 2).
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { ackAPI, billAPI, cardAPI } from '../services/api';
import { useAuth } from '../session/AuthContext';
import { logError } from '../utils/logError';
import { newRequestId } from '../myDay/actions';
import { usd } from '../bill/model';
import { chargeOf } from '../pay/model';
import {
  ackHint, cardChangeable, cardError, cardReopen, cardLine, cardTipChoices, cardTips, confirmStep, consentText, dropEntry, entryLocked, entryOf, makeConfirmHandler, paidLine,
  sheetError, startEntry,
} from '../pay/cardEntry';
import { POLL_MS, WAIT_MS, arrivedOf, onlineIds } from '../pay/online';
import { RETURN_URL, stripeSdk } from '../pay/stripeSdk';
import SignaturePad from '../approve/SignaturePad';
import { BigHead, Choice, Field, Section, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

export default function PayCardEntryScreen({ route, navigation }) {
  const { id, visit, bill: firstBill, part = false } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const meId = user && Number.isInteger(user.id) ? user.id : null;
  const billId = firstBill.id;
  const [, redraw] = useReducer((n) => n + 1, 0);

  // the attempt: kept from before when the amount and the tip are the same, or locked
  const kept = entryOf(billId);
  const cents = kept && entryLocked(kept) ? kept.amountCents : route.params.cents;
  const tipCents = kept && entryLocked(kept) ? kept.tipCents : (route.params.tipCents || 0);
  const attemptRef = useRef(null);
  if (!attemptRef.current) {
    attemptRef.current = kept && (entryLocked(kept) || (kept.amountCents === cents && kept.tipCents === tipCents))
      ? kept : startEntry(billId, { requestId: newRequestId(), amountCents: cents, tipCents, forKey: 'me' });
  }
  const attempt = attemptRef.current;
  const locked = entryLocked(attempt);

  const [forKey, setForKey] = useState(attempt.forKey || 'me');
  const [setup, setSetup] = useState(null);             // card-setup's answer
  // 'Visa ···· 4242' of the sheet; a sent attempt keeps it for the screen coming back (the sheet
  // in the SDK keeps the card until the next initPaymentSheet)
  const [card, setCard] = useState(locked ? attempt.card : null);
  const [ack, setAck] = useState(undefined);            // the signature for the bill: undefined — not known
  const [opening, setOpening] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [signer, setSigner] = useState(attempt.signer || ((firstBill.customer && firstBill.customer.name) || ''));
  const [charging, setCharging] = useState(false);
  const [problem, setProblem] = useState(attempt.uncertain ? 'No answer from the server. Press Charge again: the card is never charged twice.' : null);
  const [phase, setPhase] = useState(attempt.going ? 'processing' : 'form'); // form | processing | paid | stale
  const [arrived, setArrived] = useState(null);
  const [since, setSince] = useState(attempt.going ? Date.now() : null);
  const pad = useRef(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // the customer's signature for the bill «after the work»: read on opening and on coming back
  // from it; no answer — no hint
  useFocusEffect(useCallback(() => {
    let live = true;
    ackAPI.get(id).then((data) => { if (live && alive.current) setAck(data ? (data.acknowledgment || null) : undefined); }).catch(() => {});
    return () => { live = false; };
  }, [id]));

  const total = cents + tipCents;
  const company = (setup && setup.merchant_display_name) || (firstBill.company && (firstBill.company.legal_name || firstBill.company.name)) || '';
  const consent = consentText(company, cents, tipCents);
  const choices = cardTipChoices(visit, firstBill.technician && firstBill.technician.name);
  const tips = useMemo(() => cardTips(tipCents, forKey, visit, meId), [tipCents, forKey, visit, meId]);
  const charge = chargeOf(firstBill, part);

  // ---------- Card details: the sheet ----------
  const openCard = async () => {
    const sdk = stripeSdk();
    if (!sdk || opening || charging || !cardChangeable(attempt)) return;
    // another card after a charge went out: the PaymentIntent is checked against the first card
    // (stripe-ios 25.9 compares the fingerprint) — a new attempt, a new signature (the Architect on #66)
    // an unclear attempt whose sheet was lost keeps its ids: the server decides at Charge (the Architect on #67)
    if (cardReopen(attempt) === 'again') again(null);
    setOpening(true);
    setProblem(null);
    try {
      let s = setup;
      if (!s) {
        s = await cardAPI.setup(id);
        if (!alive.current) return;
        setSetup(s);
      }
      if (Number.isInteger(s.balance_cents) && cents > s.balance_cents) {
        setProblem(`The balance is ${usd(s.balance_cents)} now: someone recorded a payment. Start the card payment again.`);
        return;
      }
      await sdk.initStripe({ publishableKey: s.publishable_key, stripeAccountId: s.stripe_account, urlScheme: 'semix-tech' });
      const init = await sdk.initPaymentSheet({
        merchantDisplayName: s.merchant_display_name,
        customFlow: true,
        intentConfiguration: { mode: { amount: total, currencyCode: 'USD' }, paymentMethodTypes: ['card'], confirmHandler: handlerFor(id, billId) },
        billingDetailsCollectionConfiguration: { name: 'always' },
        opensCardScannerAutomatically: true,          // the camera opens first (0.59+); typing stays one tap away
        style: 'alwaysLight',
        returnURL: RETURN_URL,
        appearance: { colors: { primary: colors.brand } },
      });
      if (init.error) { setProblem(sheetError(init) || 'The card form did not open. Try again.'); return; }
      const shown = await sdk.presentPaymentSheet();
      if (!alive.current) return;
      const why = sheetError(shown);
      if (why) { setProblem(why); return; }
      const line = cardLine(shown.paymentOption);
      if (line) { attempt.card = line; setCard(line); }
    } catch (error) {
      if (!alive.current) return;
      const no = cardError(error);
      if (no.kind === 'failed') logError('Error opening the card form:', error);
      if (no.kind === 'gone') { navigation.popToTop(); return; }
      setProblem(no.text);
    } finally {
      if (alive.current) setOpening(false);
    }
  };

  // ---------- Charge ----------
  const chargeIt = async () => {
    const sdk = stripeSdk();
    if (!sdk || charging || !card) return;
    const name = signer.trim();
    if (!name) { setProblem('Type the name of who signs.'); return; }
    setCharging(true);
    setProblem(null);
    try {
      if (!attempt.known) {
        try { attempt.known = onlineIds((await billAPI.get(id)).bill); } catch (e) { attempt.known = onlineIds(firstBill); }
      }
      if (!attempt.signatureFileId) {
        const png = pad.current ? await pad.current.png() : null;
        if (!png) { setProblem('Ask the customer to sign above the line.'); return; }
        const saved = await cardAPI.signature(id, png);
        attempt.signatureFileId = saved.file_id;
      }
      if (!attempt.sent) {
        attempt.forKey = forKey;
        attempt.tips = tips;
        attempt.signer = name;
        attempt.consent = consent;
      }
      attempt.ready = true;
      attempt.outcome = null;
      const result = await sdk.confirmPaymentSheetPayment();
      attempt.ready = false;                            // the handler did not run: no press left for it
      if (!alive.current) return;
      const next = confirmStep(result, attempt.outcome);
      if (next.step === 'wait') { wait(); return; }
      if (next.step === 'again') { again(next.text); return; }
      if (next.step === 'refusal') { afterRefusal(next.error); return; }
      // the sheet failed before our handler: nothing went to the server, the attempt stays as it was
      // while unclear that means the sheet is gone: «Change» comes back, on the same attempt (the Architect on #67)
      if (next.step === 'form') { if (attempt.unclear) attempt.formLost = true; setProblem(next.text); return; }
      // the SDK failed after our client_secret without a clear no of the card: it may have charged —
      // locked, no «Change»: the next Charge asks the server, its answer decides (the Architect on #66)
      attempt.uncertain = true;
      attempt.unclear = true;
      setProblem(next.text);
    } catch (error) {
      if (!alive.current) return;
      const no = cardError(error);
      if (no.kind === 'failed') logError('Error charging the card:', error);
      if (no.kind === 'gone') { navigation.popToTop(); return; }
      afterRefusal(no);
    } finally {
      if (alive.current) { setCharging(false); redraw(); }
    }
  };

  const lastBill = useRef(firstBill);
  const backToPay = () => navigation.popTo('Pay', { id, visit, bill: lastBill.current });
  const wait = () => { attempt.going = true; setSince(Date.now()); setPhase('processing'); };
  const again = (text) => {
    // a new request and a new signature (§9: 409 attempt_closed); the card is entered again
    Object.assign(attempt, { requestId: newRequestId(), signatureFileId: null, paymentMethodId: null, sent: false, uncertain: false, going: false, unclear: false, formLost: false, card: null });
    setCard(null);
    setDrawn(false);
    if (pad.current) pad.current.clear();
    setProblem(text);
  };
  const afterRefusal = (no) => {
    if (no.next === 'wait') { wait(); return; }
    if (no.next === 'again') { again(no.text); return; }
    if (no.next === 'restart') { dropEntry(billId); setProblem(no.text); setPhase('restart'); return; }
    setProblem(no.text);
  };

  // ---------- waiting for Stripe's webhook ----------
  const check = useCallback(async () => {
    try {
      const data = await billAPI.get(id);
      if (!alive.current || !data || !data.bill) return;
      lastBill.current = data.bill;
      const came = arrivedOf(data.bill, attempt.known || onlineIds(firstBill));
      if (came) { setArrived(came); setPhase('paid'); dropEntry(billId); }
    } catch (e) { /* the next tick asks again */ }
  }, [id, attempt, firstBill, billId]);
  useFocusEffect(useCallback(() => {
    if (phase !== 'processing' || !since) return undefined;
    const t = setInterval(() => {
      if (Date.now() - since >= WAIT_MS) { setPhase('stale'); return; }
      check();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [phase, since, check]));

  const ready = !!card && (drawn || !!attempt.signatureFileId) && !!signer.trim();
  const sdkMissing = !stripeSdk();
  const hint = phase === 'form' ? ackHint(ack) : null;

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Tip" title="Card payment" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={billStyles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={payStyles.body} keyboardShouldPersistTaps="handled">
          <BigHead label="Charge on the card" big={usd(total)} sub={tipCents > 0 ? `${charge.title} ${usd(cents)} + tip ${usd(tipCents)}` : `${charge.title} ${usd(cents)}`} />

          {phase === 'paid' && arrived ? (
            <Box kind="done" icon="checkc" style={payStyles.gap} title="Payment went through"
              text={`${paidLine(arrived.cents, cents, tipCents)} ${arrived.paid ? 'The bill is paid; the office sees it now.' : 'Stripe confirmed it.'}`} />
          ) : phase === 'processing' ? (
            <Box kind="info" icon="clock" style={payStyles.gap} title="Processing…" text="Stripe is charging the card. The payment shows here by itself in a few seconds." />
          ) : phase === 'stale' ? (
            <Box kind="warn" icon="clock" style={payStyles.gap} title="Still processing"
              text="No result in 10 minutes. Do not charge again: check the bill later, or ask the office." />
          ) : (
            <>
              {sdkMissing ? (
                <Box kind="warn" icon="warn" style={payStyles.gap} title="Update the app"
                  text="This version of the app cannot take cards. Take the payment another way." />
              ) : null}
              {hint ? (
                <View style={payStyles.gap}>
                  <Box kind="info" icon="info" title={hint.title} text={hint.text} />
                  <TouchableOpacity onPress={() => navigation.navigate('Ack', { id, visit })} disabled={charging} accessibilityRole="link" style={styles.hintLink}>
                    <Text style={styles.hintLinkText}>{hint.link}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {tipCents > 0 ? (
                <Section label="Tip for">
                  <View style={styles.choices} accessibilityRole="radiogroup">
                    {choices.map((c) => (
                      <Choice key={c.key} on={forKey === c.key} title={c.title} sub={c.sub} off={locked || charging} onPress={() => setForKey(c.key)} />
                    ))}
                  </View>
                </Section>
              ) : null}
              <Section label="Card">
                {card ? (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardText} accessibilityLabel={`Card ${card}`}>{card}</Text>
                    {cardChangeable(attempt) ? (
                      <TouchableOpacity onPress={openCard} disabled={opening || charging} accessibilityRole="button" style={styles.change}>
                        <Text style={styles.changeText}>Change</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <PlainButton text="Card details" icon="card" waiting={opening} off={sdkMissing || charging} onPress={openCard} />
                    <Text style={payStyles.text}>Type the card or scan it with the camera. The number goes to Stripe, never to SEMIX.</Text>
                  </>
                )}
              </Section>
              {card ? (
                <Section label="Signature">
                  <Text style={styles.consent}>{consent}</Text>
                  {attempt.signatureFileId ? (
                    <Text style={payStyles.text}>Signed. It is kept with this charge.</Text>
                  ) : (
                    <SignaturePad ref={pad} onDrawn={setDrawn} disabled={charging} />
                  )}
                  <Field label="Name" value={signer} onChange={setSigner} placeholder="Who signs" max={200} off={locked || charging} />
                </Section>
              ) : null}
            </>
          )}
        </ScrollView>

        <Foot bottom={insets.bottom} note={phase === 'form' && card && !ready ? 'The customer signs, then Charge.' : null}>
          {problem ? <Box kind="danger" icon="warn" text={problem} /> : null}
          {phase === 'paid' ? (
            <MainButton text="Done · back to the payment" onPress={() => backToPay()} />
          ) : phase === 'processing' ? (
            <PlainButton text="Back to the payment" onPress={() => backToPay()} />
          ) : phase === 'stale' || phase === 'restart' ? (
            <MainButton text="Back to the payment" onPress={() => backToPay()} />
          ) : (
            <MainButton text={`Charge ${usd(total)}`} icon="card" off={!ready || sdkMissing} waiting={charging} onPress={chargeIt} />
          )}
        </Foot>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// The sheet's confirm (pay/cardEntry.js makeConfirmHandler): the attempt by bill, card-intent
const handlerFor = (visitId, billId) => makeConfirmHandler({ getAttempt: () => entryOf(billId), sendIntent: (body) => cardAPI.intent(visitId, body) });

const styles = StyleSheet.create({
  choices: { gap: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  cardText: { fontSize: 18, fontWeight: '700', color: colors.fgDefault },
  change: { paddingHorizontal: 8, paddingVertical: 10 },
  changeText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  hintLink: { alignSelf: 'flex-start', paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  hintLinkText: { fontSize: 17, fontWeight: '700', color: colors.brandPressed },
  consent: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.fgDefault },
});
