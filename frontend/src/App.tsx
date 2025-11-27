import { useState, useEffect } from 'react';
import { AppLayout, ContentLayout, Header, SpaceBetween } from '@cloudscape-design/components';
import { DownloadForm } from './components/DownloadForm';
import { ProgressDisplay, TransferStatus } from './components/ProgressDisplay';
import { JobsMonitor, addJobToMonitor } from './components/JobsMonitor';
import { DownloadRequest } from './types/validation';
import { apiClient } from './services/ApiClient';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [message, setMessage] = useState<string>();
  const [s3Location, setS3Location] = useState<string>();
  const [refreshMonitor, setRefreshMonitor] = useState(0);

  // Listen for storage events to refresh the monitor
  useEffect(() => {
    const handleStorageChange = () => {
      setRefreshMonitor(prev => prev + 1);
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleDownload = async (request: DownloadRequest) => {
    try {
      setIsLoading(true);
      setStatus('in-progress');
      setProgress(0);
      setMessage(undefined);
      setS3Location(undefined);

      // Start the download
      const response = await apiClient.startDownload(request);

      if (!response.success) {
        setStatus('error');
        setMessage(response.error || 'Download failed');
        return;
      }

      // If we have a transferId, add it to the monitor and poll for progress
      if (response.transferId) {
        // Add job to monitor
        addJobToMonitor({
          transferId: response.transferId,
          sourceUrl: request.sourceUrl,
          bucketName: request.bucketName,
          keyPrefix: request.keyPrefix,
          status: 'pending',
          percentage: 0,
          bytesTransferred: 0,
          totalBytes: 0,
          startTime: new Date().toISOString()
        });
        
        // Trigger monitor refresh
        setRefreshMonitor(prev => prev + 1);

        await apiClient.pollProgress(
          response.transferId,
          (progressData) => {
            setProgress(progressData.progress.percentage);
            
            if (progressData.status === 'completed') {
              setStatus('success');
              setS3Location(progressData.metadata.s3Location);
            } else if (progressData.status === 'failed') {
              setStatus('error');
              setMessage(progressData.error || 'Transfer failed');
            }
          }
        );
      } else {
        // No progress tracking, assume immediate completion
        setStatus('success');
        setProgress(100);
        setS3Location(response.s3Location);
      }
    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout
      navigationHide
      toolsHide
      content={
        <ContentLayout
          header={
            <Header
              variant="h1"
              description="Download ZIP files from HTTPS URLs directly to AWS S3 buckets"
            >
              S3 ZIP Downloader
            </Header>
          }
        >
          <SpaceBetween size="l">
            <JobsMonitor key={refreshMonitor} />
            <DownloadForm onSubmit={handleDownload} isLoading={isLoading} />
            <ProgressDisplay
              progress={progress}
              status={status}
              message={message}
              s3Location={s3Location}
            />
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}

export default App;
