#!/bin/bash

# =============================================================================
# Setup React for PPR Demo
# =============================================================================
#
# This script builds React from source with the experimental channel
# (which includes React.unstable_postpone) and links it to the demo via yalc.
#
# Usage:
#   ./scripts/setup-react.sh /path/to/react/repo
#
# Requirements:
#   - Node.js 20+ (for building React)
#   - yarn (will be installed globally if not present)
#   - yalc (will be installed globally if not present)
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide the path to the React repository${NC}"
    echo ""
    echo "Usage: $0 /path/to/react/repo"
    echo ""
    echo "Example:"
    echo "  $0 /mnt/ssd/open-source/react/react"
    echo ""
    echo "If you don't have React cloned yet:"
    echo "  git clone https://github.com/facebook/react.git"
    echo "  $0 ./react"
    exit 1
fi

REACT_REPO="$1"

# Verify React repo exists
if [ ! -d "$REACT_REPO" ]; then
    echo -e "${RED}Error: Directory not found: $REACT_REPO${NC}"
    exit 1
fi

if [ ! -f "$REACT_REPO/package.json" ]; then
    echo -e "${RED}Error: Not a valid React repository (no package.json found)${NC}"
    exit 1
fi

# Check if it's actually the React repo
if ! grep -q '"name": "react-monorepo"' "$REACT_REPO/package.json" 2>/dev/null; then
    echo -e "${YELLOW}Warning: This doesn't appear to be the React monorepo${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE} Setting up React for PPR Demo${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "React repo:  ${GREEN}$REACT_REPO${NC}"
echo -e "Demo dir:    ${GREEN}$DEMO_DIR${NC}"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ]; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}Warning: Node.js 20+ is recommended for building React${NC}"
    echo -e "Current version: $(node -v)"
    echo ""

    # Try to use nvm if available
    if [ -f "$HOME/.nvm/nvm.sh" ]; then
        echo -e "${BLUE}Attempting to use nvm to switch to Node 20...${NC}"
        source "$HOME/.nvm/nvm.sh"
        nvm use 20 2>/dev/null || nvm install 20
        echo ""
    else
        read -p "Continue with current Node version? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

echo -e "${GREEN}Using Node.js $(node -v)${NC}"
echo ""

# Check/install yarn
if ! command -v yarn &> /dev/null; then
    echo -e "${YELLOW}Installing yarn globally...${NC}"
    npm install -g yarn
fi

# Check/install yalc
if ! command -v yalc &> /dev/null; then
    echo -e "${YELLOW}Installing yalc globally...${NC}"
    npm install -g yalc
fi

# Step 1: Checkout the right version of React
echo -e "${BLUE}Step 1: Checking React version...${NC}"
cd "$REACT_REPO"

# Check if we're on a version that has unstable_postpone
CURRENT_REF=$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)
echo -e "Current ref: ${GREEN}$CURRENT_REF${NC}"

# Check if unstable_postpone exists in experimental exports
if ! grep -q "unstable_postpone" packages/react/index.experimental.js 2>/dev/null; then
    echo -e "${YELLOW}unstable_postpone not found in current version${NC}"
    echo -e "${BLUE}Checking out v19.2.3 (latest stable with postpone support)...${NC}"
    git fetch --tags 2>/dev/null || true
    git checkout v19.2.3
    echo ""
fi

# Verify postpone is available
if grep -q "unstable_postpone" packages/react/index.experimental.js 2>/dev/null; then
    echo -e "${GREEN}✓ unstable_postpone is available in this version${NC}"
else
    echo -e "${RED}Error: unstable_postpone not found. Please use React v19.0.0 - v19.2.3${NC}"
    exit 1
fi
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}Step 2: Installing React dependencies...${NC}"
yarn install
echo ""

# Step 3: Build React with experimental channel
echo -e "${BLUE}Step 3: Building React with experimental channel...${NC}"
echo -e "${YELLOW}This may take a few minutes...${NC}"
echo ""

RELEASE_CHANNEL=experimental yarn build \
    react/index,react-dom/index,react-dom-server.node,react-dom-server-legacy.node,scheduler \
    --type=NODE

echo ""
echo -e "${GREEN}✓ React build complete${NC}"
echo ""

# Step 4: Verify the build
echo -e "${BLUE}Step 4: Verifying build...${NC}"
BUILD_DIR="$REACT_REPO/build/oss-experimental"

if [ ! -d "$BUILD_DIR/react" ]; then
    echo -e "${RED}Error: Build output not found at $BUILD_DIR${NC}"
    exit 1
fi

# Check that unstable_postpone is exported
if node -e "const R = require('$BUILD_DIR/react'); if(typeof R.unstable_postpone !== 'function') process.exit(1)"; then
    REACT_VERSION=$(node -e "console.log(require('$BUILD_DIR/react').version)")
    echo -e "${GREEN}✓ React $REACT_VERSION built successfully with unstable_postpone${NC}"
else
    echo -e "${RED}Error: unstable_postpone not found in build output${NC}"
    exit 1
fi
echo ""

# Step 5: Publish via yalc
echo -e "${BLUE}Step 5: Publishing packages via yalc...${NC}"

cd "$BUILD_DIR/react"
yalc publish
echo -e "${GREEN}✓ Published react${NC}"

cd "$BUILD_DIR/react-dom"
yalc publish
echo -e "${GREEN}✓ Published react-dom${NC}"

cd "$BUILD_DIR/scheduler"
yalc publish
echo -e "${GREEN}✓ Published scheduler${NC}"

echo ""

# Step 6: Link to demo project
echo -e "${BLUE}Step 6: Linking packages to demo project...${NC}"
cd "$DEMO_DIR"

yalc add react
yalc add react-dom
yalc add scheduler

echo ""
echo -e "${GREEN}✓ Packages linked to demo${NC}"
echo ""

# Step 7: Verify installation
echo -e "${BLUE}Step 7: Verifying installation...${NC}"
INSTALLED_VERSION=$(node -e "console.log(require('react').version)" 2>/dev/null)
HAS_POSTPONE=$(node -e "console.log(typeof require('react').unstable_postpone)" 2>/dev/null)

echo -e "Installed React version: ${GREEN}$INSTALLED_VERSION${NC}"
echo -e "unstable_postpone:       ${GREEN}$HAS_POSTPONE${NC}"
echo ""

if [ "$HAS_POSTPONE" = "function" ]; then
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${GREEN} Setup Complete!${NC}"
    echo -e "${GREEN}============================================================${NC}"
    echo ""
    echo -e "React ${GREEN}$INSTALLED_VERSION${NC} is now linked to the demo."
    echo ""
    echo -e "Next steps:"
    echo -e "  1. Build the demo:  ${BLUE}node src/build.js${NC}"
    echo -e "  2. Start server:    ${BLUE}node src/server.js${NC}"
    echo -e "  3. Open browser:    ${BLUE}http://localhost:3000${NC}"
    echo ""
else
    echo -e "${RED}Error: Setup verification failed${NC}"
    exit 1
fi
