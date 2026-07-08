/**
 * <Composer /> — the send-a-note sheet.
 *
 * Opens from the FAB. 800-char soft limit; counter shows in the last
 * 100. Send disabled until ≥1 character. On success: sheet dismisses,
 * bubble arrives in thread (parent handles the append), one success
 * haptic. On failure: sheet stays open with a terracotta banner and
 * draft preserved.
 *
 * Dismiss with unsent text → iOS action sheet: Keep draft / Discard.
 * Keep is default. Draft persists in AsyncStorage keyed by kidId so
 * killing the app doesn't lose the writing.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Button } from '../design/Button';
import { Input } from '../design/Input';
import { Sheet } from '../design/Sheet';
import * as haptics from '../../lib/haptics';

const SOFT_LIMIT = 800;
const COUNTER_THRESHOLD = 100;

interface Props {
  visible: boolean;
  kidFirstName: string;
  kidShirtNumber: number;
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
}

function draftKey(shirt: number) {
  return `composer_draft::${shirt}`;
}

export function Composer({
  visible,
  kidFirstName,
  kidShirtNumber,
  onClose,
  onSend,
}: Props) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Hydrate the draft when the sheet opens.
  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(draftKey(kidShirtNumber))
        .then(v => v && setBody(v))
        .catch(() => {});
    }
  }, [visible, kidShirtNumber]);

  // Persist the draft on every keystroke.
  useEffect(() => {
    if (!visible) return;
    if (body) {
      AsyncStorage.setItem(draftKey(kidShirtNumber), body).catch(() => {});
    } else {
      AsyncStorage.removeItem(draftKey(kidShirtNumber)).catch(() => {});
    }
  }, [body, kidShirtNumber, visible]);

  const canSend = body.trim().length > 0 && !sending;
  const remaining = SOFT_LIMIT - body.length;
  const showCounter = remaining < COUNTER_THRESHOLD;

  const handleClose = () => {
    if (body.trim().length > 0 && !sendError) {
      Alert.alert(
        'Keep this draft?',
        `Your note to ${kidFirstName} will be saved.`,
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setBody('');
              AsyncStorage.removeItem(draftKey(kidShirtNumber)).catch(
                () => {}
              );
              onClose();
            },
          },
          {
            text: 'Keep draft',
            style: 'cancel',
            isPreferred: true,
            onPress: onClose,
          },
        ]
      );
    } else {
      onClose();
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(body.trim());
      // Success: clear draft, dismiss, haptic.
      await AsyncStorage.removeItem(draftKey(kidShirtNumber)).catch(() => {});
      setBody('');
      setSending(false);
      haptics.success();
      onClose();
    } catch (err) {
      setSending(false);
      haptics.errorHaptic();
      setSendError(
        err instanceof Error
          ? err.message
          : "Note didn't send. Try again?"
      );
    }
  };

  return (
    <Sheet visible={visible} onClose={handleClose} padded={false}>
      <View style={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl }}>
        {/* Header row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: SPACING.l,
          }}
        >
          <Text variant="h3" color="ink">
            Write {kidFirstName}
          </Text>
          <Pressable
            onPress={handleClose}
            accessibilityLabel="Close composer"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text
              color="ink"
              style={{
                fontFamily: TEXT_STYLES.h3.fontFamily,
                fontSize: 22,
                lineHeight: 22,
              }}
            >
              ×
            </Text>
          </Pressable>
        </View>

        {/* Text area */}
        <Input
          variant="writingSurface"
          value={body}
          onChangeText={setBody}
          placeholder={`Tell ${kidFirstName} what you're up to. He'll write back.`}
          maxLength={SOFT_LIMIT * 2} // hard clamp, soft indicator only
        />

        {/* Character counter — only when close to soft limit */}
        {showCounter ? (
          <Text
            variant="caption"
            color="umber"
            align="right"
            style={{ marginTop: SPACING.s }}
          >
            {remaining}
          </Text>
        ) : null}

        {/* Error banner — persists between attempts */}
        {sendError ? (
          <View
            style={{
              marginTop: SPACING.m,
              padding: SPACING.m,
              backgroundColor: COLORS.paper,
              borderRadius: 8,
              borderLeftWidth: 3,
              borderLeftColor: COLORS.error,
            }}
          >
            <Text variant="bodySmall" color="ink">
              Note didn't send. Try again?
            </Text>
          </View>
        ) : null}

        {/* Send button row */}
        <View
          style={{
            marginTop: SPACING.l,
            flexDirection: 'row',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="primary"
            onPress={handleSend}
            disabled={!canSend}
            loading={sending}
          >
            Send
          </Button>
        </View>
      </View>
    </Sheet>
  );
}
