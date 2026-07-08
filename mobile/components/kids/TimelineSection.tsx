/**
 * <TimelineSection /> — SOTM + grade promotions + milestones.
 *
 * Reverse-chronological. Gold filled star icon for SOTM (sanctioned
 * gold filled use), line-arrow-up for promotion, line circle for
 * milestone. Absolute month + year, never relative.
 */
import React from 'react';
import { View } from 'react-native';
import { COLORS, SPACING } from '../../lib/theme';
import { Text } from '../design/Text';

export interface TimelineEntry {
  id: string;
  occurredOn: string; // ISO date
  type: 'sotm' | 'promotion' | 'milestone';
  title: string;
  subtitle?: string;
}

interface Props {
  kidFirstName: string;
  entries: TimelineEntry[];
  visibleCount?: number;
}

export function TimelineSection({
  kidFirstName,
  entries,
  visibleCount = 5,
}: Props) {
  const shown = entries.slice(0, visibleCount);
  return (
    <View style={{ paddingHorizontal: SPACING.l }}>
      <Text variant="h2" color="ink">
        {kidFirstName}'s year
      </Text>

      {shown.length === 0 ? (
        <Text
          variant="bodySmall"
          color="umber"
          style={{ marginTop: SPACING.m }}
        >
          No milestones yet. Simon adds them when they happen.
        </Text>
      ) : (
        <View style={{ marginTop: SPACING.m }}>
          {shown.map(e => (
            <TimelineRow key={e.id} entry={e} />
          ))}
        </View>
      )}
    </View>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: SPACING.l,
      }}
    >
      <View
        style={{ width: 32, alignItems: 'center', paddingTop: 2 }}
      >
        <TimelineIcon type={entry.type} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" color="ink">
          {entry.title}
        </Text>
        <Text
          variant="caption"
          color="umber"
          style={{ marginTop: 2 }}
        >
          {formatMonthYear(entry.occurredOn)}
          {entry.subtitle ? ` · ${entry.subtitle}` : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * Icons drawn from primitives to avoid an SVG dep for these tiny glyphs.
 * The gold filled star is the sole sanctioned gold filled icon in the
 * whole app.
 */
function TimelineIcon({ type }: { type: TimelineEntry['type'] }) {
  if (type === 'sotm') {
    // Simple 5-point star silhouette approximated with rotated squares —
    // good enough at 20pt for a page-inline icon. Swap for SVG if fidelity
    // becomes an issue.
    return (
      <View
        style={{
          width: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 12,
            height: 12,
            backgroundColor: COLORS.gold,
            transform: [{ rotate: '45deg' }],
            position: 'absolute',
          }}
        />
        <View
          style={{
            width: 12,
            height: 12,
            backgroundColor: COLORS.gold,
          }}
        />
      </View>
    );
  }

  if (type === 'promotion') {
    return (
      <View
        style={{
          width: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Arrow up */}
        <View
          style={{
            width: 1.5,
            height: 12,
            backgroundColor: COLORS.charcoal,
            position: 'absolute',
            bottom: 2,
          }}
        />
        <View
          style={{
            width: 6,
            height: 6,
            borderTopWidth: 1.5,
            borderRightWidth: 1.5,
            borderColor: COLORS.charcoal,
            transform: [{ rotate: '-45deg' }],
            position: 'absolute',
            top: 3,
          }}
        />
      </View>
    );
  }

  // Milestone — line circle.
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: COLORS.charcoal,
        marginTop: 3,
      }}
    />
  );
}

function formatMonthYear(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
