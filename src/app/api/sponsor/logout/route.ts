/**
 * Sponsor Logout API
 * Clears sponsor session and redirects to login
 */

import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ROUTES } from '@/lib/constants';

export async function POST() {
  logger.info('Sponsor logout requested');

  await clearSession();

  logger.info('Sponsor logout successful');

  return NextResponse.redirect(
    new URL(
      ROUTES.SPONSOR_LOGIN,
      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.beanumber.org'
    )
  );
}
