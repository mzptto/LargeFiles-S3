# S3 ZIP Downloader - User Guide

Welcome to the S3 ZIP Downloader! This guide will help you understand how to use the application to transfer ZIP files from the web directly to your AWS S3 buckets.

## Table of Contents

- [What is S3 ZIP Downloader?](#what-is-s3-zip-downloader)
- [Getting Started](#getting-started)
- [How to Use](#how-to-use)
- [Supported Files and Limits](#supported-files-and-limits)
- [Understanding the Interface](#understanding-the-interface)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)

## What is S3 ZIP Downloader?

S3 ZIP Downloader is a web application that allows you to download ZIP files from the internet directly to your AWS S3 storage buckets without having to download them to your computer first. The application uses an **asynchronous job processing model**, meaning transfers run in the background and you can check their progress at any time.

This is useful when:

- You want to save large files directly to cloud storage
- You have limited local disk space
- You want to automate file transfers to S3
- You're working with files that need to stay in the cloud
- You need to transfer very large files (up to 10TB) that take hours or days

**Key Benefits:**
- ✅ No local downloads required
- ✅ Handles files from 1GB up to 10TB
- ✅ Real-time progress tracking
- ✅ Memory efficient streaming
- ✅ Secure AWS integration
- ✅ Asynchronous processing (no need to keep browser open)
- ✅ Supports multi-hour and multi-day transfers

## Understanding Asynchronous Job Processing

The S3 ZIP Downloader uses an **asynchronous job processing model** to handle large file transfers efficiently. Here's how it works:

### How Traditional Downloads Work

In a traditional download:
1. You click "Download"
2. Your browser stays connected to the server
3. You must keep the browser tab open until complete
4. If you close the tab, the download stops

### How S3 ZIP Downloader Works

With asynchronous processing:
1. You submit a transfer job
2. The system returns a **Transfer ID** immediately
3. The transfer runs in the background on AWS infrastructure
4. You can close your browser - the transfer continues
5. You can check progress anytime using the Transfer ID
6. You receive the final status when you check back

### Key Advantages

**For Small Files (< 1GB):**
- Transfers complete quickly (minutes)
- You'll see progress in real-time
- Similar to traditional downloads

**For Large Files (> 10GB):**
- Transfers may take hours or days
- You don't need to keep your browser open
- The transfer continues even if your computer sleeps
- You can check progress periodically
- The system handles network interruptions and retries

**For Very Large Files (> 100GB):**
- Transfers run for extended periods (days)
- No timeout limits (up to 48 hours per attempt)
- Automatic retry on transient failures
- Progress saved in case of interruptions

### Transfer Lifecycle

```
1. PENDING → Job submitted, waiting to start
2. STARTING → Initializing transfer resources
3. IN_PROGRESS → Actively transferring data
4. COMPLETED → Transfer finished successfully
5. FAILED → Transfer encountered an error
```

### Checking Transfer Status

**While the browser is open:**
- Progress updates automatically every few seconds
- You see real-time percentage and status

**After closing the browser:**
- Your transfer continues running
- Return to the application anytime
- Enter your Transfer ID to check status (future feature)
- Or check AWS CloudWatch logs for detailed status

**Note:** Currently, the application shows progress for the active session. Future versions will support checking any transfer by ID.

## Getting Started

### Prerequisites

Before using the application, you need:

1. **Access to the Application**
   - The application URL (provided by your administrator)
   - Example: `https://xxxxxxxxxx.cloudfront.net`

2. **AWS S3 Bucket**
   - An existing S3 bucket where you want to store files
   - The bucket name (e.g., `my-company-files`)
   - Appropriate permissions configured by your AWS administrator

3. **Source File URL**
   - A direct HTTPS link to a ZIP file
   - The URL must end with `.zip`
   - The file must be publicly accessible or accessible with your credentials

### First Time Setup

No installation or setup is required! Simply open the application URL in your web browser.

**Supported Browsers:**
- Chrome (recommended)
- Firefox
- Safari
- Edge

## How to Use

### Step-by-Step Instructions

#### 1. Open the Application

Navigate to your application URL in a web browser.

#### 2. Enter the Source URL

In the **Source URL** field:
- Paste the HTTPS URL of the ZIP file you want to download
- The URL must start with `https://`
- The URL must end with `.zip`

**Example:**
```
https://example.com/files/archive.zip
```

**Valid URLs:**
- ✅ `https://example.com/data.zip`
- ✅ `https://cdn.example.com/files/backup-2024.zip`
- ✅ `https://downloads.example.com/archive.zip?token=abc123`

**Invalid URLs:**
- ❌ `http://example.com/data.zip` (not HTTPS)
- ❌ `https://example.com/data.tar.gz` (not a ZIP file)
- ❌ `ftp://example.com/data.zip` (wrong protocol)

#### 3. Enter the S3 Bucket Name

In the **S3 Bucket Name** field:
- Enter the name of your destination S3 bucket
- Use only lowercase letters, numbers, hyphens, and dots
- The bucket must already exist in AWS

**Example:**
```
my-company-files
```

**Valid Bucket Names:**
- ✅ `my-bucket`
- ✅ `company-files-2024`
- ✅ `data.backup.bucket`

**Invalid Bucket Names:**
- ❌ `My-Bucket` (contains uppercase)
- ❌ `my_bucket` (contains underscore)
- ❌ `ab` (too short, minimum 3 characters)

#### 4. (Optional) Enter a Key Prefix

In the **Key Prefix** field:
- Optionally specify a folder path within your bucket
- Leave empty to save files in the bucket root
- Use forward slashes for nested folders

**Examples:**
- `archives/` - saves to the "archives" folder
- `backups/2024/` - saves to nested folders
- Leave empty - saves to bucket root

#### 5. Click "Download to S3"

Once all fields are valid:
- The "Download to S3" button will become enabled
- Click the button to start the transfer

#### 6. Monitor Progress

Watch the progress bar as your file transfers:
- The percentage shows how much has been transferred
- The status updates in real-time
- Large files may take several minutes

#### 7. Transfer Complete

When the transfer finishes:
- A success message appears with the S3 location
- You can start a new transfer
- The file is now available in your S3 bucket

### Example Walkthrough

Let's transfer a sample ZIP file:

1. **Source URL:** `https://example.com/data/backup.zip`
2. **S3 Bucket:** `my-company-files`
3. **Key Prefix:** `backups/2024/`
4. Click "Download to S3"
5. Wait for progress to reach 100%
6. File is saved to: `s3://my-company-files/backups/2024/backup.zip`

## Supported Files and Limits

### File Types

**Supported:**
- ✅ ZIP files (`.zip` extension)

**Not Supported:**
- ❌ TAR files (`.tar`, `.tar.gz`)
- ❌ RAR files (`.rar`)
- ❌ 7-Zip files (`.7z`)
- ❌ Other archive formats

**Note:** The application validates the `.zip` extension but does not verify the actual file content. Ensure the source URL points to a valid ZIP file.

### File Size Limits

- **Minimum:** 1 GB (recommended minimum for this service)
- **Maximum:** 10 TB (10,737,418,240,000 bytes)

**Transfer Times (approximate):**
- 1 GB file: ~5-10 minutes
- 10 GB file: ~50-100 minutes
- 100 GB file: ~8-16 hours
- 1 TB file: ~3-7 days
- 10 TB file: ~30-70 days

*Actual times depend on source server speed and network conditions. The system supports transfers up to 48 hours per attempt.*

### URL Requirements

- Must use HTTPS protocol (HTTP is not supported)
- Must be publicly accessible or accessible with your credentials
- Must return a valid ZIP file
- Must provide Content-Length header (for progress tracking)

## Understanding the Interface

### Application Layout

The S3 ZIP Downloader interface is designed with simplicity and clarity in mind, following AWS Cloudscape Design System patterns:

**Main Components:**

1. **Header Section**
   - Application title: "S3 ZIP Downloader"
   - Brief description of the service
   - AWS-style branding and colors

2. **Input Form Section**
   - Three input fields (Source URL, S3 Bucket, Key Prefix)
   - Inline validation with error messages
   - Submit button (enabled only when inputs are valid)
   - Clear visual feedback for validation state

3. **Progress Section**
   - Progress bar showing percentage (0-100%)
   - Status indicator (Idle, In Progress, Success, Error)
   - Detailed status messages
   - S3 location on success
   - Error details on failure

4. **Footer Section** (optional)
   - Links to documentation
   - Version information
   - Support contact

### Visual Design

The interface uses AWS Cloudscape Design System, which provides:

- **Clean, professional appearance** matching AWS Console
- **Consistent spacing and typography**
- **Accessible color contrast** for readability
- **Responsive layout** that works on desktop, tablet, and mobile
- **Clear visual hierarchy** guiding users through the process

### Interface Screenshots

*Note: Screenshots show the actual application interface with AWS Cloudscape styling*

**Screenshot 1: Initial State**
```
┌─────────────────────────────────────────────────────┐
│  S3 ZIP Downloader                                  │
│  Transfer ZIP files from URLs directly to S3        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Source URL *                                       │
│  ┌───────────────────────────────────────────────┐ │
│  │ https://example.com/file.zip                  │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  S3 Bucket Name *                                   │
│  ┌───────────────────────────────────────────────┐ │
│  │ my-bucket                                     │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Key Prefix (optional)                              │
│  ┌───────────────────────────────────────────────┐ │
│  │ backups/2024/                                 │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [ Download to S3 ]  (button enabled)               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Screenshot 2: Validation Error**
```
┌─────────────────────────────────────────────────────┐
│  Source URL *                                       │
│  ┌───────────────────────────────────────────────┐ │
│  │ http://example.com/file.zip                   │ │
│  └───────────────────────────────────────────────┘ │
│  ⚠ Source URL must use HTTPS protocol              │
│                                                     │
│  [ Download to S3 ]  (button disabled)              │
└─────────────────────────────────────────────────────┘
```

**Screenshot 3: Transfer In Progress**
```
┌─────────────────────────────────────────────────────┐
│  Transfer Progress                                  │
│  ┌───────────────────────────────────────────────┐ │
│  │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│  │ 45% Complete                                  │ │
│  └───────────────────────────────────────────────┘ │
│  Status: In Progress                                │
│  Transferring file to S3...                         │
└─────────────────────────────────────────────────────┘
```

**Screenshot 4: Transfer Complete**
```
┌─────────────────────────────────────────────────────┐
│  Transfer Progress                                  │
│  ┌───────────────────────────────────────────────┐ │
│  │ ████████████████████████████████████████████ │ │
│  │ 100% Complete                                 │ │
│  └───────────────────────────────────────────────┘ │
│  Status: Success                                    │
│  ✓ File successfully uploaded to:                  │
│    s3://my-bucket/backups/2024/file.zip            │
└─────────────────────────────────────────────────────┘
```

**Screenshot 5: Transfer Failed**
```
┌─────────────────────────────────────────────────────┐
│  Transfer Progress                                  │
│  ┌───────────────────────────────────────────────┐ │
│  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │
│  │ 23% Complete                                  │ │
│  └───────────────────────────────────────────────┘ │
│  Status: Error                                      │
│  ✗ Transfer failed: Unable to connect to source    │
│    URL. Please verify the URL is accessible.       │
└─────────────────────────────────────────────────────┘
```

### Input Fields

#### Source URL Field
- **Purpose:** Specify the ZIP file to download
- **Validation:** Real-time validation as you type
- **Error Messages:** Shows specific validation errors
- **Required:** Yes

#### S3 Bucket Name Field
- **Purpose:** Specify where to save the file
- **Validation:** Checks AWS naming conventions
- **Error Messages:** Shows specific validation errors
- **Required:** Yes

#### Key Prefix Field
- **Purpose:** Organize files in folders
- **Validation:** Checks for valid S3 key format
- **Error Messages:** Shows if prefix is invalid
- **Required:** No (optional)

### Progress Indicator

The progress bar shows:
- **Percentage:** 0% to 100% complete
- **Status:** Current transfer state
  - "Idle" - No transfer in progress
  - "In Progress" - Transfer is active
  - "Success" - Transfer completed
  - "Error" - Transfer failed

### Status Messages

**Success Message:**
```
✓ File successfully uploaded to s3://my-bucket/path/file.zip
```

**Error Messages:**
```
✗ Unable to connect to source URL
✗ Access denied to S3 bucket
✗ Transfer interrupted
```

## FAQ

### General Questions

**Q: Do I need to install anything?**
A: No, it's a web application. Just open the URL in your browser.

**Q: Is my data secure?**
A: Yes. Files are transferred directly from the source to S3 using secure HTTPS connections. Your AWS credentials are never exposed to the browser.

**Q: Can I transfer multiple files at once?**
A: Currently, the application supports one file at a time. You can start another transfer after the first completes.

**Q: What happens if my internet connection drops?**
A: Your internet connection is only needed to submit the job and check progress. The actual transfer runs on AWS infrastructure, so it continues even if your connection drops.

**Q: Can I cancel a transfer in progress?**
A: Currently, there's no cancel button in the UI. The transfer will continue running on AWS. Contact your administrator to stop a running transfer via AWS Console.

**Q: Do I need to keep my browser open during the transfer?**
A: No! This is the key benefit of asynchronous processing. Once you submit the job, it runs on AWS infrastructure. You can close your browser, shut down your computer, and the transfer continues. Check back later to see the results.

**Q: How do I check on a transfer after closing my browser?**
A: Currently, progress is shown for the active session. For transfers that take hours or days, your administrator can check status in AWS CloudWatch logs or DynamoDB. Future versions will support checking any transfer by ID.

**Q: What happens if a transfer fails?**
A: The system automatically retries transient failures (network issues, temporary errors) up to 2 times. If it still fails, the error is recorded and you'll see it when you check the status.

**Q: Can transfers run for days?**
A: Yes! The system supports transfers up to 48 hours per attempt. For very large files (multiple TB), the transfer may take several days with automatic retries.

### File and URL Questions

**Q: Why must the URL use HTTPS?**
A: HTTPS ensures secure, encrypted connections. HTTP is not supported for security reasons.

**Q: Can I download password-protected ZIP files?**
A: The application downloads the ZIP file as-is. If the source URL is accessible, the file will be transferred. Password protection within the ZIP is preserved.

**Q: What if the URL requires authentication?**
A: If the URL requires authentication (like a token in the query string), include it in the URL. The application will use it when fetching the file.

**Q: Can I use shortened URLs (like bit.ly)?**
A: Yes, as long as the shortened URL redirects to a direct HTTPS ZIP file link.

### S3 and AWS Questions

**Q: What if my S3 bucket doesn't exist?**
A: The transfer will fail with an error message. Create the bucket in AWS first, then try again.

**Q: What permissions do I need on the S3 bucket?**
A: The application's AWS role needs `s3:PutObject` permission on your bucket. Contact your AWS administrator to configure this.

**Q: Can I use buckets in different AWS regions?**
A: Yes, the application works with buckets in any region.

**Q: Will this overwrite existing files?**
A: Yes, if a file with the same name exists at the destination, it will be overwritten.

**Q: How much does this cost?**
A: Costs depend on:
- S3 storage: ~$0.023 per GB per month
- Data transfer: ~$0.09 per GB
- Lambda execution: ~$0.20 per million requests
- Typical transfer of 100MB: less than $0.01

### Troubleshooting Questions

**Q: Why is the Download button disabled?**
A: Check that:
- Source URL is valid (HTTPS, ends with .zip)
- S3 bucket name is valid (lowercase, no underscores)
- All required fields are filled

**Q: Why did my transfer fail?**
A: Common reasons:
- Source URL is not accessible
- S3 bucket doesn't exist or lacks permissions
- File is larger than 5GB
- Network connection issues
- Source server is slow or timing out

**Q: The progress bar is stuck at 0%. What's wrong?**
A: This can happen if:
- The source server hasn't started sending data yet
- The source URL is very slow to respond
- There's a network issue
- Wait a minute, then refresh and try again

## Troubleshooting

### Error: "Invalid URL format"

**Cause:** The URL doesn't meet requirements

**Solution:**
- Ensure URL starts with `https://`
- Ensure URL ends with `.zip`
- Remove any spaces or special characters
- Try copying the URL again

### Error: "Invalid S3 bucket name"

**Cause:** Bucket name doesn't follow AWS naming rules

**Solution:**
- Use only lowercase letters, numbers, hyphens, and dots
- Ensure name is 3-63 characters long
- Remove underscores or uppercase letters
- Check for typos

### Error: "Unable to connect to source URL"

**Cause:** The source URL is not accessible

**Solution:**
- Verify the URL in a browser
- Check if the file still exists
- Ensure the URL is publicly accessible
- Check if authentication is required

### Error: "Access denied to S3 bucket"

**Cause:** The application lacks permission to write to the bucket

**Solution:**
- Verify the bucket name is correct
- Contact your AWS administrator to grant permissions
- Ensure the bucket exists in AWS
- Check if bucket policies block access

### Error: "Transfer interrupted"

**Cause:** Network connection was lost during transfer

**Solution:**
- Check your internet connection
- Try the transfer again
- For large files, ensure stable connection
- Contact support if problem persists

### Error: "File too large"

**Cause:** File exceeds 5GB limit

**Solution:**
- Use a smaller file
- Split the archive into multiple smaller files
- Use AWS CLI or SDK for very large files

### Progress Bar Not Updating

**Cause:** Source server not providing progress information

**Solution:**
- Wait a few moments - some servers are slow to start
- Check CloudWatch logs for backend errors
- Refresh the page and try again
- Verify source URL is accessible

### Transfer Takes Too Long

**Cause:** Large file or slow source server

**Solution:**
- Be patient - large files take time
- Check the source server's download speed
- Ensure stable internet connection
- Consider using smaller files

## Tips and Best Practices

1. **Test with Small Files First**
   - Try a small ZIP file to verify everything works
   - Then proceed with larger files

2. **Use Descriptive Key Prefixes**
   - Organize files with meaningful folder names
   - Example: `backups/2024-01/` or `archives/project-name/`

3. **Verify URLs Before Transferring**
   - Open the URL in a browser to confirm it downloads
   - Check the file size if possible

4. **Monitor Large Transfers**
   - Keep the browser tab open during transfers
   - Don't close the browser until complete

5. **Check S3 After Transfer**
   - Verify the file appears in your S3 bucket
   - Check the file size matches expectations

6. **Keep Bucket Names Handy**
   - Save frequently used bucket names for quick access
   - Use consistent naming conventions

## Getting Help

If you encounter issues not covered in this guide:

1. **Check Error Messages**
   - Read the error message carefully
   - Follow suggested solutions

2. **Review Logs**
   - Ask your administrator to check CloudWatch logs
   - Logs contain detailed error information

3. **Contact Support**
   - Provide the error message
   - Include the source URL (if not sensitive)
   - Mention the S3 bucket name
   - Describe what you were trying to do

4. **AWS Documentation**
   - [S3 Bucket Naming Rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html)
   - [S3 User Guide](https://docs.aws.amazon.com/s3/)

## Appendix: Technical Details

### How It Works

**Asynchronous Job Processing Flow:**

1. **Job Submission (< 1 second)**
   - You enter a source URL and S3 destination
   - The frontend validates your inputs
   - The backend creates a transfer job in DynamoDB
   - A unique Transfer ID is generated
   - AWS Step Functions workflow is started
   - You receive confirmation immediately

2. **Background Processing (minutes to days)**
   - AWS Step Functions launches an ECS Fargate container
   - The container runs independently on AWS infrastructure
   - The container fetches the file from the source URL
   - The file is streamed directly to S3 (not stored locally)
   - Progress updates are written to DynamoDB every 1% or 100MB
   - The container handles retries on network errors

3. **Progress Tracking (real-time)**
   - The frontend polls DynamoDB for status updates
   - You see real-time progress in the browser
   - Progress continues even if you close the browser
   - The transfer state is persisted in DynamoDB

4. **Completion (automatic)**
   - On success: Final status written to DynamoDB
   - On failure: Error details written to DynamoDB
   - The Fargate container stops automatically
   - You see the final result when you check back

**Key Technical Details:**
- **No Timeouts**: Fargate containers can run for 48 hours (vs 15 min for Lambda)
- **Streaming**: Memory usage stays constant regardless of file size
- **Multipart Upload**: Large files uploaded in chunks for reliability
- **Automatic Retries**: Transient failures retried up to 2 times
- **State Persistence**: Progress saved to survive interruptions

### Architecture

The application uses a modern, scalable architecture designed for large file transfers:

- **Frontend:** React web application with AWS Cloudscape UI (hosted on S3 + CloudFront)
- **API Layer:** AWS API Gateway + Lambda functions (job submission and progress queries)
- **Worker Layer:** AWS ECS Fargate containers (long-running file transfers)
- **Orchestration:** AWS Step Functions (workflow management)
- **State Storage:** AWS DynamoDB (transfer progress and status)
- **File Storage:** AWS S3 (destination for transferred files)
- **Container Registry:** AWS ECR (Docker images for workers)

**Why This Architecture?**
- **Scalability**: Handle multiple concurrent transfers
- **Reliability**: Automatic retries and error handling
- **No Timeouts**: Support multi-hour and multi-day transfers
- **Cost-Effective**: Pay only for active transfer time
- **Asynchronous**: Transfers run independently of user sessions

### Security

- All connections use HTTPS encryption
- AWS credentials are never exposed to the browser
- IAM roles provide secure AWS access
- Input validation prevents malicious inputs
- Rate limiting prevents abuse

### Performance

- Streaming architecture handles large files efficiently
- Memory usage stays constant regardless of file size
- Supports files up to 5GB
- Multipart upload for optimal performance
- Progress updates every 1% or 1MB

---

**Version:** 1.0  
**Last Updated:** 2024

For deployment and technical documentation, see [DEPLOYMENT.md](DEPLOYMENT.md)
