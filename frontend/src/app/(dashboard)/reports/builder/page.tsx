'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Play,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Database,
  Filter,
  FileText,
  Table,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reportsApi } from '@/lib/api';

type FieldType = 'string' | 'number' | 'date' | 'boolean';
type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';
type FilterOperator = 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'between';

interface DataSource {
  id: string;
  name: string;
  description: string;
  fields: DataField[];
}

interface DataField {
  name: string;
  label: string;
  type: FieldType;
  sortable: boolean;
  filterable: boolean;
  aggregatable: boolean;
}

interface SelectedColumn {
  id: string;
  field: string;
  label: string;
  aggregation: AggregationType;
  visible: boolean;
}

interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  value2?: string;
}

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

// Available data sources
const dataSources: DataSource[] = [
  {
    id: 'issues',
    name: 'Issues',
    description: 'Incident and problem tickets',
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'title', label: 'Title', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'priority', label: 'Priority', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'assignee_name', label: 'Assignee', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'application_name', label: 'Application', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'created_at', label: 'Created At', type: 'date', sortable: true, filterable: true, aggregatable: false },
      { name: 'resolved_at', label: 'Resolved At', type: 'date', sortable: true, filterable: true, aggregatable: false },
      { name: 'resolution_time', label: 'Resolution Time (hrs)', type: 'number', sortable: true, filterable: true, aggregatable: true },
    ],
  },
  {
    id: 'changes',
    name: 'Changes',
    description: 'Change requests and implementations',
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'title', label: 'Title', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'risk_level', label: 'Risk Level', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'requester_name', label: 'Requester', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'application_name', label: 'Application', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'scheduled_start', label: 'Scheduled Start', type: 'date', sortable: true, filterable: true, aggregatable: false },
      { name: 'scheduled_end', label: 'Scheduled End', type: 'date', sortable: true, filterable: true, aggregatable: false },
      { name: 'success', label: 'Success', type: 'boolean', sortable: true, filterable: true, aggregatable: true },
    ],
  },
  {
    id: 'applications',
    name: 'Applications',
    description: 'Application inventory and health',
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'name', label: 'Name', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'criticality', label: 'Criticality', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'environment', label: 'Environment', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'health_score', label: 'Health Score', type: 'number', sortable: true, filterable: true, aggregatable: true },
      { name: 'owner_name', label: 'Owner', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'support_group_name', label: 'Support Group', type: 'string', sortable: true, filterable: true, aggregatable: true },
    ],
  },
  {
    id: 'requests',
    name: 'Service Requests',
    description: 'Service catalog requests',
    fields: [
      { name: 'id', label: 'ID', type: 'string', sortable: true, filterable: true, aggregatable: false },
      { name: 'catalog_item_name', label: 'Catalog Item', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'requester_name', label: 'Requester', type: 'string', sortable: true, filterable: true, aggregatable: true },
      { name: 'created_at', label: 'Created At', type: 'date', sortable: true, filterable: true, aggregatable: false },
      { name: 'completed_at', label: 'Completed At', type: 'date', sortable: true, filterable: true, aggregatable: false },
      { name: 'fulfillment_time', label: 'Fulfillment Time (hrs)', type: 'number', sortable: true, filterable: true, aggregatable: true },
    ],
  },
];

const operatorLabels: Record<FilterOperator, string> = {
  equals: 'equals',
  not_equals: 'not equals',
  contains: 'contains',
  gt: 'greater than',
  lt: 'less than',
  gte: 'greater than or equal',
  lte: 'less than or equal',
  in: 'in list',
  between: 'between',
};

