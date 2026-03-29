# NeuroSync Website

A calm productivity companion for ADHD minds - landing page and marketing website.

## 🚀 Deployment to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI globally:
```bash
npm i -g vercel
```

2. Login to your Vercel account:
```bash
vercel login
```

3. Deploy the project:
```bash
vercel
```

4. For production deployment:
```bash
vercel --prod
```

### Option 2: Deploy via Vercel Dashboard

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "New Project"
4. Import your repository
5. Vercel will automatically detect the static site configuration
6. Click "Deploy"

### Option 3: Deploy via Vercel CLI (One-time)

```bash
npx vercel
```

## 📁 Project Structure

```
neurosync-website/
├── index.html          # Main HTML file
├── styles.css          # Main stylesheet
├── nymo-intro.css      # Additional styles
├── app.js              # JavaScript functionality
├── public/
│   └── apk.json        # APK download configuration
├── *.png, *.jpeg, *.jpg  # Image assets
├── vercel.json         # Vercel configuration
├── package.json        # Project metadata
└── .gitignore          # Git ignore rules
```

## 🛠️ Local Development

To run the project locally:

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The site will be available at `http://localhost:3000`

## ⚙️ Configuration

### Vercel Configuration

The `vercel.json` file includes:
- Static file serving configuration
- Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- Cache headers for optimal performance
- Route handling

### APK Download

The website supports dynamic APK download links. Configure the download URL in `public/apk.json`:

```json
{
  "apkUrl": "https://your-storage-url/neurosync.apk"
}
```

## 🎨 Features

- Responsive design for all devices
- Smooth scroll animations
- Interactive phone mockups
- Mobile-friendly navigation
- Email signup form
- Team showcase
- Feature comparison section

## 📝 License

MIT License - see LICENSE file for details

## 👥 Team

- Sujaya De Silva - Project Lead
- Chamath Silva - UI/UX Lead
- Jinalee Subasinghe - Full Stack Developer & Marketing Lead
- Nadil Karunarathna - Full-Stack Developer
- Ravindu Withana - Backend Developer
- Sandun Gunawardana - Full-Stack Developer
