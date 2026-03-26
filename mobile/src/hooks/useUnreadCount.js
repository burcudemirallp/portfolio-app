import { useState, useEffect, useRef } from 'react';
import { getUnreadCount } from '../services/api';

export default function useUnreadCount(intervalMs = 60000) {
  const [count, setCount] = useState(0);
  const timer = useRef(null);

  const fetch = async () => {
    try {
      const res = await getUnreadCount();
      setCount(res?.data?.count ?? res?.data ?? 0);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetch();
    timer.current = setInterval(fetch, intervalMs);
    return () => clearInterval(timer.current);
  }, [intervalMs]);

  return count;
}
