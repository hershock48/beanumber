/**
 * Keep going with [Kid]? — the post-reveal conversion moment (3.6 frame 4).
 *
 * Landed AFTER the reveal for holders (people who just met a kid but
 * don't yet sponsor them monthly). Never on the reveal itself. The
 * "Yes" path hands off to web checkout (per brief §2.4 payments happen
 * on the website); on success we return to the kid page. The "Not yet"
 * path lands on the kid page in holder state with NO re-prompt, ever.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../lib/theme';
import { Text } from '../../components/design/Text';
import { Button } from '../../components/design/Button';
import { getMobileKid, MobileKidDetail, API_BASE_URL } from '../../lib/api';

export default function KeepGoingScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const shirtNumber = parseInt(number || '', 10);
  const router = useRouter();
  const [kid, setKid] = useState<MobileKidDetail | null>(null);

  useEffect(() => {
    if (Number.isFinite(shirtNumber)) {
      getMobileKid(shirtNumber).then(setKid).catch(() => {});
    }
  }, [shirtNumber]);

  const goKidPage = () => router.replace(`/children/${shirtNumber}`);

  const handleYes = async () => {
    const url = `${API_BASE_URL}/sponsorship/start?shirtNumber=${shirtNumber}&source=app`;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PageSheet,
      });
    } finally {
      goKidPage();
    }
  };

  const firstName = kid?.firstName ?? 'them';
  const pronoun = 'him'; // TODO: pull pronoun from kid data when we add it

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: COLORS.cream,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
      edges={['top', 'bottom']}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.xl,
        }}
      >
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: COLORS.sand,
            overflow: 'hidden',
            marginBottom: SPACING.xl,
          }}
        >
          {kid?.photoUrl ? (
            <Image
              source={{ uri: kid.photoUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={200}
            />
          ) : null}
        </View>

        <Text variant="h1" color="ink" align="center">
          Keep going with {firstName}?
        </Text>
        <Text
          variant="body"
          color="ink"
          align="center"
          style={{ marginTop: SPACING.l }}
        >
          Write {pronoun}. {pronoun.charAt(0).toUpperCase() + pronoun.slice(1)}{' '}
          writes back. {firstName}'s updates and photos land every month.
        </Text>
        <Text
          variant="bodySmall"
          color="umber"
          align="center"
          style={{ marginTop: SPACING.m }}
        >
          $25/mo. Cancel anytime. Runs the whole campus.
        </Text>
      </View>

      <View
        style={{
          width: '100%',
          paddingHorizontal: SPACING.l,
          paddingBottom: SPACING.xl,
        }}
      >
        <Button variant="primary" onPress={handleYes} fullWidth>
          Yes, sponsor {firstName}
        </Button>
        <View style={{ marginTop: SPACING.m, alignItems: 'center' }}>
          <Button variant="ghost" onPress={goKidPage}>
            Not yet — meet {pronoun} first
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
