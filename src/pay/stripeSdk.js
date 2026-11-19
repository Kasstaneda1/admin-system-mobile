// Stripe's React Native SDK, only when this build has its native module (ONL-APP2). The JS of the
// app may run on a build made before @stripe/stripe-react-native was added (a dev build with
// Metro, an older install): the package throws on import there (TurboModuleRegistry.getEnforcing
// of 'StripeSdk'), so it is never imported at the top of a file. stripeSdk() looks the native
// module up first without throwing and requires the package only then; no module — null, and
// «Card details» is not offered (cardEntry.canEnterCard). Asked once per run.
import { NativeModules, TurboModuleRegistry } from 'react-native';
import { pickSdk } from './cardEntry';

let sdk;
const nativeModule = (name) => {
  const turbo = TurboModuleRegistry && typeof TurboModuleRegistry.get === 'function' ? TurboModuleRegistry.get(name) : null;
  return turbo || (NativeModules && NativeModules[name]) || null;
};

export function stripeSdk() {
  if (sdk === undefined) {
    sdk = pickSdk({ get: nativeModule, load: () => require('@stripe/stripe-react-native') });
  }
  return sdk;
}

export const cardSdkReady = () => !!stripeSdk();

// The URL scheme of the app (app.json scheme): a bank's check (3-D Secure) comes back to it
export const RETURN_URL = 'semix-tech://stripe-redirect';
