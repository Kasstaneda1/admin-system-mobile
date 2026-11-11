import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { authAPI } from '../services/api';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';

export default function LoginScreen() {
  const { signIn, notice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setLoading(true);
    try {
      const data = await authAPI.login(username, password);

      if (data.user.role !== 'technician') {
        // The server opened a session the app does not keep: give it back
        authAPI.revoke(data.refreshToken);
        Alert.alert('Access Denied', 'This app is only for technicians');
        return;
      }

      // The session keeps the tokens; the app then shows the technician's screens by itself
      await signIn(data);
    } catch (error) {
      // Only the message: the error object carries the request, and the request the password
      console.error('Login error:', error?.message);
      Alert.alert(
        'Login Failed',
        error.response?.data?.error || 'Invalid username or password'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>SEMIX CORP</Text>
        <Text style={styles.subtitle}>Technician Portal</Text>

        {notice ? (
          <Text style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: colors.white,
    marginBottom: 40,
    opacity: 0.9,
  },
  notice: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    color: colors.textDarkGray,
    fontSize: 15,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.primaryDark,
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
