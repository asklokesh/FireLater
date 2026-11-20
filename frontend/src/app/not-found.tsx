import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Home, Search } from 'lucide-react';

export default async function NotFound() {
  const sh = await getTranslations('shared');
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-8xl font-bold text-gray-200">404</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {sh('nfTitle')}
        </h1>
        <p className="text-gray-600 mb-8">
          {sh('nfBody')}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="w-4 h-4" />
            {sh('nfDashboard')}
          </Link>
          <Link
            href="/issues"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Search className="w-4 h-4" />
            {sh('nfIssues')}
          </Link>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            {sh('nfHelp')}{' '}
            <Link href="/knowledge" className="text-blue-600 hover:underline">
              {sh('nfKb')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
