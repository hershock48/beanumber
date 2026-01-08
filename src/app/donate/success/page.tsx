import Link from 'next/link';

export default function DonateSuccess() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-12 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Thank You for Your Donation!
        </h1>
        <p className="text-lg text-gray-700 mb-6 leading-relaxed">
          Your contribution supports sustainable systems that generate measurable, long-term outcomes in Northern Uganda.
        </p>
        <p className="text-gray-600 mb-8">
          You will receive a tax-deductible receipt via email shortly. If you have any questions, please contact us at{' '}
          <a href="mailto:Kevin@beanumber.org" className="text-gray-900 underline">
            Kevin@beanumber.org
          </a>
          .
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
          >
            Return to Homepage
          </Link>
          <Link
            href="/impact"
            className="px-6 py-3 bg-white text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors font-medium"
          >
            See Our Impact
          </Link>
        </div>
      </div>
    </div>
  );
}
