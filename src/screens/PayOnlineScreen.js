// «Pay online» (ONL-APP1, ONLINE_PAYMENT_SPEC.md §9 п. 1): a QR code of the bill's pay link,
// big on the screen; the customer points their phone's camera at it and pays on Stripe's page
// (card or Apple Pay). The amount comes from PayScreen: the full balance (the server counts it
// at the moment of Pay) or a part. The app records nothing: Stripe's webhook writes the payment
// and this screen sees it on the bill, read again every 3 seconds while it is open, for 10
// minutes. Back does not cancel the link: a payment that comes later shows on the bill by itself.
// A new code is a new link: it revokes this technician's earlier links of the bill (an open page
// of the old one stops), so it is offered only after an error or when the waiting is over.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { billAPI, payAPI } from '../services/api';
import { logError } from '../utils/logError';
import { usd } from '../bill/model';
import { POLL_MS, WAIT_MS, arrivedLine, arrivedOf, linkBody, linkError, linkOf, onlineIds } from '../pay/online';
import QrCode from '../pay/QrCode';
import { BigHead, payStyles } from '../pay/parts';
import { Box, Foot, MainButton, PlainButton, TopBar, billStyles } from '../bill/parts';

export default function PayOnlineScreen({ route, navigation }) {
  const { id, bill: firstBill, cents = null, part = false } = route.params || {};
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [bill, setBill] = useState(firstBill);
  const [link, setLink] = useState(null);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(null);
  const [arrived, setArrived] = useState(null);
  const [since, setSince] = useState(null);             // when the waiting started (ms)
  const [stale, setStale] = useState(false);            // the 10 minutes are over
  const [lost, setLost] = useState(false);              // the last check had no answer
  const known = useRef(onlineIds(firstBill));           // online payments before this code
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const make = useCallback(async () => {
    setMaking(true);
    setFailed(null);
    try {
      const data = await payAPI.payLink(id, linkBody({ part, cents }));
      if (!alive.current) return;
      const got = linkOf(data);
      if (!got) { setFailed('Could not make the code. Try again.'); return; }
      setLink(got);
      setSince(Date.now());
      setStale(false);
    } catch (error) {
      if (!alive.current) return;
      const no = linkError(error);
      if (no.kind === 'failed') logError('Error making the pay link:', error);
      if (no.kind === 'gone') { navigation.popToTop(); return; }
      setFailed(no.text);
    } finally {
      if (alive.current) setMaking(false);
    }
  }, [id, part, cents, navigation]);
  useEffect(() => { make(); }, [make]);

  const check = useCallback(async () => {
    try {
      const data = await billAPI.get(id);
      if (!alive.current || !data || !data.bill) return;
      setBill(data.bill);
      setLost(false);
      const came = arrivedOf(data.bill, known.current);
      if (came) setArrived(came);
    } catch (error) {
      if (alive.current) setLost(true);
    }
  }, [id]);

  // waiting: every few seconds while the screen is open, until it came or the time is over
  useFocusEffect(useCallback(() => {
    if (!link || arrived || stale || !since) return undefined;
    const t = setInterval(() => {
      if (Date.now() - since >= WAIT_MS) { setStale(true); return; }
      check();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [link, arrived, stale, since, check]));

  const label = bill.label || `#${bill.bill_number}`;
  const company = (bill.company && (bill.company.legal_name || bill.company.name)) || 'the company';
  const shown = link && link.cents !== null ? link.cents : cents;
  const side = Math.min(width - 64, 320);
  const due = Number.isInteger(bill.balance_cents) ? bill.balance_cents : null;

  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Payment" title="Pay online" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={payStyles.body}>
        <BigHead label={`Pay online · ${label}`} big={shown !== null ? usd(shown) : '—'} sub={`To ${company}${part ? ' · part of the balance' : ''}`} />

        {arrived ? (
          <>
            <Box kind="done" icon="checkc" style={payStyles.gap} title={arrivedLine(arrived)}
              text={arrived.paid ? 'Stripe confirmed it. The bill is paid; the office sees it now.' : `Stripe confirmed it. ${due !== null ? `${usd(due)} is still due.` : ''}`.trim()} />
          </>
        ) : link ? (
          <View style={styles.wrap}>
            <View style={styles.codeCard}>
              <QrCode text={link.url} side={side} />
            </View>
            <Text style={styles.ask}>Ask the customer to point their phone camera at the code.</Text>
            <Text style={[payStyles.text, styles.center]}>They pay on a secure Stripe page: card or Apple Pay. A tip is not part of this: a cash tip is recorded after.</Text>
            {stale ? (
              <Box kind="info" icon="clock" title="Still waiting"
                text="No payment came in 10 minutes. If the customer paid, check again. If the code does not open, show a new one." />
            ) : null}
            <Text style={[styles.note, styles.center]}>Going back does not cancel it: if the customer pays, it shows on the bill.</Text>
          </View>
        ) : failed ? (
          <Box kind="danger" icon="warn" style={payStyles.gap} text={failed} />
        ) : (
          <Text style={[payStyles.text, styles.making]}>Making the code…</Text>
        )}
      </ScrollView>

      <Foot bottom={insets.bottom} note={link && !arrived && !stale ? (lost ? 'Waiting for the payment… no connection to check' : 'Waiting for the payment…') : null}>
        {arrived ? (
          <MainButton text="Done · back to the payment" onPress={() => navigation.goBack()} />
        ) : failed ? (
          <>
            <MainButton text="Try again" icon="refresh" waiting={making} onPress={make} />
            <PlainButton text="Back · take it another way" onPress={() => navigation.goBack()} />
          </>
        ) : stale ? (
          <>
            <MainButton text="Check again" icon="refresh" onPress={() => { setStale(false); setSince(Date.now()); check(); }} />
            <PlainButton text="Show a new code" waiting={making} onPress={make} />
          </>
        ) : (
          <PlainButton text="Back · take it another way" off={making} onPress={() => navigation.goBack()} />
        )}
      </Foot>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  center: { textAlign: 'center' },
  note: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  making: { paddingHorizontal: 16, paddingTop: 16 },
  codeCard: { alignSelf: 'center', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard },
  ask: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: colors.fgDefault, textAlign: 'center' },
});
