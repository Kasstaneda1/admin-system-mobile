import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

export default function YearSelector({ years, selectedYear, onYearChange }) {
  return (
    <View style={styles.container}>
      {years.map((year) => (
        <TouchableOpacity
          key={year}
          style={[
            styles.button,
            selectedYear === year && styles.buttonActive,
          ]}
          onPress={() => onYearChange(year)}
        >
          <Text
            style={[
              styles.text,
              selectedYear === year && styles.textActive,
            ]}
          >
            {year}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  button: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: colors.primary,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMedium,
  },
  textActive: {
    color: colors.white,
  },
});