export default function ReportBuilderPage() {
  const router = useRouter();

  // Report metadata
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');

  // Data source selection
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);

  // Column selection
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([]);
  const [expandedSection, setExpandedSection] = useState<'columns' | 'filters' | 'sort' | null>('columns');

  // Filters
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  // Sorting
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Output
  const [outputFormats, setOutputFormats] = useState<string[]>(['pdf', 'csv']);

  // State
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add column
  const addColumn = (field: DataField) => {
    if (selectedColumns.find((c) => c.field === field.name)) return;

    setSelectedColumns([
      ...selectedColumns,
      {
        id: `col-${Date.now()}`,
        field: field.name,
        label: field.label,
        aggregation: 'none',
        visible: true,
      },
    ]);
  };

  // Remove column
  const removeColumn = (id: string) => {
    setSelectedColumns(selectedColumns.filter((c) => c.id !== id));
  };

  // Update column
  const updateColumn = (id: string, updates: Partial<SelectedColumn>) => {
    setSelectedColumns(selectedColumns.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  // Add filter
  const addFilter = () => {
    if (!selectedSource) return;

    setFilters([
      ...filters,
      {
        id: `filter-${Date.now()}`,
        field: selectedSource.fields[0].name,
        operator: 'equals',
        value: '',
      },
    ]);
  };

  // Remove filter
  const removeFilter = (id: string) => {
    setFilters(filters.filter((f) => f.id !== id));
  };

  // Update filter
  const updateFilter = (id: string, updates: Partial<FilterCondition>) => {
    setFilters(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  // Preview
  const handlePreview = async () => {
    if (!selectedSource || selectedColumns.length === 0) return;

    try {
      setIsPreviewLoading(true);
      setError(null);

      // Build query config
      const queryConfig = {
        dataSource: selectedSource.id,
        columns: selectedColumns.map((c) => ({
          field: c.field,
          label: c.label,
          aggregation: c.aggregation,
        })),
        filters: filters.map((f) => ({
          field: f.field,
          operator: f.operator,
          value: f.value,
          value2: f.value2,
        })),
        sort: sortConfig,
        limit: 20,
      };

      const data = await reportsApi.preview('custom', queryConfig);
      setPreviewData(data.rows || []);
    } catch (err) {
      console.error('Preview failed:', err);
      setError('Failed to generate preview');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Save
  const handleSave = async () => {
    if (!reportName.trim()) {
      setError('Report name is required');
      return;
    }
    if (!selectedSource) {
      setError('Please select a data source');
      return;
    }
    if (selectedColumns.length === 0) {
      setError('Please select at least one column');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const template = await reportsApi.createTemplate({
        name: reportName,
        description: reportDescription,
        type: selectedSource.id,
        queryConfig: {
          dataSource: selectedSource.id,
          columns: selectedColumns.map((c) => ({
            field: c.field,
            label: c.label,
            aggregation: c.aggregation,
          })),
          filters: filters.map((f) => ({
            field: f.field,
            operator: f.operator,
            value: f.value,
            value2: f.value2,
          })),
          sort: sortConfig,
        },
        outputFormat: outputFormats,
        parameters: [],
      });

      router.push(`/reports/${template.id}`);
    } catch (err) {
      console.error('Save failed:', err);
      setError('Failed to save report template');
    } finally {
      setIsSaving(false);
    }
  };

  const getFieldByName = (name: string): DataField | undefined => {
    return selectedSource?.fields.find((f) => f.name === name);
  };

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
            <h1 className="text-2xl font-bold text-gray-900">Report Builder</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create custom reports with drag-and-drop simplicity
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!selectedSource || selectedColumns.length === 0 || isPreviewLoading}
          >
            {isPreviewLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Preview
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Report
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-6">
          {/* Report Info */}
          <div className="bg-white rounded-lg shadow p-4 space-y-4">
            <h2 className="font-medium text-gray-900">Report Details</h2>
            <Input
              label="Report Name"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="My Custom Report"
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Describe what this report shows..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Data Source */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-medium text-gray-900 flex items-center mb-4">
              <Database className="h-4 w-4 mr-2 text-gray-400" />
              Data Source
            </h2>
            <div className="space-y-2">
              {dataSources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => {
                    setSelectedSource(source);
                    setSelectedColumns([]);
                    setFilters([]);
                    setSortConfig(null);
                  }}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    selectedSource?.id === source.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{source.name}</div>
                  <div className="text-xs text-gray-500">{source.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Output Format */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-medium text-gray-900 flex items-center mb-4">
              <FileText className="h-4 w-4 mr-2 text-gray-400" />
              Output Format
            </h2>
            <div className="flex flex-wrap gap-2">
              {['pdf', 'csv', 'xlsx', 'json'].map((format) => (
                <button
                  key={format}
                  onClick={() => {
                    setOutputFormats((prev) =>
                      prev.includes(format)
                        ? prev.filter((f) => f !== format)
                        : [...prev, format]
                    );
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-medium uppercase ${
                    outputFormats.includes(format)
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center Panel - Builder */}
        <div className="lg:col-span-2 space-y-4">
          {/* Columns Section */}
          <div className="bg-white rounded-lg shadow">
            <button
              onClick={() => setExpandedSection(expandedSection === 'columns' ? null : 'columns')}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-medium text-gray-900 flex items-center">
                <Table className="h-4 w-4 mr-2 text-gray-400" />
                Columns
                <span className="ml-2 text-sm text-gray-500">({selectedColumns.length} selected)</span>
              </span>
              {expandedSection === 'columns' ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {expandedSection === 'columns' && selectedSource && (
              <div className="border-t border-gray-200 p-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Available Fields */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Available Fields</h3>
                    <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                      {selectedSource.fields
                        .filter((f) => !selectedColumns.find((c) => c.field === f.name))
                        .map((field) => (
                          <button
                            key={field.name}
                            onClick={() => addColumn(field)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span>{field.label}</span>
                            <Plus className="h-3 w-3 text-gray-400" />
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Selected Columns */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Columns</h3>
                    <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                      {selectedColumns.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">
                          Click fields to add them
                        </div>
                      ) : (
                        selectedColumns.map((col) => {
                          const field = getFieldByName(col.field);
                          return (
                            <div
                              key={col.id}
                              className="px-3 py-2 flex items-center justify-between hover:bg-gray-50"
                            >
                              <div className="flex items-center">
                                <GripVertical className="h-3 w-3 text-gray-300 mr-2" />
                                <span className="text-sm">{col.label}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                {field?.aggregatable && (
                                  <select
                                    value={col.aggregation}
                                    onChange={(e) =>
                                      updateColumn(col.id, { aggregation: e.target.value as AggregationType })
                                    }
                                    className="text-xs border border-gray-200 rounded px-1 py-0.5"
                                  >
                                    <option value="none">-</option>
                                    <option value="count">Count</option>
                                    <option value="sum">Sum</option>
                                    <option value="avg">Avg</option>
                                    <option value="min">Min</option>
                                    <option value="max">Max</option>
                                  </select>
                                )}
                                <button
                                  onClick={() => removeColumn(col.id)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filters Section */}
          <div className="bg-white rounded-lg shadow">
            <button
              onClick={() => setExpandedSection(expandedSection === 'filters' ? null : 'filters')}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-medium text-gray-900 flex items-center">
                <Filter className="h-4 w-4 mr-2 text-gray-400" />
                Filters
                <span className="ml-2 text-sm text-gray-500">({filters.length} active)</span>
              </span>
              {expandedSection === 'filters' ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {expandedSection === 'filters' && selectedSource && (
              <div className="border-t border-gray-200 p-4 space-y-3">
                {filters.map((filter) => (
                  <div key={filter.id} className="flex items-center space-x-2">
                    <select
                      value={filter.field}
                      onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      {selectedSource.fields
                        .filter((f) => f.filterable)
                        .map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.label}
                          </option>
                        ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, { operator: e.target.value as FilterOperator })}
                      className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      {Object.entries(operatorLabels).map(([op, label]) => (
                        <option key={op} value={op}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={filter.value}
                      onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                    />
                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addFilter}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Filter
                </Button>
              </div>
            )}
          </div>

          {/* Sort Section */}
          <div className="bg-white rounded-lg shadow">
            <button
              onClick={() => setExpandedSection(expandedSection === 'sort' ? null : 'sort')}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <span className="font-medium text-gray-900 flex items-center">
                Sort Order
                {sortConfig && (
                  <span className="ml-2 text-sm text-gray-500">
                    by {getFieldByName(sortConfig.field)?.label} ({sortConfig.direction})
                  </span>
                )}
              </span>
              {expandedSection === 'sort' ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {expandedSection === 'sort' && selectedSource && (
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center space-x-2">
                  <select
                    value={sortConfig?.field || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSortConfig({ field: e.target.value, direction: sortConfig?.direction || 'asc' });
                      } else {
                        setSortConfig(null);
                      }
                    }}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                  >
                    <option value="">No sorting</option>
                    {selectedSource.fields
                      .filter((f) => f.sortable)
                      .map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                  {sortConfig && (
                    <select
                      value={sortConfig.direction}
                      onChange={(e) =>
                        setSortConfig({ ...sortConfig, direction: e.target.value as 'asc' | 'desc' })
                      }
                      className="px-2 py-1.5 border border-gray-200 rounded text-sm"
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow sticky top-4">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">Preview</h2>
            </div>
            <div className="p-4">
              {previewData === null ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  <Table className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p>Configure your report and click Preview to see results</p>
                </div>
              ) : previewData.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No data matches your criteria
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {selectedColumns.map((col) => (
                          <th
                            key={col.id}
                            className="px-2 py-1 text-left font-medium text-gray-500 uppercase"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {previewData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          {selectedColumns.map((col) => (
                            <td key={col.id} className="px-2 py-1 text-gray-900 whitespace-nowrap">
                              {String((row as Record<string, unknown>)[col.field] || '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewData.length > 10 && (
                    <p className="text-xs text-gray-500 text-center mt-2">
                      Showing 10 of {previewData.length} rows
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
