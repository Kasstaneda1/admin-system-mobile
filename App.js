import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './src/constants/colors';
import { AuthProvider, useAuth } from './src/session/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import MyDayScreen from './src/screens/MyDayScreen';
import VisitScreen from './src/screens/VisitScreen';
import MovedScreen from './src/screens/MovedScreen';
import RouteScreen from './src/screens/RouteScreen';
import BillScreen from './src/screens/BillScreen';
import BillLineScreen from './src/screens/BillLineScreen';
import BillPreviewScreen from './src/screens/BillPreviewScreen';
import HomeScreen from './src/screens/HomeScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import PartsScreen from './src/screens/PartsScreen';
import WarehouseScreen from './src/screens/WarehouseScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import UnpaidScreen from './src/screens/UnpaidScreen';

const Stack = createNativeStackNavigator();

// The splash (app.json, expo-splash-screen) stays until the kept session is read, so the first
// screen follows it straight, without an empty frame
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}

// Signed out: only the sign-in screen. Signed in: the technician's screens, My day first
// (TECH_APP_MY_DAY_SPEC.md §3), so there is no way back to sign in but Logout; the end of a
// session swaps the set by itself. The older screens open from My day's bar: Salary, Parts,
// and More (the old menu, Home, with Warehouse, Payments, Receipts, Unpaid and Logout).
function Screens() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === 'loading') {
    return null;
  }

  return (
    <NavigationContainer>
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
              name="Route"
              component={RouteScreen}
              options={{ headerShown: false, title: 'Route' }}
            />
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'More' }}
            />
            <Stack.Screen
              name="Salary"
              component={SalaryScreen}
              options={{ title: 'Salary' }}
            />
            <Stack.Screen
              name="Parts"
              component={PartsScreen}
              options={{ title: 'Parts' }}
            />
            <Stack.Screen
              name="Warehouse"
              component={WarehouseScreen}
              options={{ title: 'Warehouse' }}
            />
            <Stack.Screen
              name="Payments"
              component={PaymentsScreen}
              options={{ title: 'Payments' }}
            />
            <Stack.Screen
              name="Receipts"
              component={ReceiptsScreen}
              options={{ title: 'Receipts' }}
            />
            <Stack.Screen
              name="Unpaid"
              component={UnpaidScreen}
              options={{ title: 'Unpaid Records' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
