# Vercel Deployment Guide for NeuroSync Website

## Quick Start

Your project is now ready for Vercel deployment! Follow these steps:

### Method 1: Deploy via Vercel Dashboard (Recommended for beginners)

1. **Create a Git Repository**
   - Push your code to GitHub, GitLab, or Bitbucket
   - Make sure to include all files: `index.html`, `styles.css`, `app.js`, `vercel.json`, `package.json`, `.gitignore`, and all image assets

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) and sign up/login
   - Click "New Project"
   - Import your Git repository
   - Vercel will automatically detect the configuration
   - Click "Deploy"
   - Your site will be live in seconds!

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   # For preview deployment
   vercel

   # For production deployment
   vercel --prod
   ```

### Method 3: One-time Deploy (No account needed initially)

```bash
npx vercel
```

This will guide you through the deployment process and create an account if needed.

## What's Been Configured

### 1. `vercel.json`
- Static file serving configuration
- Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- Cache headers for images, CSS, and JS files (1 year cache)
- Route handling for all files

### 2. `package.json`
- Project metadata
- Development scripts for local testing
- Dependencies for local development server

### 3. `.gitignore`
- Excludes unnecessary files from deployment
- Prevents node_modules, .env files, and IDE files from being deployed

### 4. `index.html`
- Removed server-side include directive (not supported on Vercel)
- All assets use relative paths (./) for proper deployment

## Post-Deployment

### Custom Domain (Optional)
1. Go to your project dashboard on Vercel
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow Vercel's instructions to update DNS records

### Environment Variables (If needed)
1. Go to project dashboard
2. Click "Settings" → "Environment Variables"
3. Add any required variables

### Automatic Deployments
- Every push to your main branch will trigger a new deployment
- Pull requests will create preview deployments

## Troubleshooting

### Images not loading?
- All image paths use relative paths (./)
- Make sure all images are in the root directory
- Check that file names match exactly (case-sensitive)

### APK download not working?
- The `public/apk.json` file contains the APK URL
- Update the URL in `public/apk.json` if needed:
  ```json
  {
    "apkUrl": "https://your-new-url.apk"
  }
  ```

### Build errors?
- This is a static site, no build step is required
- If you see errors, check that all files are present
- Verify `vercel.json` syntax is correct

## Performance Optimization

The deployment includes:
- ✅ Static file caching (1 year for assets)
- ✅ Security headers
- ✅ Optimized image delivery
- ✅ CDN distribution worldwide
- ✅ Automatic HTTPS

## Support

For Vercel-specific issues, visit:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Support](https://vercel.com/support)

For project-specific issues, contact the NeuroSync team.
