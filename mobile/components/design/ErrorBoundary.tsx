/**
 * <AppErrorBoundary /> — the app's last line of defense.
 *
 * A render crash without a boundary is a white screen and a force-
 * quit — and on Android, an ANR/crash statistic that Google Play
 * uses as a hard gate for any featuring or promotion (per the Play
 * featuring guide). With a boundary it's a warm cream screen and a
 * "Try again" that re-mounts the tree.
 *
 * Class component because error boundaries still require
 * getDerivedStateFromError — there is no hook for this.
 *
 * The fallback follows the voice: no stack traces, no "Oops!", no
 * apology theater. One honest line, one action.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { COLORS, RADIUS, SPACING, TEXT_STYLES } from '../../lib/theme';
import { Text } from './Text';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Dev console only — no crash-reporting service is wired yet.
    // When one lands (Sentry et al.), this is the single hook point.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.cream,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.xl,
        }}
      >
        <Text
          color="ink"
          style={{
            fontFamily: TEXT_STYLES.h2.fontFamily,
            fontSize: TEXT_STYLES.h2.fontSize,
            textAlign: 'center',
          }}
        >
          Something went sideways.
        </Text>
        <Text
          variant="body"
          color="umber"
          style={{ marginTop: SPACING.m, textAlign: 'center' }}
        >
          Not your fault. The campus is still there — let&apos;s get you
          back to it.
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          style={{
            marginTop: SPACING.xl,
            backgroundColor: COLORS.gold,
            paddingVertical: SPACING.m,
            paddingHorizontal: SPACING.xl,
            borderRadius: RADIUS.pill,
          }}
        >
          <Text
            color="ink"
            style={{
              fontFamily: TEXT_STYLES.h3.fontFamily,
              fontSize: 15,
            }}
          >
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
}
