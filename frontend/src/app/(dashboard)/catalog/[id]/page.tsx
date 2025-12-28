'use client';

import { useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Star,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCatalogItem, useSubmitCatalogRequest, CatalogItemOption } from '@/hooks/useApi';

export default function CatalogItemPage() {
  const { id } = useParams();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const itemId = id as string;
  const { data: item, isLoading, error } = useCatalogItem(itemId);
  const submitRequest = useSubmitCatalogRequest();

  const validateForm = () => {
    if (!item?.options) return true;

    const newErrors: Record<string, string> = {};

    item.options.forEach((option: { id: string; name: string; required: boolean }) => {
      if (option.required && !formData[option.id]?.trim()) {
        newErrors[option.id] = `${option.name} is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const result = await submitRequest.mutateAsync({ itemId, formData });
      setRequestNumber(result?.number || null);
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit request:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Service not found</h2>
        <p className="text-gray-500 mb-4">The catalog item you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button onClick={() => router.push('/catalog')}>Back to Catalog</Button>
      </div>
    );
  }

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-600 mb-6">
            Your request for &quot;{item.name}&quot; has been submitted successfully.
            You will receive an email confirmation shortly.
          </p>
          {requestNumber && (
            <p className="text-sm text-gray-500 mb-6">
              Request Number: <span className="font-medium">{requestNumber}</span>
            </p>
          )}
          <div className="flex justify-center space-x-4">
            <Link href="/catalog">
              <Button variant="outline">Back to Catalog</Button>
            </Link>
            <Link href="/catalog?tab=requests">
              <Button>View My Requests</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
            <Link href="/catalog" className="hover:text-gray-700">
              Service Catalog
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link href={`/catalog/category/${item.category.id}`} className="hover:text-gray-700">
              {item.category.name}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
            <p className="text-gray-700">{item.description}</p>
          </div>

          {/* What's Included */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">What&apos;s Included</h2>
            <ul className="space-y-2">
              {item.includes?.map((included: string, index: number) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{included}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Request Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Request Details</h2>

            {item.options?.map((option: CatalogItemOption) => (
              <div key={option.id}>
                {option.type === 'select' && (
                  <div>
                    <label
                      htmlFor={option.id}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {option.name}
                      {option.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      id={option.id}
                      value={formData[option.id] || ''}
                      onChange={handleChange(option.id)}
                      className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[option.id] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={option.required}
                    >
                      <option value="">Select an option</option>
                      {option.choices?.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                    {errors[option.id] && (
                      <p className="mt-1 text-sm text-red-500">{errors[option.id]}</p>
                    )}
                  </div>
                )}

                {option.type === 'textarea' && (
                  <div>
                    <label
                      htmlFor={option.id}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {option.name}
                      {option.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <textarea
                      id={option.id}
                      rows={4}
                      placeholder={option.placeholder}
                      value={formData[option.id] || ''}
                      onChange={handleChange(option.id)}
                      className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors[option.id] ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={option.required}
                    />
                    {errors[option.id] && (
                      <p className="mt-1 text-sm text-red-500">{errors[option.id]}</p>
                    )}
                  </div>
                )}

                {option.type === 'text' && (
                  <Input
                    id={option.id}
                    type="text"
                    label={option.name}
                    placeholder={option.placeholder}
                    value={formData[option.id] || ''}
                    onChange={handleChange(option.id)}
                    error={errors[option.id]}
                    required={option.required}
                  />
                )}
              </div>
            ))}

            <div className="pt-4 border-t border-gray-200">
              <Button type="submit" className="w-full" isLoading={submitRequest.isPending}>
                Submit Request
              </Button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Info</h2>
            <dl className="space-y-4">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <dt className="text-sm text-gray-500">Estimated Time</dt>
                  <dd className="text-sm font-medium text-gray-900">{item.estimatedTime}</dd>
                </div>
              </div>
              <div className="flex items-center">
                {item.approvalRequired ? (
                  <AlertCircle className="h-5 w-5 text-yellow-500 mr-3" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                )}
                <div>
                  <dt className="text-sm text-gray-500">Approval</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {item.approvalRequired ? 'Required' : 'Auto-approved'}
                  </dd>
                </div>
              </div>
              <div className="flex items-center">
                <Star className="h-5 w-5 text-yellow-400 mr-3" />
                <div>
                  <dt className="text-sm text-gray-500">Popularity</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {item.popularity} requests this month
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          {/* Requirements */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h2>
            <ul className="space-y-2">
              {item.requirements?.map((req: string, index: number) => (
                <li key={index} className="flex items-start text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{req}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Related Items */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Related Services</h2>
            <ul className="space-y-3">
              {item.relatedItems?.map((related: { id: string; name: string; estimatedTime: string }) => (
                <li key={related.id}>
                  <Link
                    href={`/catalog/${related.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{related.name}</p>
                      <p className="text-xs text-gray-500">{related.estimatedTime}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
