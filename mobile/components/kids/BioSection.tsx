/**
 * <BioSection /> — permanent facts.
 *
 * Two-column label/value list. Empty fields silently omit. Never
 * "Not specified," never "—". A short bio is correct, not broken.
 * No card, no photos — visual weight belongs above.
 */
import React from 'react';
import { View } from 'react-native';
import { COLORS, SPACING } from '../../lib/theme';
import { Text } from '../design/Text';

export interface BioData {
  fullName?: string;
  ageYears?: number | null;
  gradeLabel?: string;
  favoriteClass?: string;
  wantsToBe?: string;
  family?: string;
  homeVillage?: string;
  sponsoredSince?: string; // ISO date
}

interface Props {
  bio: BioData;
}

const LABELS: Record<keyof BioData, string> = {
  fullName: 'Full name',
  ageYears: 'Age',
  gradeLabel: 'Grade',
  favoriteClass: 'Favorite class',
  wantsToBe: 'Wants to be',
  family: 'Family',
  homeVillage: 'Home village',
  sponsoredSince: 'Since',
};

const ORDER: (keyof BioData)[] = [
  'fullName',
  'ageYears',
  'gradeLabel',
  'favoriteClass',
  'wantsToBe',
  'family',
  'homeVillage',
  'sponsoredSince',
];

export function BioSection({ bio }: Props) {
  const rows = ORDER.map(k => ({
    key: k,
    label: LABELS[k],
    value: formatValue(k, bio[k]),
  })).filter(r => r.value !== '');

  if (rows.length === 0) return null;

  return (
    <View
      style={{
        paddingHorizontal: SPACING.l,
      }}
    >
      {rows.map(r => (
        <View
          key={r.key}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingVertical: SPACING.s,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.divider,
          }}
        >
          <Text
            variant="caption"
            color="umber"
            style={{ width: 130, paddingTop: 2 }}
          >
            {r.label}
          </Text>
          <Text
            variant="bodySmall"
            color="ink"
            style={{ flex: 1 }}
          >
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatValue(key: keyof BioData, v: unknown): string {
  if (v == null || v === '') return '';
  if (key === 'ageYears' && typeof v === 'number') return String(v);
  if (key === 'sponsoredSince' && typeof v === 'string') {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return `Sponsored since ${d.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })}`;
  }
  return String(v);
}
