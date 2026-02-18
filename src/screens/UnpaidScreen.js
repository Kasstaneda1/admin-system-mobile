import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { unpaidAPI } from '../services/api';
import { colors } from '../constants/colors';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { parseLocalDate } from '../utils/dateUtils';

export default function UnpaidScreen() {
  const [loading, setLoading] = useState(true);
  const [pendingRecords, setPendingRecords] = useState([]);
  const [declinedRecords, setDeclinedRecords] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUnpaidRecords();
  }, []);

  const loadUnpaidRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      const userJson = await AsyncStorage.getItem('user');
      const user = JSON.parse(userJson);
      const technicianName = user?.fullName;

      if (!technicianName) {
        setError('Unable to load technician name');
        setLoading(false);
        return;
      }

      const data = await unpaidAPI.getUnpaidRecords(technicianName);
      setPendingRecords(data.pending || []);
      setDeclinedRecords(data.declined || []);
    } catch (err) {
      console.error('Error loading unpaid records:', err);
      const message = err.response?.data?.error || 'Failed to load unpaid records. Please check your connection.';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const renderRecord = (record, isPending = true) => {
    const date = parseLocalDate(record.record_date).toLocaleDateString();
    const amount = parseFloat(record.amount || 0).toFixed(2);

    return (
      <View
        key={record.id}
        style={[
          styles.recordCard,
          { borderLeftColor: isPending ? colors.warning : colors.danger }
        ]}
      >
        <View style={styles.recordMainRow}>
          <Text style={styles.recordDate}>{date}</Text>
          <Text style={styles.recordAmount}>${amount}</Text>
        </View>
        <Text style={styles.recordClient}>{record.client_name}</Text>

        {!isPending && record.manager_notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>Manager Note:</Text>
            <Text style={styles.notesText}>{record.manager_notes}</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <LoadingScreen message="Loading unpaid records..." />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadUnpaidRecords} />;
  }

  const totalPending = pendingRecords.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
  const totalDeclined = declinedRecords.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Pending Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionIcon}>⏳</Text>
              <Text style={styles.sectionTitle}>Pending</Text>
              <StatusBadge count={pendingRecords.length} variant="warning" />
            </View>
            {pendingRecords.length > 0 && (
              <Text style={styles.totalAmount}>
                Total: ${totalPending.toFixed(2)}
              </Text>
            )}
          </View>

          {pendingRecords.length > 0 ? (
            pendingRecords.map(record => renderRecord(record, true))
          ) : (
            <EmptyState message="No pending records" />
          )}
        </View>

        {/* Declined Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionIcon}>❌</Text>
              <Text style={styles.sectionTitle}>Declined</Text>
              <StatusBadge count={declinedRecords.length} variant="danger" />
            </View>
            {declinedRecords.length > 0 && (
              <Text style={styles.totalAmount}>
                Total: ${totalDeclined.toFixed(2)}
              </Text>
            )}
          </View>

          {declinedRecords.length > 0 ? (
            declinedRecords.map(record => renderRecord(record, false))
          ) : (
            <EmptyState message="No declined records" />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginRight: 8,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 32,
  },
  recordCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recordMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recordDate: {
    fontSize: 14,
    color: colors.textMedium,
  },
  recordAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  recordClient: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  notesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesLabel: {
    fontSize: 12,
    color: colors.textMedium,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: colors.textDark,
    fontStyle: 'italic',
  },
});
