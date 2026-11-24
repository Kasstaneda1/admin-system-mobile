// A failure under the form of a payment screen (the refusal of the server: «Payments are turned
// off for you. Ask the office.», a lost connection…) is the last thing in its scroll, under the
// fixed button: after Record it could stay below the edge and nothing seemed to happen (QA before
// build 2). When the words come, the screen scrolls to them and VoiceOver reads them.
//   const scrollRef = useShowFailure(failed);  <ScrollView ref={scrollRef} …>
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useShowFailure(failure) {
  const ref = useRef(null);
  useEffect(() => {
    if (!failure) return undefined;
    // after the box is laid out
    const timer = setTimeout(() => { if (ref.current) ref.current.scrollToEnd({ animated: true }); }, 50);
    if (typeof failure === 'string') AccessibilityInfo.announceForAccessibility(failure);
    return () => clearTimeout(timer);
  }, [failure]);
  return ref;
}
