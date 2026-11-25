// The customer's copy of the bill — the choice and its sending (rules in bill/copy.js; design
// tech-bill-plain d2-ny, d5, d6): rows of 52 pt (icon 24, title 17, line 14, a radio on the right),
// the chosen one in brand; under them the agreement tick of the chosen way (Email, Share).
// useCopy holds the choice and gives the copy: Email — POST …/bill/email; Share — the PDF through
// iOS sharing, then POST …/bill/delivered { via: shared, consent: true } once the sheet says it
// went (closed without sending — nothing is written, the choice stays); Printed copy handed —
// delivered { via: handed }; Show it on this phone — the PDF on the screen, nothing written.
// A bill already marked delivered (another way, the office) is not marked again; an email still
// goes (the customer asks for it again).
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Sheet } from '../myDay/visitBar';
import { MainButton } from './parts';
import { colors } from '../constants/colors';
import { billAPI } from '../services/api';
import { logError } from '../utils/logError';
import Icon from '../myDay/Icon';
import { downloadBillPdf } from './pdf';
import { alreadyGiven, buttonOf, copyCheck, copyFailText, copyWaysOf, emailBody, firstWay, jobEmailOf, tickOf } from './copy';

// The choice and the sending. bill: the issued bill; required: the copy is required (copy.js
// copyRequired); quiet: start on the way without a tick (copy.js firstWay — the customer's screens). give() → { ok: true, bill (the answer's, or null: read it again), show (Show it
// on this phone: the screen opens the PDF) } | { ok: false, text (null: the share sheet closed) }
export function useCopy({ id, bill, required, quiet = false }) {
  // the job's address until the technician changes it (the bill may come after the screen opens)
  const [typed, setTo] = useState(null);
  const to = typed === null ? jobEmailOf(bill) : typed;
  const ways = useMemo(() => copyWaysOf({ bill, required, to }), [bill, required, to]);
  const [picked, setPicked] = useState(null);
  const way = picked && ways.some((w) => w.way === picked) ? picked : firstWay(ways, to, quiet);
  const [ticked, setTicked] = useState(false);
  const tick = tickOf(way);

  const changeTo = useCallback(() => {
    Alert.prompt('The customer’s email', 'The bill goes to this address. The job keeps its own.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', onPress: (value) => { setTo(String(value || '').trim()); setPicked('email'); } },
    ], 'plain-text', to, 'email-address');
  }, [to]);

  const give = useCallback(async () => {
    const stop = copyCheck({ way, to, ticked });
    if (stop) return { ok: false, text: stop };
    if (way === 'show') return { ok: true, bill: null, show: true };
    try {
      if (way === 'email') {
        const data = await billAPI.email(id, emailBody(to, ticked));
        return { ok: true, bill: (data && data.bill) || null };
      }
      if (way === 'share') {
        const file = await downloadBillPdf(id, bill);
        const shared = await Share.share({ url: file.uri, title: `Bill ${bill.label || `#${bill.bill_number}`}` });
        if (!shared || shared.action !== Share.sharedAction) return { ok: false, text: null };
      }
      if (bill.delivered_at) return { ok: true, bill: null };
      const data = await billAPI.delivered(id, way === 'share' ? { via: 'shared', consent: true } : { via: 'handed' });
      return { ok: true, bill: (data && data.bill) || null };
    } catch (error) {
      if (alreadyGiven(error)) return { ok: true, bill: null };
      const status = error && error.response ? error.response.status : 0;
      if (status >= 500 && status !== 502 && status !== 503) logError('Error giving the bill’s copy:', error);
      return { ok: false, text: copyFailText(error) };
    }
  }, [way, to, ticked, id, bill]);

  return { ways, way, setWay: setPicked, to, changeTo, ticked, setTicked, tick, give };
}

// The rows and the tick — right under the chosen row, so it is seen with it (QA 25.11). label: «THE CUSTOMER’S COPY» over them, or null; off: while sending
export function CopyChoice({ copy, label = null, off = false, onChange = null }) {
  const { ways, way, setWay, changeTo, ticked, setTicked, tick } = copy;
  const pick = (w) => {
    if (off) return;
    // Email without an address: the address first
    if (w === 'email' && !copy.to) { changeTo(); return; }
    setWay(w);
    setTicked(false);
    if (onChange) onChange();
  };
  return (
    <View>
      {label ? <Text style={styles.label} accessibilityRole="header">{label}</Text> : null}
      <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="How the customer gets the copy">
        {ways.map((w) => {
          const on = w.way === way;
          return (
            <React.Fragment key={w.way}>
            <TouchableOpacity style={[styles.row, on && styles.rowOn]} onPress={() => pick(w.way)} disabled={off}
              accessibilityRole="radio" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={w.line ? `${w.title}, ${w.line.replace(' · Change', '')}` : w.title}>
              <Icon name={w.icon} size={24} color={colors.fgDefault} />
              <View style={styles.flex}>
                <Text style={styles.title}>{w.title}</Text>
                {w.way === 'email' ? (
                  // the address line: Email not chosen yet — the tap chooses it (QA 25.11: it opened
                  // the address change instead); chosen — «Change» edits the address
                  <TouchableOpacity onPress={() => (on ? changeTo() : pick('email'))} disabled={off} accessibilityRole="button"
                    accessibilityLabel={on ? 'Change the email address' : 'Email the PDF'} hitSlop={{ top: 6, bottom: 6 }}>
                    <Text style={styles.line} numberOfLines={1}>{w.line}</Text>
                  </TouchableOpacity>
                ) : w.line ? <Text style={styles.line} numberOfLines={1}>{w.line}</Text> : null}
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.dot} /> : null}</View>
            </TouchableOpacity>
            {on && tick ? (
              <TouchableOpacity style={styles.tick} onPress={() => { if (!off) { setTicked((t) => !t); if (onChange) onChange(); } }} disabled={off}
                accessibilityRole="checkbox" accessibilityState={{ checked: ticked, disabled: off }} accessibilityLabel={tick.words}>
                <View style={[styles.box, ticked && styles.boxOn]}>{ticked ? <Icon name="check" size={18} color={colors.fgOnFill} /> : null}</View>
                <Text style={styles.tickText}>{tick.words}</Text>
              </TouchableOpacity>
            ) : null}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// «Send the bill» over the visit (d6): the same ways, the button follows the choice. Mounted
// when it opens (a new choice each time). bill: the issued bill; required: copy.js copyRequired.
// onSent(bill | null) — given (null: read the bill again); onShow({ uri }) — the PDF to show on
// this phone (downloaded here); onClose — back to the visit.
export function SendSheet({ id, bill, required, bottom, onSent, onShow, onClose }) {
  const copy = useCopy({ id, bill, required });
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  const button = buttonOf('send', copy.way);
  const press = async () => {
    if (busy) return;
    setBusy(true);
    setFail(null);
    const r = await copy.give();
    if (r.ok && r.show) {
      try {
        const file = await downloadBillPdf(id, bill);
        setBusy(false);
        onShow(file);
      } catch (error) {
        setBusy(false);
        setFail(copyFailText(error).replace(/^Not sent: /, 'The PDF did not open: '));
      }
      return;
    }
    setBusy(false);
    if (r.ok) { onSent(r.bill); return; }
    if (r.text) setFail(r.text);
  };
  return (
    <Sheet visible onClose={() => { if (!busy) onClose(); }} bottom={bottom}>
      <Text style={styles.sheetTitle} accessibilityRole="header">Send the bill</Text>
      <CopyChoice copy={copy} off={busy} onChange={() => setFail(null)} />
      {fail ? <Text style={styles.fail} accessibilityRole="alert" accessibilityLiveRegion="polite">{fail}</Text> : null}
      <View style={styles.sheetButton}>
        <MainButton text={busy && copy.way !== 'show' ? 'Sending…' : button.text} icon={button.icon} onPress={press} waiting={busy} />
      </View>
    </Sheet>
  );
}

// The bill on the customer's screens (copy.js billCardOf): in full (d2) — the company and who,
// every line, the tax, Total; compact (d2-ny, d5) — one row with the total
export function BillCard({ card, compact = false, style = null }) {
  if (!card) return null;
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHead}>
        <Text style={styles.company} numberOfLines={1}>{card.company}</Text>
        <Text style={styles.who} numberOfLines={1}>{card.who}</Text>
      </View>
      {compact ? (
        <View style={styles.cardRow} accessible accessibilityLabel={`${card.one.name}${card.one.sub ? `, ${card.one.sub}` : ''}, ${card.one.amount}`}>
          <View style={styles.flex}>
            <Text style={styles.lineName}>{card.one.name}</Text>
            {card.one.sub ? <Text style={styles.lineSub}>{card.one.sub}</Text> : null}
          </View>
          <Text style={styles.amountBig}>{card.one.amount}</Text>
        </View>
      ) : (
        <>
          {card.lines.map((l) => (
            <View key={l.key} style={styles.cardRow} accessible accessibilityLabel={`${l.name}${l.sub ? `, ${l.sub}` : ''}, ${l.amount}`}>
              <View style={styles.flex}>
                <Text style={styles.lineName}>{l.name}</Text>
                {l.sub ? <Text style={styles.lineSub} numberOfLines={2}>{l.sub}</Text> : null}
              </View>
              <Text style={styles.amount}>{l.amount}</Text>
            </View>
          ))}
          {card.tax ? (
            <View style={styles.cardRow} accessible accessibilityLabel={`${card.tax.label}, ${card.tax.amount}`}>
              <Text style={[styles.flex, styles.taxName]}>{card.tax.label}</Text>
              <Text style={styles.taxAmount}>{card.tax.amount}</Text>
            </View>
          ) : null}
          <View style={styles.cardRow} accessible accessibilityLabel={`Total ${card.total}`}>
            <Text style={[styles.flex, styles.totalWord]}>Total</Text>
            <Text style={styles.totalBig}>{card.total}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { marginBottom: 14, fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  fail: { marginTop: 10, fontSize: 15, lineHeight: 20, color: colors.dangerFg },
  sheetButton: { marginTop: 14 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.bgCard, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.bgSunken },
  company: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.fgDefault },
  who: { flex: 1, textAlign: 'right', fontSize: 14, color: colors.fgSecondary },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  lineName: { fontSize: 17, lineHeight: 22, color: colors.fgDefault },
  lineSub: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  amount: { fontSize: 17, fontWeight: '700', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  amountBig: { fontSize: 19, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  taxName: { fontSize: 15, color: colors.fgSecondary },
  taxAmount: { fontSize: 15, fontWeight: '700', color: colors.fgSecondary, fontVariant: ['tabular-nums'] },
  totalWord: { fontSize: 22, fontWeight: '800', color: colors.fgDefault },
  totalBig: { fontSize: 24, fontWeight: '800', color: colors.fgDefault, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  label: { marginBottom: 8, fontSize: 13, fontWeight: '800', letterSpacing: 1.1, color: colors.fgSecondary },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderDefault, backgroundColor: colors.bgCard },
  rowOn: { borderWidth: 2, paddingHorizontal: 13.5, paddingVertical: 7.5, borderColor: colors.brand, backgroundColor: colors.brandSoft },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.fgDefault },
  line: { fontSize: 14, lineHeight: 19, color: colors.fgSecondary },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, marginTop: 8 },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
  boxOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  tickText: { flex: 1, fontSize: 16, lineHeight: 21, color: colors.fgDefault },
});
