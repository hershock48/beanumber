/**
 * Me — the Buyer Home surface (3.5).
 *
 * Register shift: section headers are H3 Inter, not H2 Lora. Lora is
 * for emotional beats; billing isn't one. Zero gold on this whole
 * screen. Warmth lives in exactly three places: "Thanks for making
 * this run." at the top, kid first names in the sponsorship rows,
 * and the footer's "a person answers."
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Card } from '../../components/design/Card';
import { ListItem } from '../../components/design/ListItem';
import { Skeleton } from '../../components/design/Skeleton';
import { deleteAccount, getMe, MeResponse } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

export default function MeTab() {
  const { signOut } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getMe();
      setMe(data);
    } catch (err) {
      // Silent — the shell renders even when /me is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          signOut();
        },
      },
    ]);
  };

  // Two-step delete confirm. First alert explains what deletion does
  // and does NOT do (sponsorships keep running); second alert is the
  // point-of-no-return. Apple wants both the deletion capability AND
  // clear disclosure about what stays behind (Guideline 5.1.1(v)).
  const confirmDeleteAccount = () => {
    const hasSponsorships = (me?.sponsorships?.length ?? 0) > 0;
    const message = hasSponsorships
      ? "You're signed out and your app account is removed. Your sponsorships keep running on your card — to stop them, cancel from Billing above (or email kevin@beanumber.org). This step doesn't touch your giving."
      : "You're signed out and your app account is removed. Sign back in anytime with the same email.";
    Alert.alert('Delete your Be A Number account?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Delete for real?',
            "This can't be undone from the app. If it's a mistake, tap Cancel.",
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete my account',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteAccount();
                  } catch (err) {
                    Alert.alert(
                      "Couldn't delete right now",
                      'Try again in a moment. If it keeps failing, email kevin@beanumber.org — a person answers.'
                    );
                    return;
                  }
                  // Local sign-out clears SecureStore + routes to auth.
                  signOut();
                },
              },
            ]
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: COLORS.cream }}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: SPACING.section }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.umber}
          />
        }
      >
        <View style={{ paddingHorizontal: SPACING.l, marginTop: SPACING.l }}>
          <Text variant="h1" color="ink">
            Me
          </Text>
          <Text
            variant="bodySmall"
            color="umber"
            style={{ marginTop: SPACING.s }}
          >
            Thanks for making this run.
          </Text>
        </View>

        {loading && !me ? (
          <View style={{ padding: SPACING.l }}>
            <Skeleton height={140} radius={RADIUS.cardLarge} />
            <View style={{ height: SPACING.l }} />
            <Skeleton height={220} radius={RADIUS.cardLarge} />
          </View>
        ) : me ? (
          <>
            {/* Sponsorships */}
            {me.sponsorships.length > 0 ? (
              <View
                style={{
                  marginTop: SPACING.section,
                  paddingHorizontal: SPACING.l,
                }}
              >
                <Text variant="h3" color="ink">
                  You're funding {me.sponsorships.length}{' '}
                  {me.sponsorships.length === 1
                    ? 'sponsorship'
                    : 'sponsorships'}
                </Text>
                <Card
                  style={{ marginTop: SPACING.m, paddingHorizontal: 0 }}
                  padded={false}
                >
                  {me.sponsorships.map((s, i) => (
                    <ListItem
                      key={`${s.shirtNumber}-${i}`}
                      title={`${s.kidFirstName} · #${s.shirtNumber}`}
                      subtitle={
                        s.sponsoredBy === 'you'
                          ? `Sponsored by you · $${s.monthlyAmount}/mo`
                          : `Sponsored by ${
                              s.sponsorOfRecord?.firstName || 'someone else'
                            } · $${s.monthlyAmount}/mo`
                      }
                      showChevron
                      onPress={() => {
                        // TODO: transfer/cancel sheet
                      }}
                      last={i === me.sponsorships.length - 1}
                    />
                  ))}
                </Card>
                <Text
                  variant="caption"
                  color="umber"
                  style={{ marginTop: SPACING.s }}
                >
                  Tap one to transfer billing or cancel.
                </Text>
              </View>
            ) : (
              <View
                style={{
                  marginTop: SPACING.section,
                  paddingHorizontal: SPACING.l,
                }}
              >
                <Text variant="h3" color="ink">
                  Sponsorships
                </Text>
                <Text
                  variant="body"
                  color="umber"
                  style={{ marginTop: SPACING.s }}
                >
                  None running on your card yet. When a shirt holder keeps
                  going, it lands here.
                </Text>
              </View>
            )}

            {/* Purchases */}
            {me.purchases.length > 0 ? (
              <View
                style={{
                  marginTop: SPACING.section,
                  paddingHorizontal: SPACING.l,
                }}
              >
                <Text variant="h3" color="ink">
                  Purchases
                </Text>
                <Card
                  style={{ marginTop: SPACING.m, paddingHorizontal: 0 }}
                  padded={false}
                >
                  {me.purchases.map((p, i) => (
                    <ListItem
                      key={`${p.purchasedOn}-${i}`}
                      title={p.shirtDisplay}
                      subtitle={formatDate(p.purchasedOn)}
                      trailing={
                        p.amountUsd != null ? `$${p.amountUsd}` : undefined
                      }
                      last={i === me.purchases.length - 1}
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            {/* Billing */}
            <View
              style={{
                marginTop: SPACING.section,
                paddingHorizontal: SPACING.l,
              }}
            >
              <Text variant="h3" color="ink">
                Billing
              </Text>
              <Card
                style={{ marginTop: SPACING.m, paddingHorizontal: 0 }}
                padded={false}
              >
                <ListItem
                  title="Card on file"
                  trailing={
                    me.billing.cardLast4
                      ? `···· ${me.billing.cardLast4}`
                      : me.billing.hasCardOnFile
                        ? 'On file'
                        : 'Add one'
                  }
                  showChevron
                  onPress={() => {
                    // TODO: open Stripe billing portal via in-app browser
                  }}
                />
                <ListItem
                  title="Receipts go to"
                  trailing={me.billing.receiptsEmail || me.email}
                  showChevron
                  onPress={() => {
                    // TODO: change email flow
                  }}
                />
                <ListItem
                  title="Cancel a sponsorship"
                  showChevron
                  onPress={() => {
                    // TODO: cancel picker
                  }}
                  last
                />
              </Card>
            </View>

            {/* Sign out + account deletion */}
            <View
              style={{
                marginTop: SPACING.section,
                paddingHorizontal: SPACING.l,
              }}
            >
              <Card style={{ paddingHorizontal: 0 }} padded={false}>
                <ListItem title="Sign out" onPress={confirmSignOut} />
                <ListItem
                  title="Delete my account"
                  onPress={confirmDeleteAccount}
                  last
                />
              </Card>
              <Text
                variant="caption"
                color="umber"
                style={{ marginTop: SPACING.s }}
              >
                Deleting removes your app account. Sponsorships keep running on
                your card — cancel those separately from Billing above.
              </Text>
            </View>

            {/* Footer — trust surface */}
            <View
              style={{
                marginTop: SPACING.section,
                paddingHorizontal: SPACING.l,
              }}
            >
              <Text variant="bodySmall" color="umber">
                Be A Number, International is a US 501(c)(3). EIN 93-1948872.
              </Text>
              <Text
                variant="bodySmall"
                color="umber"
                style={{ marginTop: SPACING.m }}
              >
                Questions about a charge? Write kevin@beanumber.org — a person
                answers.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
