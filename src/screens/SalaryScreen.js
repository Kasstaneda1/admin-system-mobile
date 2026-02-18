import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { salaryAPI } from '../services/api';
import { colors } from '../constants/colors';
import YearSelector from '../components/YearSelector';
import StatusBadge from '../components/StatusBadge';
import { parseLocalDate } from '../utils/dateUtils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORTS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function SalaryScreen() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [yearData, setYearData] = useState([]);
  const [loadingYear, setLoadingYear] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showWorkDetailsModal, setShowWorkDetailsModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  useEffect(() => {
    loadYearData();
  }, [selectedYear]);

  const loadYearData = async () => {
    setLoadingYear(true);
    const monthsData = [];

    try {
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(selectedYear, month, 1);
        const endDate = new Date(selectedYear, month + 1, 0);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        try {
          const data = await salaryAPI.getSalaryData(startDateStr, endDateStr);
          monthsData[month] = {
            earned: data.monthSummary?.earned || 0,
          };
        } catch (error) {
          monthsData[month] = { earned: 0 };
        }
      }
      setYearData(monthsData);
    } catch (error) {
      console.error('Failed to load year data:', error);
      Alert.alert('Error', 'Failed to load salary data. Please try again.');
    } finally {
      setLoadingYear(false);
    }
  };

  const handleMonthPress = async (monthIndex) => {
    setSelectedMonth(monthIndex);
    setLoading(true);
    setShowModal(true);

    try {
      const startDate = new Date(selectedYear, monthIndex, 1);
      const endDate = new Date(selectedYear, monthIndex + 1, 0);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const data = await salaryAPI.getSalaryData(startDateStr, endDateStr);
      setMonthData(data);
    } catch (error) {
      console.error('Failed to load month data:', error);
      Alert.alert('Error', 'Failed to load month details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedMonth(null);
    setMonthData(null);
  };

  return (
    <View style={styles.container}>
      {/* Year Selector */}
      <YearSelector
        years={years}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
      />

      {/* Month Calendar Grid */}
      <ScrollView style={styles.scrollView}>
        <View style={styles.calendarGrid}>
          {MONTHS.map((month, index) => {
            const earned = yearData[index]?.earned || 0;
            const hasData = earned > 0;

            return (
              <TouchableOpacity
                key={index}
                style={styles.monthCard}
                onPress={() => handleMonthPress(index)}
              >
                <Text style={styles.monthName}>{MONTH_SHORTS[index]}</Text>
                <Text style={styles.monthFullName}>{month}</Text>
                {hasData && (
                  <Text style={styles.monthEarned}>
                    ${earned.toFixed(2)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {loadingYear && (
          <View style={styles.yearLoadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </ScrollView>

      {/* Month Details Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedMonth !== null ? MONTHS[selectedMonth] : ''} {selectedYear}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : monthData ? (
              <ScrollView style={styles.modalBody}>
                <View style={styles.toPayCard}>
                  <Text style={styles.toPayLabel}>To Pay</Text>
                  <Text style={styles.toPayAmount}>
                    ${parseFloat(monthData.toPayTotal || 0).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.statsGrid}>
                  <StatCard
                    label="Total Earned"
                    value={`$${parseFloat(monthData.monthSummary?.earned || 0).toFixed(2)}`}
                    color={colors.success}
                  />
                  <StatCard
                    label="Cash"
                    value={`$${parseFloat(monthData.monthSummary?.cash || 0).toFixed(2)}`}
                    color={colors.primary}
                  />
                  <StatCard
                    label="Checks"
                    value={`$${parseFloat(monthData.monthSummary?.checks || 0).toFixed(2)}`}
                    color={colors.warning}
                  />
                  <StatCard
                    label="Unpaid"
                    value={`$${parseFloat(monthData.unpaid || 0).toFixed(2)}`}
                    color={colors.danger}
                  />
                </View>

                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() => {
                    setShowModal(false);
                    setShowRecordsModal(true);
                  }}
                >
                  <View style={styles.infoRowClickable}>
                    <View>
                      <Text style={styles.infoLabel}>Records</Text>
                      <Text style={styles.infoValue}>{monthData.recordsCount || 0}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Records List Modal */}
      <Modal
        visible={showRecordsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowRecordsModal(false);
          setShowModal(true);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowRecordsModal(false);
                  setShowModal(true);
                }}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Work Records</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowRecordsModal(false);
                  setSelectedMonth(null);
                  setMonthData(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {monthData?.records && monthData.records.length > 0 ? (
                monthData.records.map((record, index) => {
                  const isPaid = record.payment_status === 'Paid';
                  return (
                    <TouchableOpacity
                      key={record.id || index}
                      style={[
                        styles.recordCard,
                        { borderLeftColor: isPaid ? colors.success : colors.danger }
                      ]}
                      onPress={() => {
                        setSelectedRecord(record);
                        setShowRecordsModal(false);
                        setShowWorkDetailsModal(true);
                      }}
                    >
                      <View style={styles.recordHeader}>
                        <Text style={styles.recordDate}>
                          {parseLocalDate(record.date).toLocaleDateString()}
                        </Text>
                        <StatusBadge
                          label={isPaid ? 'Paid' : 'Not Paid'}
                          variant={isPaid ? 'success' : 'danger'}
                        />
                      </View>
                      <Text style={styles.recordClient}>{record.client_name}</Text>
                      <Text style={styles.recordSalary}>
                        ${parseFloat(record.calculated_salary || 0).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No records found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Work Details Modal */}
      <Modal
        visible={showWorkDetailsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowWorkDetailsModal(false);
          setShowRecordsModal(true);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowWorkDetailsModal(false);
                  setShowRecordsModal(true);
                }}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Work Details</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowWorkDetailsModal(false);
                  setShowRecordsModal(false);
                  setSelectedMonth(null);
                  setMonthData(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedRecord && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Customer</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Client Name:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.client_name}</Text>
                  </View>
                  {selectedRecord.company && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Company:</Text>
                      <Text style={styles.detailValue}>{selectedRecord.company}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Work Details</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>
                      {parseLocalDate(selectedRecord.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.work_status || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Method:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.payment_method || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Status:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.payment_status || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.amount || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tax:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.tax || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Installation:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.installation || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Parts:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.parts || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>2nd Tech:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.second_tech || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tips:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.tips || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.detailSection, styles.earningsSection]}>
                  <Text style={[styles.detailSectionTitle, { color: colors.earningsDark }]}>
                    Your Earnings
                  </Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Salary:</Text>
                    <Text style={[styles.detailValue, styles.salaryHighlight]}>
                      ${parseFloat(selectedRecord.calculated_salary || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cash Received:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.cash_received || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  monthCard: {
    width: '31%',
    margin: '1%',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  monthName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 5,
  },
  monthFullName: {
    fontSize: 12,
    color: colors.textMedium,
  },
  monthEarned: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.warning,
    marginTop: 8,
  },
  yearLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
    position: 'absolute',
    left: 20,
    zIndex: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 18,
    color: colors.textMedium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  modalBody: {
    padding: 20,
  },
  toPayCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  toPayLabel: {
    fontSize: 16,
    color: colors.whiteTransparent90,
    marginBottom: 8,
  },
  toPayAmount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: colors.white,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textMedium,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textMedium,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  infoRowClickable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 32,
    color: colors.primary,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textLight,
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
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordDate: {
    fontSize: 14,
    color: colors.textMedium,
  },
  recordClient: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  recordSalary: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  detailSection: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  earningsSection: {
    backgroundColor: colors.earningsBg,
    borderColor: colors.earningsBorder,
    borderWidth: 2,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.chipBg,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textMedium,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  salaryHighlight: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.earningsDark,
  },
});
