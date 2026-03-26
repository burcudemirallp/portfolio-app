import { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';

const SWIPE_THRESHOLD = 80;

export default function SwipeableRow({ children, leftActions, rightActions }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        const newX = lastOffset.current + gs.dx;
        // Limit right swipe if no left actions
        if (!leftActions?.length && newX > 0) return;
        // Limit left swipe if no right actions
        if (!rightActions?.length && newX < 0) return;
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD && leftActions?.length) {
          Animated.spring(translateX, { toValue: SWIPE_THRESHOLD, useNativeDriver: true }).start();
          lastOffset.current = SWIPE_THRESHOLD;
        } else if (gs.dx < -SWIPE_THRESHOLD && rightActions?.length) {
          Animated.spring(translateX, { toValue: -SWIPE_THRESHOLD, useNativeDriver: true }).start();
          lastOffset.current = -SWIPE_THRESHOLD;
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          lastOffset.current = 0;
        }
      },
    })
  ).current;

  const close = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    lastOffset.current = 0;
  };

  const renderActions = (actions, side) => (
    <View className={`absolute top-0 bottom-0 flex-row items-stretch ${side === 'left' ? 'left-0' : 'right-0'}`}>
      {actions.map((action, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => { close(); action.onPress(); }}
          className="w-20 items-center justify-center"
          style={{ backgroundColor: action.bg || '#ef4444' }}
        >
          <Feather name={action.icon} size={20} color="#fff" />
          {action.label && <Text className="text-xs text-white mt-1 font-medium">{action.label}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View className="overflow-hidden">
      {leftActions?.length > 0 && renderActions(leftActions, 'left')}
      {rightActions?.length > 0 && renderActions(rightActions, 'right')}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}
