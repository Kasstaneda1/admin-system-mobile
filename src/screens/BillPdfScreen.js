// The PDF of an issued bill, as the customer gets it (the server's file, downloaded by
// BillSendScreen into the phone's cache): shown full screen, Share at the top right.
// Showing it on the phone is not giving it: the customer must keep a copy (send screen).
import React, { useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors } from '../constants/colors';
import { TopBar, billStyles } from '../bill/parts';

export default function BillPdfScreen({ route, navigation }) {
  const { uri, label = '' } = route.params || {};
  const [loading, setLoading] = useState(true);
  const dir = uri ? uri.slice(0, uri.lastIndexOf('/') + 1) : undefined;
  return (
    <SafeAreaView edges={['top']} style={billStyles.screen}>
      <StatusBar style="dark" />
      <TopBar back="Bill" title={label ? `${label} · PDF` : 'PDF'} onBack={() => navigation.goBack()}
        right="Share" onRight={() => Share.share({ url: uri, title: label ? `Bill ${label}` : 'Bill' }).catch(() => {})} />
      <View style={styles.body}>
        <WebView source={{ uri }} originWhitelist={['file://*', 'about:*']} allowingReadAccessToURL={dir} allowFileAccess
          onLoadEnd={() => setLoading(false)} style={styles.web} />
        {loading ? <ActivityIndicator style={styles.wait} color={colors.brand} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.bgPage },
  web: { flex: 1, backgroundColor: colors.bgPage },
  wait: { position: 'absolute', top: 40, alignSelf: 'center' },
});
