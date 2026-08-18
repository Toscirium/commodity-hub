import React from 'react';
import { usePlatform } from '@/hooks/usePlatform';
import { PLAY_STORE_URL } from '@/lib/appLinks';

/**
 * "Get it on Google Play" link using Google's own hosted badge artwork
 * (per Google Play branding guidelines — don't recreate the badge locally).
 *
 * Hidden inside the installed Android/iOS app shell — no point promoting
 * the Play Store download from within the app itself.
 */
const GetOnGooglePlayButton: React.FC<{ className?: string }> = ({ className }) => {
  const { isNative } = usePlatform();
  if (isNative) return null;

  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label="Get Commodity Hub on Google Play"
    >
      <img
        src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
        alt="Get it on Google Play"
        width={135}
        height={40}
        loading="lazy"
        className="h-10 w-auto"
      />
    </a>
  );
};

export default GetOnGooglePlayButton;
