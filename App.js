import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './src/constants/colors';
import { AppState, Linking } from 'react-native';
import { stripeSdk } from './src/pay/stripeSdk';
import { AuthProvider, useAuth } from './src/session/AuthContext';
import { outbox } from './src/estimate/outboxStore';
import { approvals } from './src/approve/store';
import { refreshUnread, setUnread } from './src/estimate/unread';
import { listenTaps, registerDevice, showWhileOpen } from './src/push/push';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import MyDayScreen from './src/screens/MyDayScreen';
import VisitScreen from './src/screens/VisitScreen';
import MovedScreen from './src/screens/MovedScreen';
import RouteScreen from './src/screens/RouteScreen';
import BillScreen from './src/screens/BillScreen';
import BillLineScreen from './src/screens/BillLineScreen';
import BillPreviewScreen from './src/screens/BillPreviewScreen';
import BillSendScreen from './src/screens/BillSendScreen';
import ApproveScreen from './src/screens/ApproveScreen';
import AckScreen from './src/screens/AckScreen';
import BillPdfScreen from './src/screens/BillPdfScreen';
import PayScreen from './src/screens/PayScreen';
import DepositScreen from './src/screens/DepositScreen';
import PayMethodScreen from './src/screens/PayMethodScreen';
import PayTipScreen from './src/screens/PayTipScreen';
import PayCardScreen from './src/screens/PayCardScreen';
import PayCardEntryScreen from './src/screens/PayCardEntryScreen';
import PayOnlineScreen from './src/screens/PayOnlineScreen';
import CashTipScreen from './src/screens/CashTipScreen';
import MoreScreen from './src/screens/MoreScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import SalaryMonthScreen from './src/screens/SalaryMonthScreen';
import SalaryJobsScreen from './src/screens/SalaryJobsScreen';
import SalaryJobScreen from './src/screens/SalaryJobScreen';
import PartsScreen from './src/screens/PartsScreen';
import EstimateScreen from './src/screens/EstimateScreen';
import WarehouseScreen from './src/screens/WarehouseScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import UnpaidScreen from './src/screens/UnpaidScreen';

const Stack = createNativeStackNavigator();
const navigation = createNavigationContainerRef();

// A push that comes while the app is open shows as a banner (src/push)
showWhileOpen();

// The splash (app.json, expo-splash-screen) stays until the kept session is read, so the first
// screen follows it straight, without an empty frame
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // A bank's check of a card (3-D Secure) opens Safari or the bank's app and comes back to the
  // app's scheme (app.json «scheme»): Stripe takes its own URLs. A build without Stripe: nothing.
  useEffect(() => {
    const sdk = stripeSdk();
    if (!sdk) return undefined;
    const take = (url) => { if (url) Promise.resolve(sdk.handleURLCallback(url)).catch(() => {}); };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', (event) => take(event && event.url));
    return () => sub.remove();
  }, []);
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}

