// Directions and Call from a visit: the phone's own apps, no network of ours needed, so they
// work offline too (design README: «без сети Call и Directions работают»).
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import { addressLine, directionsLinks, telLink } from './model';

async function open(url, failText) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(failText);
  }
}

// A choice of a few options: the iOS action sheet, an alert with buttons on Android.
// options: [{ text, onPress }]
function choose(title, message, options) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [...options.map((o) => o.text), 'Cancel'], cancelButtonIndex: options.length },
      (index) => { if (index < options.length) options[index].onPress(); },
    );
  } else {
    Alert.alert(title, message, [...options, { text: 'Cancel', style: 'cancel' }]);
  }
}

// Directions: Apple Maps or Google Maps (design: the «Open directions in» sheet)
export function openDirections(visit) {
  const links = directionsLinks(visit);
  if (!links) {
    Alert.alert('No address', 'This visit has no address. Call the office.');
    return;
  }
  choose('Open directions in', addressLine(visit), [
    { text: 'Apple Maps', onPress: () => open(links.apple, 'Could not open Apple Maps') },
    { text: 'Google Maps', onPress: () => open(links.google, 'Could not open Google Maps') },
  ]);
}

// The customer's phones: the main one, then the second ones with their labels
export function phonesOf(visit) {
  const phones = [];
  if (telLink(visit.phone)) phones.push({ label: '', number: visit.phone });
  for (const p of visit.additional_phones || []) {
    if (p && telLink(p.number)) phones.push({ label: p.label || '', number: p.number });
  }
  return phones;
}

// Call: straight to the one phone; a choice when the customer has several
export function callCustomer(visit) {
  const phones = phonesOf(visit);
  if (!phones.length) {
    Alert.alert('No phone number', 'This visit has no phone number. Call the office.');
    return;
  }
  const call = (number) => open(telLink(number), 'Calls are not available on this device');
  if (phones.length === 1) {
    call(phones[0].number);
    return;
  }
  choose(`Call ${visit.client_name || 'the customer'}`, null,
    phones.map((p) => ({ text: p.label ? `${p.label} · ${p.number}` : p.number, onPress: () => call(p.number) })));
}
