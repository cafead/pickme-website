import { Platform } from 'react-native';

// Ivory and gold, like the website.
export const C = {
  bg: '#FAF6EF',
  card: '#FFFDF9',
  ink: '#2B2118',
  muted: '#7A6A58',
  gold: '#A8843A',
  goldDark: '#8A6A2A',
  goldSoft: '#EFE5CF',
  brown: '#4A3220',
  line: '#E6DCCB',
  ok: '#3F7D4E',
  okSoft: '#E3F0E5',
  bad: '#A33A2B',
  badSoft: '#F6E2DE',
  shade: 'rgba(43,33,24,0.45)',
};

export const SERIF = Platform.select({ android: 'serif', ios: 'Georgia', default: 'Georgia, serif' });

export const shadow = Platform.select({
  android: { elevation: 3 },
  default: { shadowColor: '#3B2A1A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
});
