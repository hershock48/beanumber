import { Suspense } from 'react';
import { BANNavigation } from '@/components/BANNavigation';
import { BANFooter } from '@/components/BANFooter';
import { ShirtSuccessClient } from './ShirtSuccessClient';

export const metadata = {
  title: 'Order Confirmed | Be A Number',
  description: 'Your shirt is on its way. Meet the child who wears your number.',
};

// Disable static optimization. This page reads ?session_id and polls for the
// webhook-assigned child; a cached shell would just show the loading state.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ShirtSuccessPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]">
      <BANNavigation currentPath="/shirts" />

      <main className="py-16 md:py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <Suspense fallback={<SuccessFallback />}>
            <ShirtSuccessClient />
          </Suspense>
        </div>
      </main>

      <BANFooter />
    </div>
  );
}

function SuccessFallback() {
  return (
    <div className="text-center py-12">
      <p className="text-[#aaa] text-sm">Loading your order…</p>
    </div>
  );
}
