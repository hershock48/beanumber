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
 *   - free-letter state (holder, included letter unsent — "The letter
 *     that came with your shirt is ready to send")
 *   - spent state (holder, included letter used — thread renders,
 *     conversion card rides below it)
 *   - locked state (holder pre-claim edge cases — warm invitation card)
 *   - hidden entirely (non-holder, unrelated sponsor, anonymous)
 *
 * The "Ismail is writing back" pending card appears at the bottom of a
 * thread when a reply is in flight. Never styled as a system status.
 */
import React from 'react';
import { View, Pressable, Image as RNImage } from 'react-native';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Card } from '../design/Card';
import { LetterJourney } from './LetterJourney';
import { Postmark } from './Postmark';

export interface ThreadMessage {
  id: string;
  direction: 'sponsorToKid' | 'kidToSponsor';
  sentAt: string;
  body: string;
  statusText?: string;
  /** 1–4 journey stage on sponsor notes; null/undefined otherwise. */
  stage?: number | null;
}

interface Props {
  kidFirstName: string;
  /** Renders the postal roundel in the header when provided. */
  postmarkNumber?: number | null;
  messages: ThreadMessage[];
  kidIsWritingBack?: boolean;
  onWriteFirstNote?: () => void; // empty state CTA
  /** When rendered, shows the holder locked card. */
  lockedForHolder?: boolean;
  onConvertPress?: () => void; // holder CTA
  /**
   * Holder with the included letter still unsent — the empty state
   * becomes "the letter that came with your shirt is ready to send."
   */
  freeLetterAvailable?: boolean;
  /**
   * Holder whose included letter is used — the thread renders and a
   * conversion card rides below it.
   */
  holderSpent?: boolean;
  /** Collapsed after this many pairs. */
  collapseAfterPairs?: number;
  onSeeFullPress?: () => void;
}

export function NotesThread({
  kidFirstName,
  postmarkNumber = null,
  messages,
  kidIsWritingBack = false,
  onWriteFirstNote,
  lockedForHolder = false,
  onConvertPress,
  freeLetterAvailable = false,
  holderSpent = false,
  collapseAfterPairs = 3,
  onSeeFullPress,
}: Props) {
  return (
    <View style={{ paddingHorizontal: SPACING.l }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="h2" color="ink" style={{ flex: 1, paddingRight: 8 }}>
          You and {kidFirstName} — penpal
        </Text>
        {postmarkNumber != null ? (
          <Postmark shirtNumber={postmarkNumber} />
        ) : null}
      </View>

      {lockedForHolder ? (
        <Card variant="large" style={{ marginTop: SPACING.m }}>
          <Text variant="body" color="ink">
            Your penpal writes back — real notes, in {kidFirstName}'s own
            handwriting first, then typed up by the teacher.
          </Text>
          <Text
            variant="body"
            color="ink"
            style={{ marginTop: SPACING.m }}
          >
            You get a penpal, monthly photos, report cards, and campus
            updates. $25/month. Cancel anytime.
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
          {freeLetterAvailable ? (
            <>
              <Text variant="body" color="ink">
                Your shirt came with a letter to {kidFirstName} — and a
                letter back. It's ready to send, on us.
              </Text>
              <Text
                variant="bodySmall"
                color="umber"
                style={{ marginTop: SPACING.s }}
              >
                {kidFirstName} reads it in their own language — the
                campus team translates — and writes back to you.
              </Text>
            </>
          ) : (
            <Text variant="body" color="ink">
              Say hi. Your penpal loves hearing from you.
            </Text>
          )}
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
                {freeLetterAvailable
                  ? `Write your letter to ${kidFirstName} →`
                  : 'Write your first penpal note →'}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <View style={{ marginTop: SPACING.m }}>
          {collapse(messages, collapseAfterPairs).map(m => (
            <MessageBubble
              key={m.id}
              message={m}
              kidFirstName={kidFirstName}
              // The journey stepper rides on the newest in-flight
              // sponsor note only — one moving letter at a time (the
              // API enforces one queued note per kid anyway).
              showJourney={m.id === latestInFlightId(messages)}
            />
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

          {/* Spent-holder conversion — the included letter is used;
              the thread above proves the connection is real. This is
              the highest-intent conversion moment in the app. */}
          {holderSpent ? (
            <Card variant="large" style={{ marginTop: SPACING.l }}>
              <Text variant="body" color="ink">
                That was the letter that came with your shirt. Keep
                writing to {kidFirstName} — a penpal who writes back,
                monthly photos, report cards, campus updates. $25/month.
                Cancel anytime.
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

/** The newest sponsor note still on its journey (stage 1–3), if any. */
function latestInFlightId(msgs: ThreadMessage[]): string | null {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m.direction !== 'sponsorToKid') continue;
    if (typeof m.stage === 'number' && m.stage >= 1 && m.stage < 4) {
      return m.id;
    }
    return null; // newest sponsor note is delivered/journey-less — nothing in flight
  }
  return null;
}

function MessageBubble({
  message,
  kidFirstName,
  showJourney = false,
}: {
  message: ThreadMessage;
  kidFirstName: string;
  showJourney?: boolean;
}) {
  const fromSponsor = message.direction === 'sponsorToKid';
  const bg = fromSponsor ? COLORS.gold : COLORS.cream;

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
          overflow: 'hidden',
        }}
      >
        {/* Kid replies get paper grain — they started life as real
            paper in a kid's hands. Sponsor bubbles stay clean gold. */}
        {!fromSponsor ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <RNImage
              source={require('../../assets/paper-grain.png')}
              resizeMode="repeat"
              style={{ flex: 1, width: undefined, height: undefined }}
            />
          </View>
        ) : null}
        <Text variant="body" color="ink">
          {message.body}
        </Text>
      </View>

      {showJourney && typeof message.stage === 'number' ? (
        <LetterJourney stage={message.stage} kidFirstName={kidFirstName} />
      ) : (
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
      )}
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
