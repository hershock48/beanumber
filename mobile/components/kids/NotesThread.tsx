/**
 * <NotesThread /> — the correspondence engine, kid page section.
 *
 * Sponsor bubbles: right-aligned, gold bg, ink text, r=16 with 4pt tail
 * bottom-right. Kid bubbles: left-aligned, cream bg with 1px charcoal
 * outline, r=16 with 4pt tail bottom-left.
 *
 * States:
 *   - full thread (monthly sponsor of this kid)
 *   - empty state ("Say hi. Ismail loves hearing from you.")
 *   - locked state (holder — warm invitation card, "Keep going with Ismail")
 *   - hidden entirely (non-holder, unrelated sponsor, anonymous)
 *
 * The "Ismail is writing back" pending card appears at the bottom of a
 * thread when a reply is in flight. Never styled as a system status.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Card } from '../design/Card';

export interface ThreadMessage {
  id: string;
  direction: 'sponsorToKid' | 'kidToSponsor';
  sentAt: string;
  body: string;
  statusText?: string;
}

interface Props {
  kidFirstName: string;
  messages: ThreadMessage[];
  kidIsWritingBack?: boolean;
  onWriteFirstNote?: () => void; // empty state CTA
  /** When rendered, shows the holder locked card. */
  lockedForHolder?: boolean;
  onConvertPress?: () => void; // holder CTA
  /** Collapsed after this many pairs. */
  collapseAfterPairs?: number;
  onSeeFullPress?: () => void;
}

export function NotesThread({
  kidFirstName,
  messages,
  kidIsWritingBack = false,
  onWriteFirstNote,
  lockedForHolder = false,
  onConvertPress,
  collapseAfterPairs = 3,
  onSeeFullPress,
}: Props) {
  return (
    <View style={{ paddingHorizontal: SPACING.l }}>
      <Text variant="h2" color="ink">
        You and {kidFirstName}
      </Text>

      {lockedForHolder ? (
        <Card variant="large" style={{ marginTop: SPACING.m }}>
          <Text variant="body" color="ink">
            {kidFirstName} writes his sponsors back — real notes, in his own
            handwriting first, then typed up by his teacher.
          </Text>
          <Text
            variant="body"
            color="ink"
            style={{ marginTop: SPACING.m }}
          >
            Notes unlock when you sponsor {kidFirstName} for $25/mo. Cancel
            anytime.
          </Text>
          {onConvertPress ? (
            <Pressable
              onPress={onConvertPress}
              style={{ marginTop: SPACING.l, alignSelf: 'flex-start' }}
              accessibilityRole="button"
            >
              <Text
                color="ink"
                style={{
                  fontFamily: TEXT_STYLES.textLink.fontFamily,
                  fontSize: TEXT_STYLES.textLink.fontSize,
                }}
              >
                Keep going with {kidFirstName} →
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : messages.length === 0 ? (
        <Card variant="large" style={{ marginTop: SPACING.m }}>
          <Text variant="body" color="ink">
            Say hi. {kidFirstName} loves hearing from you.
          </Text>
          {onWriteFirstNote ? (
            <Pressable
              onPress={onWriteFirstNote}
              style={{ marginTop: SPACING.l, alignSelf: 'flex-start' }}
              accessibilityRole="button"
            >
              <Text
                color="ink"
                style={{
                  fontFamily: TEXT_STYLES.textLink.fontFamily,
                  fontSize: TEXT_STYLES.textLink.fontSize,
                }}
              >
                Write your first note →
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <View style={{ marginTop: SPACING.m }}>
          {collapse(messages, collapseAfterPairs).map(m => (
            <MessageBubble key={m.id} message={m} kidFirstName={kidFirstName} />
          ))}

          {messages.length > collapseAfterPairs * 2 && onSeeFullPress ? (
            <Pressable
              onPress={onSeeFullPress}
              style={{ marginTop: SPACING.m, alignSelf: 'center' }}
              accessibilityRole="button"
            >
              <Text
                color="ink"
                style={{
                  fontFamily: TEXT_STYLES.textLink.fontFamily,
                  fontSize: TEXT_STYLES.textLink.fontSize,
                }}
              >
                See full conversation
              </Text>
            </Pressable>
          ) : null}

          {kidIsWritingBack ? (
            <Card
              variant="large"
              style={{
                marginTop: SPACING.l,
                backgroundColor: COLORS.paper,
              }}
            >
              <Text variant="body" color="ink">
                {kidFirstName} is writing back. Should arrive within 2 weeks.
              </Text>
            </Card>
          ) : null}
        </View>
      )}
    </View>
  );
}

function collapse(
  msgs: ThreadMessage[],
  keepPairs: number
): ThreadMessage[] {
  const keep = keepPairs * 2;
  if (msgs.length <= keep) return msgs;
  return msgs.slice(msgs.length - keep);
}

function MessageBubble({
  message,
  kidFirstName,
}: {
  message: ThreadMessage;
  kidFirstName: string;
}) {
  const fromSponsor = message.direction === 'sponsorToKid';
  const bg = fromSponsor ? COLORS.gold : COLORS.cream;
  const border = fromSponsor ? undefined : `1px solid ${COLORS.charcoal}`;

  return (
    <View
      style={{
        alignSelf: fromSponsor ? 'flex-end' : 'flex-start',
        maxWidth: '78%',
        marginBottom: SPACING.m,
      }}
    >
      <View
        style={{
          backgroundColor: bg,
          borderRadius: 16,
          borderBottomRightRadius: fromSponsor ? 4 : 16,
          borderBottomLeftRadius: fromSponsor ? 16 : 4,
          paddingVertical: SPACING.m,
          paddingHorizontal: SPACING.l,
          borderWidth: fromSponsor ? 0 : 1,
          borderColor: fromSponsor ? undefined : COLORS.charcoal,
        }}
      >
        <Text variant="body" color="ink">
          {message.body}
        </Text>
      </View>
      <Text
        variant="caption"
        color="umber"
        style={{
          marginTop: 4,
          marginLeft: fromSponsor ? undefined : 4,
          marginRight: fromSponsor ? 4 : undefined,
          textAlign: fromSponsor ? 'right' : 'left',
        }}
      >
        {message.statusText ||
          (fromSponsor
            ? formatSentLine(message.sentAt)
            : formatKidLine(kidFirstName, message.sentAt))}
      </Text>
    </View>
  );
}

function formatSentLine(iso: string): string {
  const d = new Date(iso);
  return `Sent · ${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

function formatKidLine(_name: string, iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
