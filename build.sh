#!/usr/bin/env bash
set -e

DIST_DIR="./dist"
LDFLAGS="-s -w"

usage() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --linux     Build Linux binaries only"
  echo "  --all       Build all platform binaries"
  echo "  --help      Show this help message"
  echo ""
  echo "Default: Builds Linux binaries only"
}

build_linux_amd64() {
  echo "--> Compiling for Linux (x86_64 / amd64)..."
  GOOS=linux GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-linux-amd64" main.go
}

build_linux_arm64() {
  echo "--> Compiling for Linux (ARM64)..."
  GOOS=linux GOARCH=arm64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-linux-arm64" main.go
}

build_windows_amd64() {
  echo "--> Compiling for Windows (x86_64)..."
  GOOS=windows GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-windows-amd64.exe" main.go
}

build_darwin_arm64() {
  echo "--> Compiling for macOS (Apple Silicon ARM64)..."
  GOOS=darwin GOARCH=arm64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-darwin-arm64" main.go
}

build_darwin_amd64() {
  echo "--> Compiling for macOS (Intel x86_64)..."
  GOOS=darwin GOARCH=amd64 go build -ldflags="$LDFLAGS" -o "$DIST_DIR/rentbill-darwin-amd64" main.go
}

build_linux() {
  build_linux_amd64
  build_linux_arm64
}

build_all() {
  build_linux
  build_windows_amd64
  build_darwin_arm64
  build_darwin_amd64
}

BUILD_MODE="linux"

while [ "$#" -gt 0 ]; do
  case $1 in
    --linux)
      BUILD_MODE="linux"
      ;;
    --all)
      BUILD_MODE="all"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

mkdir -p "$DIST_DIR"

echo "=================================================="
if [ "$BUILD_MODE" = "linux" ]; then
  echo "         Building RentBill Pro (Linux Only)       "
else
  echo "    Building RentBill Pro Cross-Platform Binaries "
fi
echo "=================================================="

case $BUILD_MODE in
  linux) build_linux ;;
  all)   build_all ;;
esac

echo ""
echo "=================================================="
echo " Build Completed Successfully!                    "
echo " Binary outputs generated in '$DIST_DIR/':       "
echo "=================================================="
ls -lh "$DIST_DIR"