// Signed out: only the sign-in screen. Signed in: the technician's screens, My day first
// (TECH_APP_MY_DAY_SPEC.md §3), so there is no way back to sign in but Sign out; the end of a
// session swaps the set by itself. The older screens open from My day's bar: Salary, Parts,
// and More (the route Home: the technician, Warehouse, Payments, Receipts, Unpaid, Sign out).
function Screens() {
  const { status, user } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  // Signed in, at start and on return to the app: the messages to the office still on the phone
  // go (estimate/outbox.js, never twice), the customers' signatures too (approve/queue.js) and the Parts tab gets its count of unread estimates
  const userId = status === 'signedIn' && user ? user.id : null;
  const fullName = status === 'signedIn' && user ? user.fullName || null : null;
  useEffect(() => {
    if (userId === null || userId === undefined) { setUnread(0); return undefined; }
    const wake = () => {
      outbox.flushAll(userId).catch(() => {});
      approvals.flushAll(userId).catch(() => {});
      refreshUnread(fullName, { force: true });
    };
    wake();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') wake(); });
    return () => sub.remove();
  }, [userId, fullName]);

  // Push (src/push): this phone to the server at every start and after every sign in; a tap on a
  // push opens its visit — once the screens are there (a tap that started the app waits for them)
  const [ready, setReady] = React.useState(false);
  useEffect(() => {
    if (userId !== null && userId !== undefined) registerDevice();
  }, [userId]);
  useEffect(() => {
    if (userId === null || userId === undefined || !ready) return undefined;
    return listenTaps((id) => {
      if (navigation.isReady()) navigation.navigate('Visit', { id });
    });
  }, [userId, ready]);

  if (status === 'loading') {
    return null;
  }

  return (
    <NavigationContainer ref={navigation} onReady={() => setReady(true)}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.white,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {status !== 'signedIn' ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MyDay"
              component={MyDayScreen}
              options={{ headerShown: false, title: 'My day' }}
            />
            <Stack.Screen
              name="Visit"
              component={VisitScreen}
              options={{ headerShown: false, title: 'Visit' }}
            />
            <Stack.Screen
              name="Moved"
              component={MovedScreen}
              options={{ headerShown: false, title: 'Visit' }}
            />
            <Stack.Screen
              name="Bill"
              component={BillScreen}
              options={{ headerShown: false, title: 'Bill' }}
            />
            <Stack.Screen
              name="BillLine"
              component={BillLineScreen}
              options={{ headerShown: false, title: 'Edit line' }}
            />
            <Stack.Screen
              name="BillPreview"
              component={BillPreviewScreen}
              options={{ headerShown: false, title: 'What the customer gets' }}
            />
            <Stack.Screen
              name="BillSend"
              component={BillSendScreen}
              options={{ headerShown: false, title: 'Send' }}
            />
            <Stack.Screen
              name="Approve"
              component={ApproveScreen}
              options={{ headerShown: false, title: 'Approve' }}
            />
            <Stack.Screen
              name="Ack"
              component={AckScreen}
              options={{ headerShown: false, title: 'Customer signs for the bill' }}
            />
            <Stack.Screen
              name="BillPdf"
              component={BillPdfScreen}
              options={{ headerShown: false, title: 'PDF' }}
            />
            <Stack.Screen
              name="Pay"
              component={PayScreen}
              options={{ headerShown: false, title: 'Payment' }}
            />
            <Stack.Screen
              name="Deposit"
              component={DepositScreen}
              options={{ headerShown: false, title: 'Deposit' }}
            />
            <Stack.Screen
              name="PayMethod"
              component={PayMethodScreen}
              options={{ headerShown: false, title: 'How they pay' }}
            />
            <Stack.Screen
              name="PayTip"
              component={PayTipScreen}
              options={{ headerShown: false, title: 'Add tip' }}
            />
            <Stack.Screen
              name="PayCard"
              component={PayCardScreen}
              options={{ headerShown: false, title: 'Card payment' }}
            />
            <Stack.Screen
              name="PayCardEntry"
              component={PayCardEntryScreen}
              options={{ headerShown: false, title: 'Card payment' }}
            />
            <Stack.Screen
              name="PayOnline"
              component={PayOnlineScreen}
              options={{ headerShown: false, title: 'Pay online' }}
            />
            <Stack.Screen
              name="CashTip"
              component={CashTipScreen}
              options={{ headerShown: false, title: 'Tip' }}
            />
            <Stack.Screen
              name="Route"
              component={RouteScreen}
              options={{ headerShown: false, title: 'Route' }}
            />
            <Stack.Screen
              name="Home"
              component={MoreScreen}
              options={{ headerShown: false, title: 'More' }}
            />
            <Stack.Screen
              name="Salary"
              component={SalaryScreen}
              options={{ headerShown: false, title: 'Salary' }}
            />
            <Stack.Screen
              name="SalaryMonth"
              component={SalaryMonthScreen}
              options={{ headerShown: false, title: 'Month' }}
            />
            <Stack.Screen
              name="SalaryJobs"
              component={SalaryJobsScreen}
              options={{ headerShown: false, title: 'Jobs' }}
            />
            <Stack.Screen
              name="SalaryJob"
              component={SalaryJobScreen}
              options={{ headerShown: false, title: 'Job Details' }}
            />
            <Stack.Screen
              name="Parts"
              component={PartsScreen}
              options={{ headerShown: false, title: 'Parts' }}
            />
            <Stack.Screen
              name="Estimate"
              component={EstimateScreen}
              options={{ headerShown: false, title: 'Estimate' }}
            />
            <Stack.Screen
              name="Warehouse"
              component={WarehouseScreen}
              options={{ title: 'Warehouse' }}
            />
            <Stack.Screen
              name="Payments"
              component={PaymentsScreen}
              options={{ headerShown: false, title: 'Payments' }}
            />
            <Stack.Screen
              name="Receipts"
              component={ReceiptsScreen}
              options={{ headerShown: false, title: 'Receipts' }}
            />
            <Stack.Screen
              name="Unpaid"
              component={UnpaidScreen}
              options={{ headerShown: false, title: 'Unpaid Clients' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
