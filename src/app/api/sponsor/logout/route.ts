import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('sponsor_session');
  
  return NextResponse.redirect(new URL('/sponsor/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'));
}
