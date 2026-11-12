// «Add from the price book» (design-mockups/app-invoice price-book): the price book of the
// job's company, by tab (Services, Materials, Discounts), with a search. A tap adds the item
// as a line (the server copies its name, terms, price and tax); an item already on the bill
// shows the tick and is not added again from here. Services and materials may also be a line
// of the technician's own; a discount only from the list (the office keeps it).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import Icon from '../myDay/Icon';
import { Sheet } from '../myDay/visitBar';
import { BOOK_TABS, bookRows, searchHint } from './model';

// book: { company, items } | null while loading; failed: words when it did not load;
// adding: the item id being added
export function PriceBookSheet({ visible, tab: startTab, book, failed, bill, kindWord, adding, bottom, onTryAgain, onAdd, onOwn, onClose }) {
  const [tab, setTab] = useState(startTab || 'service');
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) { setTab(startTab || 'service'); setQuery(''); } }, [visible, startTab]);
  const rows = book ? bookRows(book.items, tab, query, bill) : [];
  const company = book && book.company ? book.company.name : null;
  return (
    <Sheet visible={visible} onClose={onClose} bottom={bottom} keyboard>
      <Text style={styles.title} accessibilityRole="header">Add from the price book</Text>
      <Text style={styles.sub}>{[company, `prices for ${kindWord}`].filter(Boolean).join(' · ')}. The office keeps this list.</Text>
      <View style={styles.search}>
        <Icon name="search" size={20} color={colors.fgSecondary} />
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder={searchHint(tab)}
          placeholderTextColor={colors.fgMutedField} autoCorrect={false} returnKeyType="search" accessibilityLabel={searchHint(tab)} />
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {BOOK_TABS.map((t) => {
          const on = t.key === tab;
          return (
            <TouchableOpacity key={t.key} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {!book && !failed ? <ActivityIndicator style={styles.wait} color={colors.brand} /> : null}
        {failed ? (
          <View style={styles.failed}>
            <Text style={styles.failedText}>{failed}</Text>
            <TouchableOpacity style={styles.retry} onPress={onTryAgain} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {book && !rows.length ? (
          <Text style={styles.empty}>{query.trim() ? 'Nothing found. Try another word.' : 'Nothing here yet. The office adds prices on the site.'}</Text>
        ) : null}
        {rows.map((r) => {
          const busy = adding === r.item.id;
          const dead = r.onBill || adding !== null;
          return (
            <TouchableOpacity key={r.key} style={[styles.row, r.onBill && styles.rowOn]} disabled={dead} onPress={() => onAdd(r.item)}
              accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.sub}${r.onBill ? ', on the bill' : ''}`} accessibilityState={{ disabled: dead, busy }}>
              <View style={styles.rowBody}>
                <Text style={[styles.rowName, r.onBill && styles.rowNameOn]}>{r.name}</Text>
                <Text style={styles.rowSub}>{r.sub}</Text>
              </View>
              {busy ? <ActivityIndicator color={colors.brandPressed} /> : (
                <View style={[styles.dot, r.onBill && styles.dotOn]}>
                  <Icon name={r.onBill ? 'check' : 'plus'} size={20} color={r.onBill ? colors.fgOnFill : colors.brandPressed} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {tab === 'discount' ? (
        <Text style={styles.note}>Discounts come only from this list.</Text>
      ) : (
        <TouchableOpacity style={styles.own} onPress={() => onOwn(tab)} accessibilityRole="button">
          <Text style={styles.ownText}>Not in the list? Add your own line</Text>
        </TouchableOpacity>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.fgDefault },
  sub: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.bgSunken },
  searchInput: { flex: 1, height: 48, fontSize: 17, color: colors.fgDefault },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: colors.bgSunken },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: colors.bgCard, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  tabText: { fontSize: 16, fontWeight: '600', color: colors.fgSecondary },
  tabTextOn: { fontWeight: '800', color: colors.brandPressed },
  list: { maxHeight: 300, marginHorizontal: -16 },
  wait: { marginVertical: 24 },
  failed: { gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  failedText: { fontSize: 15, lineHeight: 20, color: colors.dangerFg },
  retry: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.borderControl, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 16, fontWeight: '700', color: colors.fgDefault },
  empty: { fontSize: 15, lineHeight: 20, color: colors.fgSecondary, paddingHorizontal: 16, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  rowOn: { backgroundColor: colors.brandSoft },
  rowBody: { flex: 1 },
  rowName: { fontSize: 17, fontWeight: '700', color: colors.fgDefault },
  rowNameOn: { color: colors.brandPressed },
  rowSub: { fontSize: 15, color: colors.fgSecondary },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  dotOn: { backgroundColor: colors.brandPressed },
  note: { fontSize: 15, color: colors.fgSecondary, textAlign: 'center', paddingVertical: 10 },
  own: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  ownText: { fontSize: 17, fontWeight: '700', color: colors.fgDefault, textDecorationLine: 'underline' },
});
