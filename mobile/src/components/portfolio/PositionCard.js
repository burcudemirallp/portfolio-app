import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/format';
import ProgressBar from '../ui/ProgressBar';

export default function PositionCard({ position, maxWeight, onEdit, onSell, onDelete }) {
  if (!position) return null;

  const pl = Number(position.unrealized_pl_try) || 0;
  const plPct = Number(position.unrealized_pl_percentage) || 0;
  const isPositive = pl >= 0;
  const weight = Number(position.weight) || 0;
  const qty = Number(position.quantity) || 0;
  const hasActions = onEdit || onSell || onDelete;

  return (
    <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 mx-4 mb-3 border border-gray-100 dark:border-gray-700">
      {/* Row 1: Symbol + Value */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              {String(position.symbol || '—')}
            </Text>
            {position.asset_type ? (
              <View style={{ marginLeft: 8, backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '500', color: '#6b7280' }}>
                  {String(position.asset_type)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1} style={{ marginTop: 2 }}>
            {String(position.name || '')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            {formatCurrency(position.market_value_try)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Feather name={isPositive ? 'arrow-up-right' : 'arrow-down-right'} size={12} color={isPositive ? '#22c55e' : '#ef4444'} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: isPositive ? '#16a34a' : '#dc2626', marginLeft: 2 }}>
              {formatCurrency(pl)}
            </Text>
            <Text style={{ fontSize: 11, color: isPositive ? '#16a34a' : '#dc2626', marginLeft: 4 }}>
              {plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}{'%'}
            </Text>
          </View>
        </View>
      </View>

      {/* Row 2: Details */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
        <Text style={{ fontSize: 11, color: '#9ca3af' }}>
          {qty.toFixed(2)}{' adet'}
        </Text>
        <Text style={{ fontSize: 11, color: '#9ca3af', marginLeft: 12 }}>
          {'Ort: '}{formatCurrency(position.avg_cost_try)}
        </Text>
        {position.last_price_try != null && (
          <Text style={{ fontSize: 11, color: '#9ca3af', marginLeft: 12 }}>
            {'Son: '}{formatCurrency(position.last_price_try)}
          </Text>
        )}
      </View>

      {/* Row 3: Weight bar + Actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={weight} max={maxWeight || 100} color="#3b82f6" height={3} />
          </View>
          <Text style={{ fontSize: 10, color: '#9ca3af', width: 40, textAlign: 'right' }}>
            {'%'}{weight.toFixed(1)}
          </Text>
        </View>

        {hasActions ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
            {onEdit ? (
              <TouchableOpacity onPress={onEdit} hitSlop={10} style={{ padding: 4 }}>
                <Feather name="edit-2" size={16} color="#3b82f6" />
              </TouchableOpacity>
            ) : null}
            {onSell ? (
              <TouchableOpacity onPress={onSell} hitSlop={10} style={{ padding: 4, marginLeft: 8 }}>
                <Feather name="log-out" size={16} color="#f59e0b" />
              </TouchableOpacity>
            ) : null}
            {onDelete ? (
              <TouchableOpacity onPress={onDelete} hitSlop={10} style={{ padding: 4, marginLeft: 8 }}>
                <Feather name="trash-2" size={16} color="#ef4444" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
