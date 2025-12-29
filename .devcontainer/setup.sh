#!/bin/bash

echo "🚀 Setting up development environment..."

# Install Railway CLI
echo "📦 Installing Railway CLI..."
curl -fsSL https://railway.app/install.sh | sh

# Add Railway to PATH for current session
export PATH="$HOME/.railway/bin:$PATH"

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
cd /workspaces/python-webapp-merge/backend
pip install -r requirements.txt

# Install Node dependencies
echo "📦 Installing Node dependencies..."
cd /workspaces/python-webapp-merge
npm install

# Create data directories
echo "📁 Creating data directories..."
mkdir -p /workspaces/python-webapp-merge/data/vectordb
mkdir -p /workspaces/python-webapp-merge/data/uploads

# Create .env file if it doesn't exist
if [ ! -f /workspaces/python-webapp-merge/.env ]; then
  echo "📝 Creating .env file from template..."
  cp /workspaces/python-webapp-merge/.env.example /workspaces/python-webapp-merge/.env
fi

echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "  1. Run 'railway login' to authenticate"
echo "  2. Run 'railway link' to connect to your Railway project"
echo "  3. Run 'railway run npm run dev' to start frontend (or use the split terminal)"
echo "  4. Run 'railway run python backend/main.py' to start backend"
echo ""
