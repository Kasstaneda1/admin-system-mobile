import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { estimatesAPI } from '../services/api';

export default function EstimateDetailScreen({ route, navigation }) {
  const { estimateId } = route.params;
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEstimate();
  }, []);

  const loadEstimate = async () => {
    try {
      const data = await estimatesAPI.getEstimateById(estimateId);
      setEstimate(data);
    } catch (error) {
      console.error('Failed to load estimate:', error);
      Alert.alert('Error', 'Failed to load estimate details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  if (!estimate) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer Information</Text>
        <InfoRow label="Name" value={estimate.customer_name} />
        <InfoRow label="Phone" value={estimate.phone} />
        <InfoRow label="Address" value={estimate.address} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Estimate Details</Text>
        <InfoRow label="Date" value={new Date(estimate.date).toLocaleDateString()} />
        <InfoRow label="Status" value={estimate.status} />
        <InfoRow label="Appliance Type" value={estimate.appliance_type} />
        {estimate.brand && <InfoRow label="Brand" value={estimate.brand} />}
        {estimate.model && <InfoRow label="Model" value={estimate.model} />}
      </View>

      {estimate.amount && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial</Text>
          <InfoRow label="Amount" value={`$${parseFloat(estimate.amount).toFixed(2)}`} />
          {estimate.payment_method && (
            <InfoRow label="Payment Method" value={estimate.payment_method} />
          )}
        </View>
      )}

      {estimate.problem_description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Problem Description</Text>
          <Text style={styles.description}>{estimate.problem_description}</Text>
        </View>
      )}

      {estimate.parts_needed && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parts Needed</Text>
          <Text style={styles.description}>{estimate.parts_needed}</Text>
        </View>
      )}

      {estimate.events && estimate.events.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {estimate.events.map((event, index) => (
            <View key={index} style={styles.timelineItem}>
              <Text style={styles.timelineDate}>
                {new Date(event.timestamp).toLocaleString()}
              </Text>
              <Text style={styles.timelineText}>{event.description}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#14B8A6',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 120,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  timelineItem: {
    marginBottom: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#14B8A6',
  },
  timelineDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  timelineText: {
    fontSize: 14,
    color: '#333',
  },
});
