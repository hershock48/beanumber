/**
 * <FeedVideo /> — a campus video in the feed.
 *
 * Instagram grammar: autoplays muted and loops, tap toggles sound.
 * No scrubber, no fullscreen chrome in the feed — a feed video is a
 * moment, not a screening. Isolated in its own component because
 * useVideoPlayer is a hook and FeedCard only sometimes has a video.
 *
 * Why this exists at all: the July 2026 engagement research's
 * clearest finding was that Fahlo's retention comes from narrative
 * drip, and video is the highest-bandwidth story format the campus
 * team can produce with a phone. The app is now ready for their
 * first clip before it's been shot.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { COLORS, SPACING } from '../../lib/theme';
import { Text } from '../design/Text';

interface Props {
  uri: string;
  /** Match FeedCard's photo ratio so the feed rhythm stays even. */
  aspectRatio?: number;
}

export function FeedVideo({ uri, aspectRatio = 4 / 3 }: Props) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const toggleSound = () => {
    const next = !muted;
    player.muted = next;
    setMuted(next);
  };

  return (
    <Pressable onPress={toggleSound} accessibilityRole="button">
      <View
        style={{
          width: '100%',
          aspectRatio,
          backgroundColor: COLORS.sand,
        }}
      >
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          nativeControls={false}
        />
        {/* Sound state chip — quiet, bottom-right, IG grammar. */}
        <View
          style={{
            position: 'absolute',
            bottom: SPACING.s,
            right: SPACING.s,
            backgroundColor: 'rgba(13,13,13,0.65)',
            borderRadius: 999,
            paddingVertical: 3,
            paddingHorizontal: 9,
          }}
        >
          <Text
            variant="caption"
            color="cream"
            style={{ fontSize: 11, lineHeight: 14 }}
          >
            {muted ? 'Tap for sound' : 'Sound on'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
