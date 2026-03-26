import AsyncStorage from '@react-native-async-storage/async-storage';

// Key constants
export const KEYS = {
  TOKEN: 'portfolio_token',
  USER: 'portfolio_user',
  DARK_MODE: 'portfolio_dark_mode',
  ADMIN_TOKEN: 'portfolio_admin_token',
  ADMIN_USER: 'portfolio_admin_user',
  ACTING_AS: 'portfolio_acting_as',
};

export const getItem = async (key) => {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setItem = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (e) {
    console.warn('AsyncStorage setItem error:', e);
  }
};

export const removeItem = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.warn('AsyncStorage removeItem error:', e);
  }
};

export const multiRemove = async (keys) => {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.warn('AsyncStorage multiRemove error:', e);
  }
};
