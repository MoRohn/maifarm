#!/bin/bash
# MaiFarm Website Deployment Script
# Deploy privacy policy and support pages

set -e

echo "========================================"
echo "MaiFarm Website Deployment"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "index.html" ] || [ ! -f "privacy.html" ] || [ ! -f "support.html" ]; then
    echo "Error: Run this script from the ios/web directory"
    echo "Usage: cd /path/to/maifarm/ios/web && ./deploy.sh"
    exit 1
fi

echo ""
echo "Choose deployment method:"
echo "1) GitHub Pages (recommended)"
echo "2) Vercel"
echo "3) Netlify"
echo "4) Local test server"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "GitHub Pages Deployment"
        echo "========================"
        echo ""
        echo "Step 1: Create a GitHub repository"
        echo "  - Go to github.com/new"
        echo "  - Name it: maifarm.github.io (or any name)"
        echo "  - Make it public"
        echo ""
        echo "Step 2: Push these files"
        echo "  git init"
        echo "  git add ."
        echo "  git commit -m 'Add privacy policy and support pages'"
        echo "  git remote add origin https://github.com/YOUR_USERNAME/maifarm.github.io.git"
        echo "  git push -u origin main"
        echo ""
        echo "Step 3: Enable GitHub Pages"
        echo "  - Go to repository Settings > Pages"
        echo "  - Source: Deploy from branch"
        echo "  - Branch: main"
        echo "  - Folder: / (root)"
        echo "  - Save"
        echo ""
        echo "Step 4: (Optional) Add custom domain"
        echo "  - In Pages settings, add: maifarm.app"
        echo "  - Create CNAME file with content: maifarm.app"
        echo "  - Configure DNS at your domain registrar"
        echo ""
        echo "Your URLs will be:"
        echo "  https://YOUR_USERNAME.github.io/privacy.html"
        echo "  https://YOUR_USERNAME.github.io/support.html"
        echo ""
        echo "Or with custom domain:"
        echo "  https://maifarm.app/privacy"
        echo "  https://maifarm.app/support"
        ;;
    2)
        echo ""
        echo "Vercel Deployment"
        echo "================="
        echo ""
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm i -g vercel
        fi
        echo "Deploying to Vercel..."
        vercel --prod
        echo ""
        echo "To add custom domain:"
        echo "  vercel domains add maifarm.app"
        ;;
    3)
        echo ""
        echo "Netlify Deployment"
        echo "=================="
        echo ""
        if ! command -v netlify &> /dev/null; then
            echo "Installing Netlify CLI..."
            npm i -g netlify-cli
        fi
        echo "Deploying to Netlify..."
        netlify deploy --prod --dir=.
        echo ""
        echo "To add custom domain, go to Netlify dashboard > Domain settings"
        ;;
    4)
        echo ""
        echo "Starting local test server..."
        echo "URLs available at:"
        echo "  http://localhost:8000/"
        echo "  http://localhost:8000/privacy.html"
        echo "  http://localhost:8000/support.html"
        echo ""
        echo "Press Ctrl+C to stop"
        echo ""
        python3 -m http.server 8000
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
