import { useState, useEffect } from 'react';
import {
  Container,
  Header,
  ProgressBar,
  SpaceBetween,
  Box,
  Button,
  StatusIndicator,
  Popover,
  FormField,
  Input
} from '@cloudscape-design/components';
import { apiClient } from '../services/ApiClient';

interface JobInfo {
  transferId: string;
  sourceUrl: string;
  bucketName: string;
  keyPrefix?: string;
  s3Key?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  percentage: number;
  bytesTransferred: number;
  totalBytes: number;
  startTime: string;
  error?: string;
}

const STORAGE_KEY = 'active-transfers';
const POLL_INTERVAL = 2000; // 2 seconds

export const JobsMonitor: React.FC = () => {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newTransferId, setNewTransferId] = useState('');

  // Load jobs from API on mount
  useEffect(() => {
    loadJobsFromAPI();
  }, []);

  // Poll for updates on all active jobs
  useEffect(() => {
    if (jobs.length === 0) {
      setIsLoading(false);
      return;
    }

    const activeJobs = jobs.filter(
      job => job.status === 'pending' || job.status === 'in-progress'
    );

    if (activeJobs.length === 0) {
      setIsLoading(false);
      return;
    }

    const pollAllJobs = async () => {
      const updates = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const response = await apiClient.getProgress(job.transferId);
            return {
              transferId: job.transferId,
              status: response.status,
              percentage: response.progress?.percentage || 0,
              bytesTransferred: response.progress?.bytesTransferred || 0,
              totalBytes: response.progress?.totalBytes || 0,
              sourceUrl: response.metadata?.sourceUrl || job.sourceUrl,
              bucketName: response.metadata?.bucketName || job.bucketName,
              keyPrefix: response.metadata?.keyPrefix || job.keyPrefix,
              s3Key: response.metadata?.s3Key || job.s3Key,
              startTime: response.metadata?.startTime || job.startTime,
              error: response.error
            };
          } catch (error) {
            console.error(`Failed to poll job ${job.transferId}:`, error);
            return job;
          }
        })
      );

      setJobs(prevJobs => {
        const updatedJobs = prevJobs.map(job => {
          const update = updates.find(u => u.transferId === job.transferId);
          return update || job;
        });
        saveJobs(updatedJobs);
        return updatedJobs;
      });
      setIsLoading(false);
    };

    pollAllJobs();
    const intervalId = setInterval(pollAllJobs, POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, [jobs.length]);

  const loadJobsFromAPI = async () => {
    try {
      setIsLoading(true);
      console.log('Loading jobs from API...');
      const response = await apiClient.listTransfers();
      console.log('API response:', response);
      
      if (response.success && response.transfers) {
        const formattedJobs: JobInfo[] = response.transfers
          .filter(transfer => transfer.metadata?.sourceUrl && transfer.metadata?.bucketName) // Filter out incomplete transfers
          .map(transfer => ({
            transferId: transfer.transferId,
            sourceUrl: transfer.metadata.sourceUrl,
            bucketName: transfer.metadata.bucketName,
            keyPrefix: transfer.metadata.keyPrefix,
            s3Key: transfer.metadata.s3Key,
            status: transfer.status,
            percentage: transfer.progress?.percentage || 0,
            bytesTransferred: transfer.progress?.bytesTransferred || 0,
            totalBytes: transfer.progress?.totalBytes || 0,
            startTime: transfer.metadata.startTime,
            error: transfer.error
          }));
        
        console.log('Formatted jobs:', formattedJobs);
        setJobs(formattedJobs);
        saveJobs(formattedJobs);
      }
    } catch (error) {
      console.error('Failed to load jobs from API:', error);
      // Fallback to localStorage if API fails
      loadJobsFromLocalStorage();
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobsFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setJobs(parsed);
      }
    } catch (error) {
      console.error('Failed to load jobs from localStorage:', error);
    }
  };

  const saveJobs = (jobsToSave: JobInfo[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobsToSave));
    } catch (error) {
      console.error('Failed to save jobs to localStorage:', error);
    }
  };

  const removeJob = (transferId: string) => {
    setJobs(prevJobs => {
      const filtered = prevJobs.filter(job => job.transferId !== transferId);
      saveJobs(filtered);
      return filtered;
    });
  };

  const clearCompleted = () => {
    setJobs(prevJobs => {
      const filtered = prevJobs.filter(
        job => job.status === 'pending' || job.status === 'in-progress'
      );
      saveJobs(filtered);
      return filtered;
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'pending':
        return <StatusIndicator type="pending">Pending</StatusIndicator>;
      case 'in-progress':
        return <StatusIndicator type="in-progress">In Progress</StatusIndicator>;
      case 'completed':
        return <StatusIndicator type="success">Completed</StatusIndicator>;
      case 'failed':
        return <StatusIndicator type="error">Failed</StatusIndicator>;
      default:
        return <StatusIndicator type="info">{status}</StatusIndicator>;
    }
  };

  const getFileName = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.split('/');
      return parts[parts.length - 1] || 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const handleAddTransferId = async () => {
    if (!newTransferId.trim()) return;

    try {
      // Fetch the transfer info from API
      const response = await apiClient.getProgress(newTransferId.trim());
      
      if (response.success) {
        addJobToMonitor({
          transferId: response.transferId,
          sourceUrl: response.metadata.sourceUrl,
          bucketName: response.metadata.bucketName,
          keyPrefix: response.metadata.keyPrefix,
          s3Key: response.metadata.s3Key,
          status: response.status,
          percentage: response.progress.percentage,
          bytesTransferred: response.progress.bytesTransferred,
          totalBytes: response.progress.totalBytes,
          startTime: response.metadata.startTime,
          error: response.error
        });
        
        setNewTransferId('');
        setShowAddInput(false);
        loadJobsFromAPI(); // Reload to show the new job
      }
    } catch (error) {
      console.error('Failed to add transfer:', error);
      alert('Failed to add transfer. Please check the transfer ID.');
    }
  };

  // Debug logging
  console.log('JobsMonitor render:', { jobsLength: jobs.length, isLoading, showAddInput });

  if (jobs.length === 0 && !isLoading && !showAddInput) {
    return (
      <Container>
        <SpaceBetween size="m" alignItems="center">
          <Box textAlign="center" color="text-body-secondary">
            No active transfers
          </Box>
          <Button onClick={() => setShowAddInput(true)}>
            Monitor Existing Transfer
          </Button>
        </SpaceBetween>
      </Container>
    );
  }
  
  if (jobs.length === 0 && !isLoading) {
    // If showAddInput is true but no jobs, just show the input
    return (
      <Container
        header={
          <Header variant="h2">
            Active Transfers
          </Header>
        }
      >
        <SpaceBetween size="m">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <FormField label="Transfer ID">
                <Input
                  value={newTransferId}
                  onChange={({ detail }) => setNewTransferId(detail.value)}
                  placeholder="e.g., 12345678-1234-1234-1234-123456789abc"
                  onKeyDown={(e) => {
                    if (e.detail.key === 'Enter') {
                      handleAddTransferId();
                    }
                  }}
                />
              </FormField>
            </div>
            <Button variant="primary" onClick={handleAddTransferId}>
              Add
            </Button>
          </div>
          <Box textAlign="center" color="text-body-secondary">
            No transfers found. Add a transfer ID to monitor an existing transfer.
          </Box>
        </SpaceBetween>
      </Container>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setShowAddInput(!showAddInput)}>
                {showAddInput ? 'Cancel' : 'Monitor Existing Transfer'}
              </Button>
              <Button onClick={clearCompleted} disabled={!jobs.some(j => j.status === 'completed' || j.status === 'failed')}>
                Clear Completed
              </Button>
            </SpaceBetween>
          }
        >
          Active Transfers
        </Header>
      }
    >
      <SpaceBetween size="m">
        {showAddInput && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <FormField label="Transfer ID">
                <Input
                  value={newTransferId}
                  onChange={({ detail }) => setNewTransferId(detail.value)}
                  placeholder="e.g., 12345678-1234-1234-1234-123456789abc"
                  onKeyDown={(e) => {
                    if (e.detail.key === 'Enter') {
                      handleAddTransferId();
                    }
                  }}
                />
              </FormField>
            </div>
            <Button variant="primary" onClick={handleAddTransferId}>
              Add
            </Button>
          </div>
        )}
        {jobs.map(job => (
          <div key={job.transferId} style={{ padding: '8px 0' }}>
            <SpaceBetween size="xs">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Popover
                  dismissButton={false}
                  position="top"
                  size="small"
                  triggerType="custom"
                  content={
                    <SpaceBetween size="xs">
                      <Box variant="small">
                        <strong>Bucket:</strong> {job.bucketName}
                      </Box>
                      {job.s3Key && (
                        <Box variant="small">
                          <strong>Key:</strong> {job.s3Key}
                        </Box>
                      )}
                      <Box variant="small">
                        <strong>Source:</strong> {job.sourceUrl}
                      </Box>
                      {job.totalBytes > 0 && (
                        <Box variant="small">
                          <strong>Size:</strong> {formatBytes(job.totalBytes)}
                        </Box>
                      )}
                    </SpaceBetween>
                  }
                >
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                    {getFileName(job.sourceUrl)}
                  </span>
                </Popover>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {getStatusIndicator(job.status)}
                  <Button
                    variant="icon"
                    iconName="close"
                    onClick={() => removeJob(job.transferId)}
                  />
                </div>
              </div>
              
              {(job.status === 'pending' || job.status === 'in-progress') && (
                <ProgressBar
                  value={job.percentage}
                  label={`${formatBytes(job.bytesTransferred)} / ${formatBytes(job.totalBytes)}`}
                  description={job.status === 'pending' ? 'Starting...' : undefined}
                />
              )}
              
              {job.status === 'failed' && job.error && (
                <Box color="text-status-error" variant="small">
                  {job.error}
                </Box>
              )}
              
              {job.status === 'completed' && job.s3Key && (
                <Box color="text-status-success" variant="small">
                  Saved to s3://{job.bucketName}/{job.s3Key}
                </Box>
              )}
            </SpaceBetween>
          </div>
        ))}
      </SpaceBetween>
    </Container>
  );
};

// Export function to add a job from outside the component
export const addJobToMonitor = (job: JobInfo) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const jobs = stored ? JSON.parse(stored) : [];
    const newJobs = [job, ...jobs];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newJobs));
    
    // Trigger a storage event to update the component
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to add job to monitor:', error);
  }
};
