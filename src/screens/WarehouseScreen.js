import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
  Image,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warehouseAPI } from '../services/api';
import { colors } from '../constants/colors';
import LoadingScreen from '../components/LoadingScreen';
import EmptyState from '../components/EmptyState';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'washer', label: 'Washer' },
  { key: 'dryer', label: 'Dryer' },
  { key: 'refrigerator', label: 'Fridge' },
  { key: 'oven', label: 'Oven' },
  { key: 'dishwasher', label: 'Dishwasher' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'commercial', label: 'Commercial' },
];

const CATEGORY_ICONS = {
  washer: '🫧',
  dryer: '🌀',
  refrigerator: '❄️',
  oven: '🔥',
  dishwasher: '🍽️',
  hvac: '💨',
  commercial: '🏭',
};

export default function WarehouseScreen() {
  const [warehouse, setWarehouse] = useState(null);
  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [noWarehouse, setNoWarehouse] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [partDetail, setPartDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deductMode, setDeductMode] = useState(false);
  const [deductQty, setDeductQty] = useState('1');
  const [deducting, setDeducting] = useState(false);

  useEffect(() => {
    loadWarehouse();
  }, []);

  useEffect(() => {
    filterParts();
  }, [parts, searchQuery, activeCategory]);

  const loadWarehouse = async () => {
    try {
      setLoading(true);
      setNoWarehouse(false);

      const userData = await AsyncStorage.getItem('user');
      if (!userData) return;
      const user = JSON.parse(userData);
      const userId = user.id;

      const warehouses = await warehouseAPI.getWarehouses();
      const techVan = warehouses.find(
        (w) => w.type === 'tech_van' && w.technician_id === userId
      );

      if (!techVan) {
        setNoWarehouse(true);
        setLoading(false);
        return;
      }

      setWarehouse(techVan);
      await loadParts(techVan.id);
    } catch (error) {
      console.error('Failed to load warehouse:', error);
      const message = error.response?.data?.error || 'Failed to load warehouse. Please check your connection.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const loadParts = async (warehouseId) => {
    try {
      const partsData = await warehouseAPI.getParts(warehouseId);
      setParts(partsData);

      const counts = {};
      partsData.forEach((part) => {
        if (part.category) {
          counts[part.category] = (counts[part.category] || 0) + 1;
        }
      });
      setCategoryCounts(counts);
    } catch (error) {
      console.error('Failed to load parts:', error);
      Alert.alert('Error', 'Failed to load parts list.');
    }
  };

  const filterParts = () => {
    let filtered = [...parts];

    if (activeCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter((part) => {
        const searchFields = [
          part.name,
          part.sku,
          part.brand_name,
          part.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return terms.every((term) => searchFields.includes(term));
      });
    }

    setFilteredParts(filtered);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (warehouse) {
      await loadParts(warehouse.id);
    }
    setRefreshing(false);
  }, [warehouse]);

  const openPartDetail = async (part) => {
    setSelectedPart(part);
    setDetailLoading(true);
    try {
      const detail = await warehouseAPI.getPartById(part.id);
      setPartDetail(detail);
    } catch (error) {
      console.error('Failed to load part detail:', error);
      Alert.alert('Error', 'Failed to load part details.');
      setPartDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closePartDetail = () => {
    setSelectedPart(null);
    setPartDetail(null);
    setDeductMode(false);
    setDeductQty('1');
  };

  const handleDeduct = async () => {
    const qty = parseInt(deductQty);
    if (!qty || qty <= 0) {
      Alert.alert('Error', 'Enter a valid quantity');
      return;
    }

    const partQty = selectedPart?.quantity || 0;
    if (qty > partQty) {
      Alert.alert('Error', `Cannot deduct ${qty}. Only ${partQty} available`);
      return;
    }

    Alert.alert(
      'Confirm',
      `Deduct ${qty} × ${selectedPart.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deduct',
          style: 'destructive',
          onPress: async () => {
            setDeducting(true);
            try {
              await warehouseAPI.deductPart(selectedPart.id, warehouse.id, qty);
              closePartDetail();
              await loadParts(warehouse.id);
            } catch (error) {
              const msg = error.response?.data?.error || 'Failed to deduct part';
              Alert.alert('Error', msg);
            } finally {
              setDeducting(false);
            }
          },
        },
      ]
    );
  };

  const getStockColor = (quantity, minStock) => {
    if (quantity === 0) return colors.danger;
    if (quantity <= minStock) return colors.warning;
    return colors.success;
  };

  const getStockLabel = (quantity, minStock) => {
    if (quantity === 0) return 'Out of Stock';
    if (quantity <= minStock) return 'Low Stock';
    return 'In Stock';
  };

  const totalParts = parts.length;

  const sections = React.useMemo(() => {
    if (activeCategory !== 'all') return [];
    const grouped = {};
    filteredParts.forEach((part) => {
      const cat = part.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(part);
    });
    const order = CATEGORIES.map((c) => c.key).filter((k) => k !== 'all');
    return order
      .filter((key) => grouped[key]?.length > 0)
      .map((key) => {
        const catDef = CATEGORIES.find((c) => c.key === key);
        return {
          title: catDef?.label || key,
          icon: CATEGORY_ICONS[key] || '🔧',
          count: grouped[key].length,
          data: grouped[key],
        };
      });
  }, [filteredParts, activeCategory]);

  if (loading) {
    return <LoadingScreen message="Loading warehouse..." />;
  }

  if (noWarehouse) {
    return (
      <EmptyState
        icon="🚐"
        title="No Van Assigned"
        message={'Your warehouse has not been set up yet.\nPlease contact your administrator.'}
      />
    );
  }

  const renderPartCard = ({ item }) => {
    const stockColor = getStockColor(item.quantity, item.min_stock);
    const stockLabel = getStockLabel(item.quantity, item.min_stock);

    return (
      <TouchableOpacity
        style={styles.partCard}
        onPress={() => openPartDetail(item)}
        activeOpacity={0.7}
      >
        <View style={styles.partCardContent}>
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.partImage} />
          ) : (
            <View style={styles.partImagePlaceholder}>
              <Text style={styles.partImageIcon}>
                {CATEGORY_ICONS[item.category] || '🔧'}
              </Text>
            </View>
          )}

          <View style={styles.partInfo}>
            <Text style={styles.partName} numberOfLines={2}>
              {item.name}
            </Text>

            <View style={styles.partMeta}>
              {item.sku && (
                <Text style={styles.partSku}>SKU: {item.sku}</Text>
              )}
              {item.brand_name && (
                <Text style={styles.partBrand}>{item.brand_name}</Text>
              )}
            </View>

            <View style={styles.partFooter}>
              <View
                style={[
                  styles.stockBadge,
                  { backgroundColor: stockColor + '15' },
                ]}
              >
                <View
                  style={[styles.stockDot, { backgroundColor: stockColor }]}
                />
                <Text style={[styles.stockText, { color: stockColor }]}>
                  {stockLabel}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.quantityBadge}>
            <Text style={styles.quantityNumber}>{item.quantity || 0}</Text>
            <Text style={styles.quantityLabel}>qty</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search parts..."
          placeholderTextColor={colors.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {CATEGORIES.map((cat) => {
          const count =
            cat.key === 'all'
              ? totalParts
              : categoryCounts[cat.key] || 0;
          const isActive = activeCategory === cat.key;

          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryChip, isActive && styles.categoryChipActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  isActive && styles.categoryChipTextActive,
                ]}
              >
                {cat.label}
              </Text>
              <View
                style={[
                  styles.categoryCount,
                  isActive && styles.categoryCountActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryCountText,
                    isActive && styles.categoryCountTextActive,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Parts List */}
      {activeCategory === 'all' ? (
        <SectionList
          sections={sections}
          renderItem={renderPartCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.sectionIcon}>{section.icon}</Text>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{section.count}</Text>
              </View>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="📦"
              message={searchQuery ? 'No parts match your filters' : 'No parts in your warehouse'}
            />
          }
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <FlatList
          data={filteredParts}
          renderItem={renderPartCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState icon="📦" message="No parts match your filters" />
          }
        />
      )}

      {/* Part Detail Modal */}
      <Modal
        visible={!!selectedPart}
        animationType="slide"
        transparent={true}
        onRequestClose={closePartDetail}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Part Details</Text>
              <TouchableOpacity onPress={closePartDetail}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : partDetail ? (
              <ScrollView style={styles.modalBody}>
                {partDetail.photo_url && (
                  <Image
                    source={{ uri: partDetail.photo_url }}
                    style={styles.detailImage}
                    resizeMode="contain"
                  />
                )}

                <Text style={styles.detailName}>{partDetail.name}</Text>
                {partDetail.sku && (
                  <Text style={styles.detailSku}>SKU: {partDetail.sku}</Text>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Information</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Category</Text>
                    <Text style={styles.detailValue}>
                      {CATEGORY_ICONS[partDetail.category] || ''}{' '}
                      {partDetail.category?.charAt(0).toUpperCase() +
                        partDetail.category?.slice(1)}
                    </Text>
                  </View>
                </View>

                {partDetail.description && (
                  <View style={styles.descriptionBlock}>
                    <Text style={styles.descriptionText}>
                      {partDetail.description}
                    </Text>
                  </View>
                )}

                {partDetail.brands?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Brands</Text>
                    <View style={styles.tagsRow}>
                      {partDetail.brands.map((brand) => (
                        <View key={brand.id} style={styles.tag}>
                          <Text style={styles.tagText}>{brand.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {partDetail.part_numbers?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Part Numbers</Text>
                    {partDetail.part_numbers.map((pn) => (
                      <View key={pn.id} style={styles.partNumberRow}>
                        <Text style={styles.partNumberText}>{pn.number}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {partDetail.inventory?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>
                      Inventory Locations
                    </Text>
                    {partDetail.inventory.map((inv) => (
                      <View key={inv.warehouse_id} style={styles.inventoryRow}>
                        <Text style={styles.inventoryName}>
                          {inv.warehouse_name}
                        </Text>
                        <Text style={styles.inventoryQty}>
                          {inv.quantity} pcs
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.deductSection}>
                  {!deductMode ? (
                    <TouchableOpacity
                      style={styles.usePartButton}
                      onPress={() => setDeductMode(true)}
                      disabled={selectedPart?.quantity === 0}
                    >
                      <Text style={styles.usePartButtonText}>
                        {selectedPart?.quantity === 0 ? 'Out of Stock' : 'Use Part'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.deductControls}>
                      <Text style={styles.deductLabel}>
                        Quantity to deduct (available: {selectedPart?.quantity || 0})
                      </Text>
                      <View style={styles.deductRow}>
                        <TouchableOpacity
                          style={styles.deductBtn}
                          onPress={() => {
                            const v = Math.max(1, parseInt(deductQty) - 1 || 0);
                            setDeductQty(String(v));
                          }}
                        >
                          <Text style={styles.deductBtnText}>−</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.deductInput}
                          value={deductQty}
                          onChangeText={setDeductQty}
                          keyboardType="number-pad"
                          textAlign="center"
                        />
                        <TouchableOpacity
                          style={styles.deductBtn}
                          onPress={() => {
                            const max = selectedPart?.quantity || 1;
                            const v = Math.min(max, (parseInt(deductQty) || 0) + 1);
                            setDeductQty(String(v));
                          }}
                        >
                          <Text style={styles.deductBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.deductActions}>
                        <TouchableOpacity
                          style={styles.deductCancel}
                          onPress={() => {
                            setDeductMode(false);
                            setDeductQty('1');
                          }}
                        >
                          <Text style={styles.deductCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.deductConfirm, deducting && { opacity: 0.6 }]}
                          onPress={handleDeduct}
                          disabled={deducting}
                        >
                          {deducting ? (
                            <ActivityIndicator size="small" color={colors.white} />
                          ) : (
                            <Text style={styles.deductConfirmText}>Confirm</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

                <View style={{ height: 30 }} />
              </ScrollView>
            ) : (
              <View style={styles.modalLoading}>
                <Text style={styles.emptyListText}>
                  Failed to load part details
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    margin: 12,
    marginBottom: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: colors.textDark,
  },
  clearSearch: {
    fontSize: 18,
    color: colors.textLight,
    paddingLeft: 8,
  },

  // Categories
  categoriesContainer: {
    maxHeight: 50,
    marginTop: 12,
  },
  categoriesContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMedium,
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  categoryCount: {
    backgroundColor: colors.chipBg,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
    minWidth: 22,
    alignItems: 'center',
  },
  categoryCountActive: {
    backgroundColor: colors.whiteTransparent25,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMedium,
  },
  categoryCountTextActive: {
    color: colors.white,
  },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMedium,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDarkGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },

  // Parts List
  listContent: {
    padding: 12,
    paddingTop: 12,
  },
  partCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  partCardContent: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  partImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.chipBg,
  },
  partImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partImageIcon: {
    fontSize: 24,
  },
  partInfo: {
    flex: 1,
    marginLeft: 12,
  },
  partName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  partMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  partSku: {
    fontSize: 12,
    color: colors.textLight,
  },
  partBrand: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  partFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  stockText: {
    fontSize: 11,
    fontWeight: '600',
  },
  quantityBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  quantityNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  quantityLabel: {
    fontSize: 10,
    color: colors.textLight,
    marginTop: 1,
  },

  // Empty List
  emptyListText: {
    fontSize: 15,
    color: colors.textMedium,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMedium,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textDark,
  },
  modalClose: {
    fontSize: 22,
    color: colors.textLight,
    padding: 4,
  },
  modalLoading: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
  },

  // Detail
  detailImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.chipBg,
    marginBottom: 16,
  },
  detailName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 4,
  },
  detailSku: {
    fontSize: 14,
    color: colors.textLight,
    marginBottom: 16,
  },
  detailSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.chipBg,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textMedium,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
    flex: 1.5,
    textAlign: 'right',
  },
  descriptionBlock: {
    marginTop: 16,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  descriptionText: {
    flex: 1,
    fontSize: 14,
    color: colors.textDarkGray,
    lineHeight: 21,
  },

  // Tags (brands)
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  tagText: {
    fontSize: 13,
    color: colors.primaryDark,
    fontWeight: '500',
  },

  // Part Numbers
  partNumberRow: {
    backgroundColor: colors.cardBg,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  partNumberText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.textDark,
  },

  // Inventory
  inventoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  inventoryName: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: '500',
  },
  inventoryQty: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },

  // Deduct
  deductSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderMedium,
  },
  usePartButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  usePartButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  deductControls: {},
  deductLabel: {
    fontSize: 14,
    color: colors.textMedium,
    marginBottom: 12,
    textAlign: 'center',
  },
  deductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  deductBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderMedium,
  },
  deductBtnText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textDarkGray,
  },
  deductInput: {
    width: 64,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderMedium,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
    backgroundColor: colors.white,
  },
  deductActions: {
    flexDirection: 'row',
    gap: 12,
  },
  deductCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: 'center',
  },
  deductCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMedium,
  },
  deductConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  deductConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
});
