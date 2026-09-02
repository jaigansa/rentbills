#!/usr/bin/env bash
set -e

# Target output directory
DIST_DIR="./dist"
mkdir -p "$DIST_DIR"

# Strip debugging symbol tables (-s -w) to minimize binary size
LDFLAGS="-s -w"

BUILD_LINUX_ONLY=false

# Parse command line flags
if [ "$#" -eq 0 ]; then
  # Default to linux-only build if explicitly requested or specified
  BUILD_LINUX_ONLY=true
else
  for arg in "$@"; do
    case $arg in
      --linux-build|--linux)
        BUILD_LINUX_ONLY=true
        shift
        ;;
      --all)
        BUILD_LINUX_ONLY=false
        shift
        ;;
    esac
  done
fi

echo "=================================================="
if [ "$BUILD_LINUX_ONLY" = true ]; then
  echo "         Building RentBill Pro (Linux Only)       "
else
  echo "    Building RentBill Pro Cross-Platform Binaries "
fi
echo "=================================================="

# 1. Linux 64-bit (x86_64)
echo "--> Compiling for Linux (x86_64 / amd64)..."
GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-linux-amd64" main.go

# 2. Linux ARM64
echo "--> Compiling for Linux (ARM64)..."
GOOS=linux GOARCH=arm64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-linux-arm64" main.go

if [ "$BUILD_LINUX_ONLY" = false ]; then
  # Windows 64-bit (.exe)
  echo "--> Compiling for Windows (x86_64)..."
  GOOS=windows GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-windows-amd64.exe" main.go

  # macOS Apple Silicon (ARM64)
  echo "--> Compiling for macOS (Apple Silicon ARM64)..."
  GOOS=darwin GOARCH=arm64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-darwin-arm64" main.go

  # macOS Intel (AMD64)
  echo "--> Compiling for macOS (Intel x86_64)..."
  GOOS=darwin GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-darwin-amd64" main.go
fi

echo ""
echo "=================================================="
echo " Build Completed Successfully!                    "
echo " Binary outputs generated in '$DIST_DIR/':       "
echo "=================================================="
ls -lh "$DIST_DIR"
