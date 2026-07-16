/**
 * <EnterNumberSheet />
 *
 * Manual number entry — the path for people who installed the app
 * from the store listing rather than scanning the shirt's QR code.
 * Before this sheet existed the ONLY ways to reach /meet/[N] were QR
 * deep links, deferred links, and pushes; a person standing there
 * holding their shirt had no way to type the number on the back. The
 * shirt insert literally says "enter your Number" — this is that.
 *
 * Type the number → route to /meet/[N] → the Hold-to-Meet reveal
 * runs exactly as if they'd scanned. No claim happens here; the
 * reveal screen's explicit "Keep #N" CTA owns that moment.
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
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from '../design/Text';
import { Button } from '../design/Button';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function EnterNumberSheet({ visible, onClose }: Props) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setValue('');
    setError(null);
    onClose();
  };

  const handleGo = () => {
    const n = parseInt(value.trim(), 10);
    if (!Number.isFinite(n) || n <= 0 || String(n) !== value.trim()) {
      setError('Numbers only — it’s printed on the back of the shirt.');
      return;
    }
    close();
    router.push(`/meet/${n}`);
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
          <Text variant="h2" color="ink">
            What’s your Number?
          </Text>
          <Text variant="body" color="umber" style={{ marginTop: SPACING.m }}>
            It’s on the back of your shirt. Type it in and meet the kid
            on the other end.
          </Text>

          <TextInput
            value={value}
            onChangeText={t => {
              setValue(t.replace(/[^0-9]/g, ''));
              if (error) setError(null);
            }}
            placeholder="48"
            placeholderTextColor={COLORS.umber}
            keyboardType="number-pad"
            maxLength={4}
            style={{
              marginTop: SPACING.l,
              borderWidth: 1,
              borderColor: error ? '#B3261E' : COLORS.ink,
              borderRadius: RADIUS.button,
              paddingVertical: 14,
              paddingHorizontal: SPACING.m,
              fontFamily: TEXT_STYLES.h2.fontFamily,
              fontSize: 24,
              color: COLORS.ink,
              backgroundColor: '#FFFFFF',
              textAlign: 'center',
              letterSpacing: 2,
            }}
            accessibilityLabel="Shirt number"
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
              onPress={handleGo}
              fullWidth
              disabled={!value.trim()}
            >
              Meet them
            </Button>
          </View>
          <View style={{ marginTop: SPACING.m, alignItems: 'center' }}>
            <Button variant="ghost" onPress={close}>
              Not now
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
