import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { unpaidAPI } from '../services/api';

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

      // Get technician name from stored user data
      const userJson = await AsyncStorage.getItem('user');
      const user = JSON.parse(userJson);
      const technicianName = user?.fullName;

      if (!technicianName) {
        setError('Unable to load technician name');
        setLoading(false);
        return;
      }

      console.log('📋 Loading unpaid records for:', technicianName);

      // Fetch unpaid records
      const data = await unpaidAPI.getUnpaidRecords(technicianName);

      console.log('📋 Unpaid records loaded:', {
        pending: data.pending?.length || 0,
        declined: data.declined?.length || 0
      });

      setPendingRecords(data.pending || []);
      setDeclinedRecords(data.declined || []);
    } catch (err) {
      console.error('Error loading unpaid records:', err);
      setError('Failed to load unpaid records');
    } finally {
      setLoading(false);
    }
  };

  const renderRecord = (record, isPending = true) => {
    const date = new Date(record.record_date).toLocaleDateString();
    const amount = parseFloat(record.amount || 0).toFixed(2);

    return (
      <View
        key={record.id}
        style={[
          styles.recordCard,
          { borderLeftColor: isPending ? '#f59e0b' : '#ef4444' }
        ]}
      >
        <View style={styles.recordMainRow}>
          <Text style={styles.recordDate}>{date}</Text>
          <Text style={styles.recordAmount}>${amount}</Text>
        </View>
        <Text style={styles.recordClient}>{record.client_name}</Text>

        {/* Manager notes for declined records */}
        {!isPending && record.manager_notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>💬 Manager Note:</Text>
            <Text style={styles.notesText}>{record.manager_notes}</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text style={styles.loadingText}>Loading unpaid records...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
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
              <View style={[styles.badge, styles.badgePending]}>
                <Text style={styles.badgeText}>{pendingRecords.length}</Text>
              </View>
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
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No pending records</Text>
            </View>
          )}
        </View>

        {/* Declined Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionIcon}>❌</Text>
              <Text style={styles.sectionTitle}>Declined</Text>
              <View style={[styles.badge, styles.badgeDeclined]}>
                <Text style={styles.badgeText}>{declinedRecords.length}</Text>
              </View>
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
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No declined records</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    padding: 20,
  },

  // Section styles
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
    color: '#333',
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgePending: {
    backgroundColor: '#f59e0b',
  },
  badgeDeclined: {
    backgroundColor: '#ef4444',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14B8A6',
    marginLeft: 32,
  },

  // Record card styles
  recordCard: {
    backgroundColor: '#fff',
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
    color: '#666',
  },
  recordAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14B8A6',
  },
  recordClient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  notesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  notesLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#333',
    fontStyle: 'italic',
  },

  // Empty state
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
