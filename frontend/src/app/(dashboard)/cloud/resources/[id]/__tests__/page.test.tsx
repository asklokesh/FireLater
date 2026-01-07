import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResourceDetailPage from '../page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'res-123' })),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the API
vi.mock('@/lib/api', () => ({
  cloudApi: {
    getResource: vi.fn(),
    mapResourceToApplication: vi.fn(),
    unmapResource: vi.fn(),
  },
  applicationsApi: {
    list: vi.fn(),
  },
}));

import { cloudApi, applicationsApi } from '@/lib/api';
import { useParams } from 'next/navigation';

const mockResource = {
  id: 'res-123',
  cloud_account_id: 'acc-1',
  resource_id: 'i-abc12345',
  resource_type: 'aws:ec2',
  name: 'Production Web Server',
  region: 'us-west-2',
  status: 'running',
  tags: { Environment: 'Production', Team: 'Engineering' },
  metadata: { instance_type: 't3.large', vpc_id: 'vpc-123' },
  application_id: null,
  application_name: null,
  environment_id: null,
  environment_name: null,
  account_name: 'AWS Production',
  provider: 'aws',
  monthly_cost: 125.50,
  last_synced_at: '2024-01-15T10:30:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T10:30:00Z',
};

const mockMappedResource = {
  ...mockResource,
  application_id: 'app-1',
  application_name: 'Customer Portal',
  environment_id: 'env-1',
  environment_name: 'Production',
};

const mockApplications = [
  { id: 'app-1', name: 'Customer Portal', short_name: 'CUST' },
  { id: 'app-2', name: 'Internal Tools', short_name: 'INT' },
];

const mockGetResource = cloudApi.getResource as ReturnType<typeof vi.fn>;
const mockMapResource = cloudApi.mapResourceToApplication as ReturnType<typeof vi.fn>;
const mockUnmapResource = cloudApi.unmapResource as ReturnType<typeof vi.fn>;
const mockListApps = applicationsApi.list as ReturnType<typeof vi.fn>;
const mockUseParams = useParams as ReturnType<typeof vi.fn>;

