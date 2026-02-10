import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import EstimatesScreen from './src/screens/EstimatesScreen';
import EstimateDetailScreen from './src/screens/EstimateDetailScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null; // TODO: Add loading screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#14B8A6',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Login"
          options={{ headerShown: false }}
        >
          {(props) => <LoginScreen {...props} onLoginSuccess={() => setIsAuthenticated(true)} />}
        </Stack.Screen>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'SEMIX Technician' }}
        />
        <Stack.Screen
          name="Estimates"
          component={EstimatesScreen}
          options={{ title: 'My Estimates' }}
        />
        <Stack.Screen
          name="EstimateDetail"
          component={EstimateDetailScreen}
          options={{ title: 'Estimate Details' }}
        />
        <Stack.Screen
          name="Salary"
          component={SalaryScreen}
          options={{ title: 'Salary Portal' }}
        />
        <Stack.Screen
          name="Receipts"
          component={ReceiptsScreen}
          options={{ title: 'Submit Receipt' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
