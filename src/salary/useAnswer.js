// One server answer for a Salary screen (Payments, Receipts, Unpaid Clients): loaded when the
// screen shows, again on a pull; a later answer wins, an earlier one that comes late is dropped.
// answer: null until loaded; problem: why not (salary/money.js moneyError) — the last answer
// stays on the screen when a refresh fails.
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { logError } from '../utils/logError';
import { moneyError } from './money';

export function useAnswer(load, what) {
  const [answer, setAnswer] = useState(null);
  const [problem, setProblem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const run = useCallback(async ({ pull = false } = {}) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const data = await load();
      if (n !== seq.current) return;
      setAnswer(data);
      setProblem(null);
    } catch (error) {
      if (n !== seq.current) return;
      const failed = moneyError(error, what);
      if (failed.kind === 'failed') logError(`Error loading ${what}:`, error);
      setProblem(failed);
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  }, [load, what]);

  useFocusEffect(useCallback(() => { run(); }, [run]));
  return { answer, problem, refreshing, reload: run };
}
