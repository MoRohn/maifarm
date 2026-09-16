# MaiFarm Privacy Policy & Support URL Hosting Guide

## Required URLs for App Store

| URL | Purpose | Required By |
|-----|---------|-------------|
| https://maifarm.app/privacy | Privacy Policy | App Store Connect |
| https://maifarm.app/support | Support Page | App Store Connect |

---

## Option 1: GitHub Pages (Free, Recommended)

### Step 1: Create GitHub Repository

```bash
# Create a new repo for the website
# Go to github.com and create: maifarm/maifarm.github.io
# Or use an existing repo with GitHub Pages enabled
```

### Step 2: Create Privacy Policy Page

Create file `privacy.html` or `privacy/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - MaiFarm</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1 { color: #059669; }
        h2 { color: #333; margin-top: 30px; }
        .last-updated { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <!-- Content from PRIVACY_POLICY.md below -->
</body>
</html>
```

### Step 3: Create Support Page

Create file `support.html` or `support/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support - MaiFarm</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1 { color: #059669; }
        h2 { color: #333; margin-top: 30px; }
        .contact-box { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <!-- Content from SUPPORT_PAGE.md below -->
</body>
</html>
```

### Step 4: Enable GitHub Pages

1. Go to repository Settings
2. Navigate to Pages section
3. Select source: Deploy from branch
4. Select branch: main (or master)
5. Select folder: / (root) or /docs
6. Save

### Step 5: Configure Custom Domain (Optional)

1. Add CNAME file with content: `maifarm.app`
2. Configure DNS:
   ```
   Type: CNAME
   Name: @
   Value: maifarm.github.io
   ```

### Step 6: Verify URLs Work

```bash
# Test the URLs
curl -I https://maifarm.app/privacy
curl -I https://maifarm.app/support

# Should return 200 OK
```

---

## Option 2: Vercel (Free, Fast)

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Create Website Directory

```bash
mkdir maifarm-website
cd maifarm-website

# Create pages
touch index.html privacy.html support.html
```

### Step 3: Deploy

```bash
vercel
# Follow prompts
# Set custom domain: maifarm.app
```

---

## Option 3: Netlify (Free)

### Step 1: Create Site

1. Go to netlify.com
2. Drag and drop folder with HTML files
3. Or connect to GitHub repository

### Step 2: Configure Domain

1. Go to Site settings > Domain management
2. Add custom domain: maifarm.app
3. Configure DNS as instructed

---

## Option 4: Simple Static Hosting

### Using AWS S3 + CloudFront

```bash
# Create S3 bucket
aws s3 mb s3://maifarm-website

# Upload files
aws s3 sync ./website s3://maifarm-website --acl public-read

# Enable static website hosting
aws s3 website s3://maifarm-website --index-document index.html
```

### Using Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Initialize
firebase init hosting

# Deploy
firebase deploy --only hosting
```

---

## Option 5: In-App Only (Minimum Requirement)

If you cannot host external URLs, you can:

1. Use a free service like Notion public pages
2. Create Google Docs and share publicly
3. Use any free website builder (Wix, Squarespace free tier)

**Important**: Apple requires HTTPS URLs that are publicly accessible.

---

## URL Verification Checklist

Before submitting to App Store, verify:

- [ ] https://maifarm.app/privacy returns 200 OK
- [ ] https://maifarm.app/support returns 200 OK
- [ ] Pages render correctly on mobile
- [ ] HTTPS certificate is valid
- [ ] Content matches what's in the app
- [ ] No broken links on pages

### Test Commands

```bash
# Check privacy policy
curl -sI https://maifarm.app/privacy | head -5

# Check support page
curl -sI https://maifarm.app/support | head -5

# Check SSL certificate
echo | openssl s_client -servername maifarm.app -connect maifarm.app:443 2>/dev/null | openssl x509 -noout -dates
```

---

## DNS Configuration Reference

### For maifarm.app domain

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | (hosting IP) | 3600 |
| CNAME | www | maifarm.app | 3600 |
| CNAME | @ | (hosting domain) | 3600 |

### Example for GitHub Pages

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | maifarm.github.io |

---

## Temporary Solution (For Fast Submission)

If you need URLs immediately:

### Use Notion

1. Create Notion account
2. Create Privacy Policy page
3. Share publicly: Share > Publish to web
4. Copy URL (e.g., https://notion.so/maifarm-privacy-xxx)
5. Use this URL in App Store Connect

### Use Google Sites

1. Go to sites.google.com
2. Create new site
3. Add Privacy Policy and Support pages
4. Publish
5. Use the provided URL

**Note**: These work for initial submission but you should migrate to your own domain.

---

## Files to Create

The following files contain the actual content to host:

1. `PRIVACY_POLICY.html` - Full privacy policy HTML
2. `SUPPORT_PAGE.html` - Full support page HTML

See the next files in this directory for the complete content.

---

**Document Version**: 1.0
**Last Updated**: 2026-01-07