describe('ResourceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'res-123' });
    mockGetResource.mockResolvedValue(mockResource);
    mockListApps.mockResolvedValue({ data: mockApplications });
  });

  describe('Loading State', () => {
    it('shows loading spinner while loading', () => {
      mockGetResource.mockImplementation(() => new Promise(() => {}));
      render(<ResourceDetailPage />);
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when resource fails to load', async () => {
      mockGetResource.mockRejectedValue(new Error('Network error'));
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Failed to load resource details')).toBeInTheDocument();
      });
    });

    it('shows back button in error state', async () => {
      mockGetResource.mockRejectedValue(new Error('Network error'));
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Back to Cloud Resources/i })).toBeInTheDocument();
      });
    });
  });

  describe('Basic Rendering', () => {
    it('renders resource name', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
    });

    it('renders resource ID', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('i-abc12345')).toBeInTheDocument();
      });
    });

    it('renders provider badge', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      // AWS badge should be rendered after resource loads
      const awsBadges = screen.getAllByText('AWS');
      expect(awsBadges.length).toBeGreaterThan(0);
    });

    it('renders status badge', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      // Status badge should be rendered after resource loads
      const runningBadges = screen.getAllByText('running');
      expect(runningBadges.length).toBeGreaterThan(0);
    });

    it('renders back button', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const backLink = screen.getAllByRole('link').find(link => link.getAttribute('href') === '/cloud');
        expect(backLink).toBeDefined();
      });
    });
  });

  describe('Resource Details Section', () => {
    it('displays resource type', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Resource Type')).toBeInTheDocument();
        expect(screen.getByText('aws:ec2')).toBeInTheDocument();
      });
    });

    it('displays region', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      // Region should be rendered with multiple instances (header details + quick stats)
      expect(screen.getAllByText('Region').length).toBeGreaterThan(0);
      expect(screen.getAllByText('us-west-2').length).toBeGreaterThan(0);
    });

    it('displays cloud account', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Cloud Account')).toBeInTheDocument();
        expect(screen.getByText('AWS Production')).toBeInTheDocument();
      });
    });

    it('displays monthly cost', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      const monthlyCostLabels = screen.getAllByText('Monthly Cost');
      expect(monthlyCostLabels.length).toBeGreaterThan(0);
      const costValues = screen.getAllByText('$125.50');
      expect(costValues.length).toBeGreaterThan(0);
    });

    it('displays N/A for null cost', async () => {
      mockGetResource.mockReset();
      mockGetResource.mockResolvedValue({ ...mockResource, monthly_cost: null });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      const naValues = screen.getAllByText('N/A');
      expect(naValues.length).toBeGreaterThan(0);
    });
  });

  describe('Tags Section', () => {
    it('displays tags', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText(/Environment:/)).toBeInTheDocument();
        expect(screen.getByText('Production')).toBeInTheDocument();
        expect(screen.getByText(/Team:/)).toBeInTheDocument();
        expect(screen.getByText('Engineering')).toBeInTheDocument();
      });
    });

    it('displays no tags message when empty', async () => {
      mockGetResource.mockResolvedValue({ ...mockResource, tags: {} });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('No tags defined')).toBeInTheDocument();
      });
    });
  });

  describe('Metadata Section', () => {
    it('displays metadata as JSON', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText(/instance_type/)).toBeInTheDocument();
        expect(screen.getByText(/t3.large/)).toBeInTheDocument();
      });
    });

    it('displays no metadata message when empty', async () => {
      mockGetResource.mockResolvedValue({ ...mockResource, metadata: {} });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('No metadata available')).toBeInTheDocument();
      });
    });
  });

  describe('Application Mapping - Unmapped', () => {
    it('shows map button when not mapped', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Map to Application/i })).toBeInTheDocument();
      });
    });

    it('shows not mapped message', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('This resource is not mapped to any application.')).toBeInTheDocument();
      });
    });

    it('opens map modal when button clicked', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Map to Application/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Map to Application/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Map to Application' })).toBeInTheDocument();
      });
    });

    it('shows application dropdown in modal', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Map to Application/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Map to Application/i }));

      await waitFor(() => {
        expect(screen.getByText('Customer Portal (CUST)')).toBeInTheDocument();
        expect(screen.getByText('Internal Tools (INT)')).toBeInTheDocument();
      });
    });

    it('closes modal when cancel clicked', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Map to Application/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Map to Application/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Map to Application' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Map to Application' })).not.toBeInTheDocument();
      });
    });

    it('maps resource when application selected', async () => {
      mockMapResource.mockResolvedValue({});
      render(<ResourceDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Map to Application/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Map to Application/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Map to Application' })).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'app-1' } });

      const mapButton = screen.getByRole('button', { name: /Map Resource/i });
      fireEvent.click(mapButton);

      await waitFor(() => {
        expect(mockMapResource).toHaveBeenCalledWith('res-123', 'app-1');
      });
    });
  });

  describe('Application Mapping - Mapped', () => {
    beforeEach(() => {
      mockGetResource.mockResolvedValue(mockMappedResource);
    });

    it('shows application name when mapped', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Customer Portal')).toBeInTheDocument();
      });
    });

    it('shows environment name when mapped', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const prodLabels = screen.getAllByText('Production');
        expect(prodLabels.length).toBeGreaterThan(0);
      });
    });

    it('shows unmap button when mapped', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Unmap from Application/i })).toBeInTheDocument();
      });
    });

    it('links to application detail page', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'Customer Portal' });
        expect(link).toHaveAttribute('href', '/applications/app-1');
      });
    });
  });

  describe('Quick Stats Section', () => {
    it('displays provider in quick stats', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const awsBadges = screen.getAllByText('AWS');
        expect(awsBadges.length).toBeGreaterThan(0);
      });
    });

    it('displays status in quick stats', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const runningBadges = screen.getAllByText('running');
        expect(runningBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Actions Section', () => {
    it('displays View Metrics button', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /View Metrics/i })).toBeInTheDocument();
      });
    });

    it('displays Cost History button', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cost History/i })).toBeInTheDocument();
      });
    });

    it('displays Open in Cloud Console button', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Open in Cloud Console/i })).toBeInTheDocument();
      });
    });
  });

  describe('Provider Colors', () => {
    it('applies orange for AWS provider', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      const awsBadge = screen.getAllByText('AWS')[0];
      expect(awsBadge).toHaveClass('text-orange-800');
    });

    it('applies blue for Azure provider', async () => {
      mockGetResource.mockReset();
      mockGetResource.mockResolvedValue({ ...mockResource, provider: 'azure' });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      const azureBadges = screen.getAllByText('AZURE');
      expect(azureBadges[0]).toHaveClass('text-blue-800');
    });

    it('applies red for GCP provider', async () => {
      mockGetResource.mockReset();
      mockGetResource.mockResolvedValue({ ...mockResource, provider: 'gcp' });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Production Web Server')).toBeInTheDocument();
      });
      const gcpBadges = screen.getAllByText('GCP');
      expect(gcpBadges[0]).toHaveClass('text-red-800');
    });
  });

  describe('Status Colors', () => {
    it('applies green for running status', async () => {
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const statusBadges = screen.getAllByText('running');
        expect(statusBadges[0]).toHaveClass('text-green-800');
      });
    });

    it('applies gray for stopped status', async () => {
      mockGetResource.mockResolvedValue({ ...mockResource, status: 'stopped' });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const statusBadge = screen.getAllByText('stopped')[0];
        expect(statusBadge).toHaveClass('text-gray-800');
      });
    });

    it('applies yellow for pending status', async () => {
      mockGetResource.mockResolvedValue({ ...mockResource, status: 'pending' });
      render(<ResourceDetailPage />);
      await waitFor(() => {
        const statusBadge = screen.getAllByText('pending')[0];
        expect(statusBadge).toHaveClass('text-yellow-800');
      });
    });
  });
});
