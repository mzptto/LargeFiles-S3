# Requirements Document

## Introduction

This document specifies the requirements for a web application that enables users to download ZIP files directly from HTTP/HTTPS URLs to AWS S3 buckets. The application provides a simple interface for entering a source URL and destination S3 bucket, then streams the file directly to S3 with real-time progress feedback. The application will be styled to match the AWS Console aesthetic and deployed to the cloud.

## Glossary

- **Web Application**: The browser-based user interface that accepts user input and displays progress
- **Source URL**: The HTTPS URL pointing to a ZIP file to be downloaded
- **S3 Bucket**: An Amazon S3 storage bucket where the ZIP file will be stored
- **Backend Service**: The server-side component that handles the file transfer from the source URL to S3
- **Progress Indicator**: A visual component showing the download and upload progress
- **AWS Console Style**: The visual design language used by Amazon Web Services console interfaces

## Requirements

### Requirement 1

**User Story:** As a user, I want to input a source HTTPS URL for a ZIP file, so that I can specify which file to download to S3.

#### Acceptance Criteria

1. WHEN the Web Application loads, THEN the Web Application SHALL display an input field for entering the source URL
2. WHEN a user enters a URL, THEN the Web Application SHALL validate that the URL uses HTTPS protocol
3. WHEN a user enters a URL, THEN the Web Application SHALL validate that the URL ends with .zip extension
4. WHEN a user enters an invalid URL, THEN the Web Application SHALL display an error message indicating the validation failure
5. WHEN a user enters a valid URL, THEN the Web Application SHALL enable the download action

### Requirement 2

**User Story:** As a user, I want to specify the destination S3 bucket, so that I can control where the ZIP file is stored.

#### Acceptance Criteria

1. WHEN the Web Application loads, THEN the Web Application SHALL display an input field for entering the S3 bucket name
2. WHEN a user enters an S3 bucket name, THEN the Web Application SHALL validate that the bucket name follows AWS naming conventions
3. WHEN a user enters an invalid bucket name, THEN the Web Application SHALL display an error message indicating the validation failure
4. WHEN a user enters a valid bucket name, THEN the Web Application SHALL enable the download action
5. WHERE the user provides an optional S3 key prefix, THE Web Application SHALL accept and use that prefix for the destination path

### Requirement 3

**User Story:** As a user, I want to initiate the download process, so that the ZIP file is transferred from the source URL to my S3 bucket.

#### Acceptance Criteria

1. WHEN a user clicks the download button with valid inputs, THEN the Backend Service SHALL fetch the file from the source URL
2. WHEN the Backend Service fetches the file, THEN the Backend Service SHALL stream the file directly to the specified S3 bucket without storing it locally
3. WHEN the file transfer begins, THEN the Backend Service SHALL extract the filename from the source URL and use it as the S3 object key
4. IF the Backend Service cannot connect to the source URL, THEN the Backend Service SHALL return an error message to the Web Application
5. IF the Backend Service cannot write to the S3 bucket, THEN the Backend Service SHALL return an error message to the Web Application

### Requirement 4

**User Story:** As a user, I want to see real-time progress of the download, so that I know how much of the transfer is complete.

#### Acceptance Criteria

1. WHEN the file transfer is in progress, THEN the Web Application SHALL display a progress bar showing the percentage complete
2. WHEN the Backend Service receives data from the source URL, THEN the Backend Service SHALL report progress updates to the Web Application
3. WHEN progress updates are received, THEN the Web Application SHALL update the progress bar in real-time
4. WHEN the transfer completes successfully, THEN the Web Application SHALL display a success message with the S3 location
5. IF the transfer fails, THEN the Web Application SHALL display an error message with failure details

### Requirement 5

**User Story:** As a user, I want the application to look like the AWS Console, so that it feels familiar and professional.

#### Acceptance Criteria

1. THE Web Application SHALL use the AWS Cloudscape Design System for UI components
2. THE Web Application SHALL use color schemes consistent with the AWS Console
3. THE Web Application SHALL use typography consistent with the AWS Console
4. THE Web Application SHALL use spacing and layout patterns consistent with the AWS Console
5. THE Web Application SHALL be responsive and work on different screen sizes

### Requirement 6

**User Story:** As a user, I want the application to handle authentication securely, so that only authorized users can upload to S3 buckets.

#### Acceptance Criteria

1. THE Backend Service SHALL authenticate with AWS using IAM credentials
2. THE Backend Service SHALL validate that it has permission to write to the specified S3 bucket before starting the transfer
3. IF the Backend Service lacks permissions, THEN the Backend Service SHALL return a clear error message to the user
4. THE Web Application SHALL not expose AWS credentials to the browser
5. THE Backend Service SHALL use secure credential management practices

### Requirement 7

**User Story:** As a user, I want to deploy the application to the cloud, so that I can access it from anywhere.

#### Acceptance Criteria

1. THE Web Application SHALL be deployable to a cloud hosting service
2. THE Backend Service SHALL be deployable to a long-running compute service capable of multi-hour transfers
3. THE deployment SHALL use infrastructure-as-code for reproducibility
4. THE deployment SHALL configure necessary AWS permissions for S3 access
5. THE deployment SHALL provide a public URL for accessing the Web Application
6. THE Backend Service SHALL use a persistent data store for tracking transfer state across service restarts

### Requirement 8

**User Story:** As a user, I want the application to handle large files efficiently, so that I can transfer files of various sizes without timeouts or memory issues.

#### Acceptance Criteria

1. WHEN transferring files, THEN the Backend Service SHALL use streaming to avoid loading entire files into memory
2. WHEN transferring large files, THEN the Backend Service SHALL support transfers that take hours or days to complete
3. WHEN transferring files, THEN the Backend Service SHALL handle network interruptions gracefully
4. IF a transfer is interrupted, THEN the Backend Service SHALL report the failure to the Web Application
5. THE Backend Service SHALL support files from 1GB up to 10TB in size
6. WHEN a transfer is initiated, THEN the Backend Service SHALL return immediately with a transfer ID without waiting for completion
7. WHEN a transfer is running, THEN the Backend Service SHALL persist progress state to allow recovery from failures
