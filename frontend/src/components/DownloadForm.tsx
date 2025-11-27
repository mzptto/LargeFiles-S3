import { useState } from 'react';
import {
  Form,
  FormField,
  Input,
  Button,
  SpaceBetween,
  Container,
  Header
} from '@cloudscape-design/components';
import { ValidationService } from '../services/ValidationService';
import { DownloadRequest, ValidationErrors } from '../types/validation';

interface DownloadFormProps {
  onSubmit: (request: DownloadRequest) => Promise<void>;
  isLoading: boolean;
}

export const DownloadForm: React.FC<DownloadFormProps> = ({ onSubmit, isLoading }) => {
  const [sourceUrl, setSourceUrl] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [keyPrefix, setKeyPrefix] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateField = (field: 'sourceUrl' | 'bucketName' | 'keyPrefix', value: string) => {
    let result;
    
    switch (field) {
      case 'sourceUrl':
        result = ValidationService.validateUrl(value);
        break;
      case 'bucketName':
        result = ValidationService.validateBucketName(value);
        break;
      case 'keyPrefix':
        result = ValidationService.validateKeyPrefix(value);
        break;
    }

    setErrors(prev => ({
      ...prev,
      [field]: result.isValid ? undefined : result.error
    }));

    return result.isValid;
  };

  const handleSourceUrlChange = (value: string) => {
    setSourceUrl(value);
    if (value) {
      validateField('sourceUrl', value);
    } else {
      setErrors(prev => ({ ...prev, sourceUrl: undefined }));
    }
  };

  const handleBucketNameChange = (value: string) => {
    setBucketName(value);
    if (value) {
      validateField('bucketName', value);
    } else {
      setErrors(prev => ({ ...prev, bucketName: undefined }));
    }
  };

  const handleKeyPrefixChange = (value: string) => {
    setKeyPrefix(value);
    if (value) {
      validateField('keyPrefix', value);
    } else {
      setErrors(prev => ({ ...prev, keyPrefix: undefined }));
    }
  };

  const isFormValid = () => {
    if (!sourceUrl || !bucketName) {
      return false;
    }

    const urlValid = ValidationService.validateUrl(sourceUrl).isValid;
    const bucketValid = ValidationService.validateBucketName(bucketName).isValid;
    const prefixValid = ValidationService.validateKeyPrefix(keyPrefix).isValid;

    return urlValid && bucketValid && prefixValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const urlValid = validateField('sourceUrl', sourceUrl);
    const bucketValid = validateField('bucketName', bucketName);
    const prefixValid = validateField('keyPrefix', keyPrefix);

    if (urlValid && bucketValid && prefixValid) {
      const request: DownloadRequest = {
        sourceUrl,
        bucketName,
        keyPrefix: keyPrefix || undefined
      };
      await onSubmit(request);
    }
  };

  return (
    <Container
      header={
        <Header variant="h2">
          Download Configuration
        </Header>
      }
    >
      <form onSubmit={handleSubmit}>
        <Form
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="primary"
                disabled={!isFormValid() || isLoading}
                loading={isLoading}
              >
                Start Download
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <FormField
              label="Source URL"
              description="HTTPS URL pointing to a .zip file"
              errorText={errors.sourceUrl}
            >
              <Input
                value={sourceUrl}
                onChange={({ detail }) => handleSourceUrlChange(detail.value)}
                placeholder="https://example.com/file.zip"
                disabled={isLoading}
              />
            </FormField>

            <FormField
              label="S3 Bucket Name"
              description="Name of the destination S3 bucket"
              errorText={errors.bucketName}
            >
              <Input
                value={bucketName}
                onChange={({ detail }) => handleBucketNameChange(detail.value)}
                placeholder="my-bucket-name"
                disabled={isLoading}
              />
            </FormField>

            <FormField
              label="Key Prefix (Optional)"
              description="Optional folder path in S3 (e.g., 'downloads/' or 'archives/2024/')"
              errorText={errors.keyPrefix}
            >
              <Input
                value={keyPrefix}
                onChange={({ detail }) => handleKeyPrefixChange(detail.value)}
                placeholder="downloads/"
                disabled={isLoading}
              />
            </FormField>
          </SpaceBetween>
        </Form>
      </form>
    </Container>
  );
};
