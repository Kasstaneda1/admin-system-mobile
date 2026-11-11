// The sign-in screen, design B (design-mockups/app-icon/README.md, «Итог: B»; picture
// design-mockups/app-icon/shots/login-b.png): the background picture with the brand gradient
// and the pale B mark, the app icon, «Your day, stop by stop.», and a white card with the form.
// Colours are tokens (src/constants/colors.js), the line icons are tinted PNGs. Only the look
// changed: signing in is as before.
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ImageBackground,
  Image,
  ScrollView,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authAPI } from '../services/api';
import { colors } from '../constants/colors';
import { useAuth } from '../session/AuthContext';
import { loginFailureText } from '../session/model';
import { logError } from '../utils/logError';

const BACKGROUND = require('../../assets/login-bg.png');
const APP_ICON = require('../../assets/icon.png');
const ICONS = {
  user: require('../../assets/icons/user.png'),
  lock: require('../../assets/icons/lock.png'),
  eye: require('../../assets/icons/eye.png'),
  lockSmall: require('../../assets/icons/lock-small.png'),
};

export default function LoginScreen() {
  const { signIn, notice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null); // 'username' | 'password'
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef(null);
  const scrollRef = useRef(null);

  // With the keyboard up, the form scrolls to its end: the fields and «Log in» stay above it
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => shown.remove();
  }, []);

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
      // The message and the status only: the error object carries the request with the password
      logError('Login error:', error);
      // A turned-off technician gets the app's phrase, any other refusal the server's words
      Alert.alert('Login Failed', loginFailureText(error.response?.status, error.response?.data));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={BACKGROUND} resizeMode="cover" style={styles.background}>
      <StatusBar style="light" />
      {/* the picture runs under the status bar; what scrolls stops below it */}
      <SafeAreaView edges={['top']} style={styles.fill}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.fill}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.top}>
              <View style={styles.iconFrame}>
                <Image source={APP_ICON} style={styles.icon} accessibilityIgnoresInvertColors />
              </View>
              <Text style={styles.brandName}>SEMIX</Text>
              <Text style={styles.headline} accessibilityRole="header">
                {'Your day,\nstop by stop.'}
              </Text>
            </View>

            <SafeAreaView edges={['bottom']} style={styles.card}>
              {notice ? (
                <Text style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {notice}
                </Text>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <View style={[styles.input, focused === 'username' && styles.inputFocused]}>
                  <Image source={ICONS.user} style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputText}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    onFocus={() => setFocused('username')}
                    onBlur={() => setFocused((f) => (f === 'username' ? null : f))}
                    accessibilityLabel="Username"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.input, focused === 'password' && styles.inputFocused]}>
                  <Image source={ICONS.lock} style={styles.inputIcon} />
                  <TextInput
                    ref={passwordRef}
                    style={styles.inputText}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused((f) => (f === 'password' ? null : f))}
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((shown) => !shown)}
                    hitSlop={12}
                    style={styles.show}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Image source={ICONS.eye} style={styles.showIcon} />
                    <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonBusy]}
                onPress={handleLogin}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color={colors.warningOnSolid} />
                ) : (
                  <Text style={styles.buttonText}>Log in</Text>
                )}
              </TouchableOpacity>

              <View style={styles.note}>
                <Image source={ICONS.lockSmall} style={styles.noteIcon} />
                <Text style={styles.noteText}>You stay signed in on this phone until you log out.</Text>
              </View>
              <Text style={styles.noteText}>Forgot your password? Call the office.</Text>
            </SafeAreaView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

// Sizes from the design (README «Итог: B», part 3); a border takes layout room in React
// Native, so the field's padding shrinks by the border to keep the text in place on focus
const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: colors.brandPressed, // until the picture is there
  },
  fill: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  top: {
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  iconFrame: {
    width: 64,
    height: 64,
    borderRadius: 15,
    backgroundColor: colors.brand,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 15,
  },
  brandName: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2.8,
    color: colors.headerFgMuted,
  },
  headline: {
    marginTop: 4,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -0.76,
    color: colors.fgOnFill,
  },
  card: {
    flexGrow: 1,
    gap: 16,
    paddingTop: 26,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.bgCard,
  },
  notice: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    color: colors.brandSoftFg,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.fgSecondary,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    paddingHorizontal: 14 - 1.5,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderControl,
    backgroundColor: colors.bgCard,
  },
  inputFocused: {
    paddingHorizontal: 14 - 2.5,
    borderWidth: 2.5,
    borderColor: colors.brand,
  },
  inputIcon: {
    width: 18,
    height: 18,
    tintColor: colors.fgMutedField,
  },
  inputText: {
    flex: 1,
    height: '100%',
    fontSize: 18,
    fontWeight: '500',
    color: colors.fgDefault,
  },
  show: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  showIcon: {
    width: 18,
    height: 18,
    tintColor: colors.brand,
  },
  showText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.brand,
  },
  button: {
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSolid,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.warningOnSolid,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteIcon: {
    width: 14,
    height: 14,
    tintColor: colors.fgMutedField,
  },
  noteText: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.fgMutedField,
  },
});
