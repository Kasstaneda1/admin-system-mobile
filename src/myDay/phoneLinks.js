// Directions and Call from a visit: the phone's own apps, no network of ours needed, so they
// work offline too (design README: «без сети Call и Directions работают»).
import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';
import { addressLine, directionsLinks, telLink } from './model';
import { MAPS_STOPS_MAX } from './route';
import { callOffice } from './officeStore';

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

// Nothing to go by on the visit: the words say what is missing and the «Call the office» button
// is the way out (userId: the technician signed in; without it no button, so the words say it)
function askOffice(title, message, userId) {
  if (userId == null) {
    Alert.alert(title, `${message} Call the office.`);
    return;
  }
  Alert.alert(title, message, [
    { text: 'OK', style: 'cancel' },
    { text: 'Call the office', onPress: () => callOffice(userId) },
  ]);
}

// Directions: Apple Maps or Google Maps (design: the «Open directions in» sheet)
export function openDirections(visit, userId) {
  const links = directionsLinks(visit);
  if (!links) {
    askOffice('No address', 'This visit has no address.', userId);
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
export function callCustomer(visit, userId) {
  const phones = phonesOf(visit);
  if (!phones.length) {
    askOffice('No phone number', 'This visit has no phone number.', userId);
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

// Open in Maps: the day's stops ahead in Apple Maps (all of them) or Google Maps (the next
// MAPS_STOPS_MAX), from where the phone is (route.js routeLinks). Android has no Apple Maps.
export function openRoute(links) {
  if (!links) {
    Alert.alert('No stops ahead on the map');
    return;
  }
  const google = { text: 'Google Maps', onPress: () => open(links.google, 'Could not open Google Maps') };
  const note = links.cut ? `Google Maps takes the next ${MAPS_STOPS_MAX} stops` : `${links.count} stop${links.count === 1 ? '' : 's'} ahead`;
  if (Platform.OS !== 'ios') {
    choose('Open the route in', note, [google]);
    return;
  }
  choose('Open the route in', note, [{ text: 'Apple Maps', onPress: () => open(links.apple, 'Could not open Apple Maps') }, google]);
}
