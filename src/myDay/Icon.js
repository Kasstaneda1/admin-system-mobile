// The design's line icons (design-mockups/tech-app ICONS, viewBox 24, stroke 2) as black PNGs
// @1x/@2x/@3x in assets/icons, tinted with a token colour. size: 14, 18, 24 … pt.
import React from 'react';
import { Image } from 'react-native';

const ICONS = {
  back: require('../../assets/icons/back.png'),
  box: require('../../assets/icons/box.png'),
  cal: require('../../assets/icons/cal.png'),
  car: require('../../assets/icons/car.png'),
  camera: require('../../assets/icons/camera.png'),
  check: require('../../assets/icons/check.png'),
  checkc: require('../../assets/icons/checkc.png'),
  chev: require('../../assets/icons/chev.png'),
  door: require('../../assets/icons/door.png'),
  history: require('../../assets/icons/history.png'),
  home: require('../../assets/icons/home.png'),
  install: require('../../assets/icons/install.png'),
  key: require('../../assets/icons/key.png'),
  mapoff: require('../../assets/icons/mapoff.png'),
  message: require('../../assets/icons/message.png'),
  money: require('../../assets/icons/money.png'),
  more: require('../../assets/icons/more.png'),
  note: require('../../assets/icons/note.png'),
  moved: require('../../assets/icons/moved.png'),
  nav: require('../../assets/icons/nav.png'),
  people: require('../../assets/icons/people.png'),
  phone: require('../../assets/icons/phone.png'),
  pin: require('../../assets/icons/pin.png'),
  refresh: require('../../assets/icons/refresh.png'),
  replay: require('../../assets/icons/replay.png'),
  route: require('../../assets/icons/route.png'),
  search: require('../../assets/icons/search.png'),
  send: require('../../assets/icons/send.png'),
  sun: require('../../assets/icons/sun.png'),
  undo: require('../../assets/icons/undo.png'),
  warn: require('../../assets/icons/warn.png'),
  wifioff: require('../../assets/icons/wifioff.png'),
  wrench: require('../../assets/icons/wrench.png'),
  xcal: require('../../assets/icons/xcal.png'),
};

export default function Icon({ name, size = 18, color, style }) {
  const source = ICONS[name];
  if (!source) return null;
  return <Image source={source} style={[{ width: size, height: size, tintColor: color }, style]} accessibilityIgnoresInvertColors />;
}
