/**
 * <LinkEmailSheet />
 *
 * The "connect your purchase email" moment. Shown from:
 *   - Home's empty "Your kids" state
 *   - the Penpal tab's empty state
 *   - Me → "Connect a purchase email" row
 *
 * Why it exists: mobile sign-in is Apple/Google, and the email that
 * comes back (often an Apple private relay) frequently ISN'T the email
 * the person bought their shirt with. Until they link it, the app
 * looks empty for exactly the people who own the most. The flow:
 * type the email → server mails it a one-tap confirm link → they tap
 * it in their inbox → their kids appear on the next refresh.
 *
 * Two states: `entry` (email input + send) and `sent` (check your
 * inbox). We never reveal whether the email exists in our data —
 * the server is privacy-silent and so is this copy.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Button } from '../design/Button';
import { requestEmailLink } from '../../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LinkEmailSheet({ visible, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setSending(false);
    setSent(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('That doesn’t look like an email address.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await requestEmailLink(trimmed);
      setSent(true);
    } catch {
      setError(
        'Couldn’t reach the campus. Check your connection and try again.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        {/* Scrim */}
        <Pressable
          onPress={close}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(13,13,13,0.4)',
          }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View
          style={{
            backgroundColor: COLORS.cream,
            borderTopLeftRadius: RADIUS.cardLarge,
            borderTopRightRadius: RADIUS.cardLarge,
            paddingHorizontal: SPACING.l,
            paddingTop: SPACING.xl,
            paddingBottom: SPACING.zone,
          }}
        >
          {sent ? (
            <>
              <Text variant="h2" color="ink">
                Check that inbox.
              </Text>
              <Text
                variant="body"
                color="umber"
                style={{ marginTop: SPACING.m }}
              >
                We sent a confirmation link to {email.trim()}. Tap it and
                your shirts and sponsorships show up here. The link is
                good for 24 hours.
              </Text>
              <View style={{ marginTop: SPACING.xl }}>
                <Button variant="primary" onPress={close} fullWidth>
                  Done
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text variant="h2" color="ink">
                Shirt under a different email?
              </Text>
              <Text
                variant="body"
                color="umber"
                style={{ marginTop: SPACING.m }}
              >
                If you bought your shirt (or started sponsoring) with
                another email, connect it here. We’ll send that inbox a
                one-tap link to prove it’s yours.
              </Text>

              <TextInput
                value={email}
                onChangeText={t => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.umber}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!sending}
                style={{
                  marginTop: SPACING.l,
                  borderWidth: 1,
                  borderColor: error ? '#B3261E' : COLORS.ink,
                  borderRadius: RADIUS.button,
                  paddingVertical: 14,
                  paddingHorizontal: SPACING.m,
                  fontFamily: TEXT_STYLES.body.fontFamily,
                  fontSize: 17,
                  color: COLORS.ink,
                  backgroundColor: '#FFFFFF',
                }}
                accessibilityLabel="Purchase email"
              />
              {error ? (
                <Text
                  variant="caption"
                  style={{ marginTop: SPACING.s, color: '#B3261E' }}
                >
                  {error}
                </Text>
              ) : null}

              <View style={{ marginTop: SPACING.l }}>
                <Button
                  variant="primary"
                  onPress={handleSend}
                  fullWidth
                  disabled={sending}
                >
                  {sending ? 'Sending…' : 'Send the link'}
                </Button>
              </View>
              <View style={{ marginTop: SPACING.m, alignItems: 'center' }}>
                <Button variant="ghost" onPress={close}>
                  Not now
                </Button>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
