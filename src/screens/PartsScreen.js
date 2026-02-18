import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { estimatesAPI } from '../services/api';
import { colors } from '../constants/colors';
import { parseLocalDate } from '../utils/dateUtils';
import LoadingScreen from '../components/LoadingScreen';
import EmptyState from '../components/EmptyState';

export default function PartsScreen() {
  const [activeTab, setActiveTab] = useState('in_transit');
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    loadParts();
  }, [activeTab]);

  const loadParts = async () => {
    try {
      setLoading(true);
      const data = await estimatesAPI.getPartsByStatus(activeTab);
      setParts(data);
    } catch (error) {
      console.error('Failed to load parts:', error);
      const message = error.response?.data?.error || 'Failed to load parts. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadParts();
  };

  const handlePartPress = async (part) => {
    setSelectedPart(part);
    if (!part.comments) {
      try {
        const comments = await estimatesAPI.getEstimateComments(part.id);
        setSelectedPart({ ...part, comments });
      } catch (error) {
        console.error('Failed to load comments:', error);
        Alert.alert('Error', 'Failed to load comments.');
        setSelectedPart({ ...part, comments: [] });
      }
    }
    setShowComments(true);
  };

  const renderPartCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handlePartPress(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.clientName}>{item.client || 'No Client'}</Text>
        <Text style={styles.date}>
          {item.date ? parseLocalDate(item.date).toLocaleDateString() : ''}
        </Text>
      </View>

      <View style={styles.partsInfo}>
        <Text style={styles.partsLabel}>Parts:</Text>
        <Text style={styles.partsName}>{item.name_parts || 'No parts specified'}</Text>
      </View>

      {item.part_number && (
        <Text style={styles.partNumber}>Part #: {item.part_number}</Text>
      )}
    </TouchableOpacity>
  );

  const renderCommentsModal = () => (
    <Modal
      visible={showComments}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowComments(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments</Text>
            <TouchableOpacity onPress={() => setShowComments(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsContainer}>
            {selectedPart?.comments && selectedPart.comments.length > 0 ? (
              selectedPart.comments.map((comment, index) => (
                <View key={index} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{comment.user_name || 'Unknown'}</Text>
                    <Text style={styles.commentDate}>
                      {comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{comment.comment_text || 'No comment text'}</Text>
                </View>
              ))
            ) : (
              <EmptyState message="No comments yet" />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'in_transit' && styles.activeTab]}
          onPress={() => setActiveTab('in_transit')}
        >
          <Text style={[styles.tabText, activeTab === 'in_transit' && styles.activeTabText]}>
            In Transit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'arrived' && styles.activeTab]}
          onPress={() => setActiveTab('arrived')}
        >
          <Text style={[styles.tabText, activeTab === 'arrived' && styles.activeTabText]}>
            Arrived
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'on_board' && styles.activeTab]}
          onPress={() => setActiveTab('on_board')}
        >
          <Text style={[styles.tabText, activeTab === 'on_board' && styles.activeTabText]}>
            On Board
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={parts}
          renderItem={renderPartCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState message="No parts in this status" />
          }
        />
      )}

      {renderCommentsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: colors.textMedium,
    fontWeight: '500',
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 15,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: colors.textMedium,
  },
  partsInfo: {
    marginBottom: 8,
  },
  partsLabel: {
    fontSize: 12,
    color: colors.textMedium,
    marginBottom: 4,
  },
  partsName: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  partNumber: {
    fontSize: 12,
    color: colors.textLight,
    fontStyle: 'italic',
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
  },
  closeButton: {
    fontSize: 24,
    color: colors.textMedium,
    paddingHorizontal: 10,
  },
  commentsContainer: {
    padding: 20,
  },
  commentCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  commentDate: {
    fontSize: 12,
    color: colors.textLight,
  },
  commentText: {
    fontSize: 14,
    color: colors.textMedium,
    lineHeight: 20,
  },
});
