import {
  Container,
  Header,
  ProgressBar,
  Box,
  Alert,
  SpaceBetween
} from '@cloudscape-design/components';

export type TransferStatus = 'idle' | 'in-progress' | 'success' | 'error';

interface ProgressDisplayProps {
  progress: number; // 0-100
  status: TransferStatus;
  message?: string;
  s3Location?: string;
}

export const ProgressDisplay: React.FC<ProgressDisplayProps> = ({
  progress,
  status,
  message,
  s3Location
}) => {
  // Elapsed time tracking removed for now - can be added back when needed
  // const [elapsedTime, setElapsedTime] = useState(0);
  // const [startTime, setStartTime] = useState<number | null>(null);
  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Ready to start';
      case 'in-progress':
        return 'Transferring file...';
      case 'success':
        return 'Transfer complete';
      case 'error':
        return 'Transfer failed';
      default:
        return '';
    }
  };

  const renderStatusMessage = () => {
    if (status === 'success' && s3Location) {
      return (
        <Alert type="success" header="Transfer Successful">
          <SpaceBetween size="xs">
            <Box>File successfully uploaded to S3</Box>
            <Box variant="code">{s3Location}</Box>
          </SpaceBetween>
        </Alert>
      );
    }

    if (status === 'error' && message) {
      return (
        <Alert type="error" header="Transfer Failed">
          {message}
        </Alert>
      );
    }

    return null;
  };

  if (status === 'idle') {
    return null;
  }

  return (
    <Container
      header={
        <Header variant="h2">
          Transfer Progress
        </Header>
      }
    >
      <SpaceBetween size="l">
        {status === 'in-progress' && (
          <ProgressBar
            value={progress}
            label={getStatusText()}
            description={`${progress}% complete`}
            status="in-progress"
          />
        )}
        
        {renderStatusMessage()}
      </SpaceBetween>
    </Container>
  );
};
