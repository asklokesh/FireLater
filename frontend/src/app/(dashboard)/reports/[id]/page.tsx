'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Download,
  Clock,
  FileText,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle,
  Table,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportsApi, applicationsApi, groupsApi } from '@/lib/api';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  query_config: Record<string, unknown>;
  output_format: string[];
  parameters: ReportParameter[];
  created_at: string;
  updated_at: string;
}

interface ReportParameter {
  name: string;
  type: 'date' | 'select' | 'multiselect' | 'text' | 'number';
  label: string;
  required: boolean;
  default?: unknown;
  options?: { value: string; label: string }[];
}

interface ReportExecution {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  result_url: string | null;
  error: string | null;
  output_format: string;
  parameters: Record<string, unknown>;
}

interface ApplicationData {
  id: string;
  name: string;
}

interface GroupData {
  id: string;
  name: string;
}

export default function ReportExecutionPage() {
  const params = useParams();
  const _router = useRouter();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [executions, setExecutions] = useState<ReportExecution[]>([]);
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [outputFormat, setOutputFormat] = useState('pdf');
  const [currentExecution, setCurrentExecution] = useState<ReportExecution | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const loadTemplate = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await reportsApi.getTemplate(templateId);
      setTemplate(data);

      // Set default filter values
      const defaults: Record<string, unknown> = {};
      data.parameters?.forEach((param: ReportParameter) => {
        if (param.default !== undefined) {
          defaults[param.name] = param.default;
        }
      });
      setFilterValues(defaults);

      // Set default output format
      if (data.output_format?.length > 0) {
        setOutputFormat(data.output_format[0]);
      }
    } catch (err) {
      console.error('Failed to load template:', err);
      setError('Failed to load report template');
    } finally {
      setIsLoading(false);
    }
  }, [templateId]);

  const loadExecutions = useCallback(async () => {
    try {
      const response = await reportsApi.listExecutions({ templateId });
      setExecutions(response.data || []);
    } catch (err) {
      console.error('Failed to load executions:', err);
    }
  }, [templateId]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [appsRes, groupsRes] = await Promise.all([
        applicationsApi.list({ limit: 100 }),
        groupsApi.list({ limit: 100 }),
      ]);
      setApplications(appsRes.data || []);
      setGroups(groupsRes.data || []);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  }, []);

  useEffect(() => {
    loadTemplate();
    loadExecutions();
    loadReferenceData();
  }, [loadTemplate, loadExecutions, loadReferenceData]);

  // Poll for execution status
  useEffect(() => {
    if (!currentExecution || !['pending', 'running'].includes(currentExecution.status)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updated = await reportsApi.getExecution(currentExecution.id);
        setCurrentExecution(updated);

        if (updated.status === 'completed' || updated.status === 'failed') {
          loadExecutions();
        }
      } catch (err) {
        console.error('Failed to poll execution:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentExecution, loadExecutions]);

  const handleExecute = async () => {
    try {
      setIsExecuting(true);
      const execution = await reportsApi.execute(templateId, {
        filters: filterValues,
        outputFormat,
      });
      setCurrentExecution(execution);
    } catch (err) {
      console.error('Failed to execute report:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePreview = async () => {
    try {
      setIsLoadingPreview(true);
      const data = await reportsApi.preview(templateId, filterValues);
      setPreviewData(data.rows || []);
    } catch (err) {
      console.error('Failed to load preview:', err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownload = (execution: ReportExecution) => {
    if (execution.result_url) {
      window.open(execution.result_url, '_blank');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getParameterOptions = (param: ReportParameter) => {
    if (param.options) return param.options;

    // Dynamic options based on parameter name
    if (param.name === 'application_id' || param.name === 'applicationId') {
      return applications.map((a) => ({ value: a.id, label: a.name }));
    }
    if (param.name === 'group_id' || param.name === 'groupId') {
      return groups.map((g) => ({ value: g.id, label: g.name }));
    }

    return [];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">{error || 'Report not found'}</h3>
        <Link href="/reports">
          <Button variant="outline">Back to Reports</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Link href="/reports" className="mt-1">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{template.description}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handlePreview} disabled={isLoadingPreview}>
            {isLoadingPreview ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Table className="h-4 w-4 mr-2" />
            )}
            Preview
          </Button>
          <Button onClick={handleExecute} disabled={isExecuting}>
            {isExecuting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Filters & Settings */}
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 flex items-center">
                <Filter className="h-5 w-5 mr-2 text-gray-400" />
                Report Filters
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {template.parameters?.length > 0 ? (
                template.parameters.map((param) => (
                  <div key={param.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {param.label}
                      {param.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {param.type === 'date' && (
                      <input
                        type="date"
                        value={(filterValues[param.name] as string) || ''}
                        onChange={(e) => setFilterValues((p) => ({ ...p, [param.name]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                    {param.type === 'select' && (
                      <select
                        value={(filterValues[param.name] as string) || ''}
                        onChange={(e) => setFilterValues((p) => ({ ...p, [param.name]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select...</option>
                        {getParameterOptions(param).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {param.type === 'text' && (
                      <input
                        type="text"
                        value={(filterValues[param.name] as string) || ''}
                        onChange={(e) => setFilterValues((p) => ({ ...p, [param.name]: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                    {param.type === 'number' && (
                      <input
                        type="number"
                        value={(filterValues[param.name] as number) || ''}
                        onChange={(e) => setFilterValues((p) => ({ ...p, [param.name]: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No filters available</p>
              )}

              {/* Output Format */}
              <div className="pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">Output Format</label>
                <div className="flex space-x-2">
                  {(template.output_format || ['pdf', 'csv', 'xlsx']).map((format) => (
                    <button
                      key={format}
                      onClick={() => setOutputFormat(format)}
                      className={`px-4 py-2 rounded-md text-sm font-medium ${
                        outputFormat === format
                          ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                          : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                      }`}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Current Execution Status */}
          {currentExecution && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Current Execution</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    currentExecution.status === 'completed' ? 'bg-green-100 text-green-800' :
                    currentExecution.status === 'failed' ? 'bg-red-100 text-red-800' :
                    currentExecution.status === 'running' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {currentExecution.status === 'running' && (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {currentExecution.status === 'completed' && (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    {currentExecution.status.charAt(0).toUpperCase() + currentExecution.status.slice(1)}
                  </span>
                  {currentExecution.output_format && (
                    <span className="text-xs text-gray-500">{currentExecution.output_format.toUpperCase()}</span>
                  )}
                </div>

                {currentExecution.status === 'completed' && currentExecution.result_url && (
                  <Button onClick={() => handleDownload(currentExecution)} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Report
                  </Button>
                )}

                {currentExecution.status === 'failed' && currentExecution.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-700">{currentExecution.error}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Preview & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Preview */}
          {previewData && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">Preview (First 20 rows)</h2>
                <Button variant="ghost" size="sm" onClick={() => setPreviewData(null)}>
                  Close
                </Button>
              </div>
              <div className="overflow-x-auto">
                {previewData.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(previewData[0]).map((key) => (
                          <th
                            key={key}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {key.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {previewData.slice(0, 20).map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          {Object.values(row).map((value, vIdx) => (
                            <td key={vIdx} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value || '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-gray-500">No data matches the current filters</div>
                )}
              </div>
            </div>
          )}

          {/* Execution History */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Execution History</h2>
              <Button variant="ghost" size="sm" onClick={loadExecutions}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {executions.length > 0 ? (
              <div className="divide-y divide-gray-200">
                {executions.map((execution) => (
                  <div key={execution.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        execution.status === 'completed' ? 'bg-green-100' :
                        execution.status === 'failed' ? 'bg-red-100' :
                        'bg-yellow-100'
                      }`}>
                        {execution.status === 'completed' ? (
                          <FileText className="h-5 w-5 text-green-600" />
                        ) : execution.status === 'failed' ? (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        ) : (
                          <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            execution.status === 'completed' ? 'bg-green-100 text-green-800' :
                            execution.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {execution.status}
                          </span>
                          <span className="text-xs text-gray-500">{execution.output_format?.toUpperCase()}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {formatDate(execution.started_at)}
                        </p>
                      </div>
                    </div>
                    {execution.status === 'completed' && execution.result_url && (
                      <Button variant="outline" size="sm" onClick={() => handleDownload(execution)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p>No execution history yet</p>
                <p className="text-sm">Run the report to see results here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
