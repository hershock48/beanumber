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
import { BackChip } from '../../components/design/BackChip';
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
    // Hand off to the existing web sponsor-conversion flow. The
    // /children/[N]?source=app query flags this as an app-originated
    // conversion so the web can adjust the return-to-sender copy.
    const url = `${API_BASE_URL}/children/${shirtNumber}?source=app&intent=sponsor`;
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } finally {
      // Return to the kid page regardless of outcome. If they converted,
      // /children/[N] shows composer access; if not, kid-page gate copy
      // carries any remaining conversion motivation.
      goKidPage();
    }
  };

  const firstName = kid?.firstName ?? 'them';

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
      {/* Close → the kid page. "Not now" at the bottom does the same;
          the chip is for people whose thumb goes to the corner. */}
      <BackChip close onPress={goKidPage} />
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
              contentPosition="top"
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
          {/* Singular "they" until the schema carries a pronoun field —
              never guess a kid's pronoun from a name. */}
          Write to {firstName}. {firstName} writes back. Updates and
          photos land every month.
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
            Not yet — meet {firstName} first
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
