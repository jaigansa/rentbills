package main

import (
	"embed"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// Embed static web application resources into the compiled binary.
//go:embed index.html receipt.html paid.html layout css js i18n
var staticFS embed.FS

func init() {
	// Explicitly register standard MIME types (especially critical on Windows where registry may map .js to text/plain or omit it)
	_ = mime.AddExtensionType(".js", "application/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".mjs", "application/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
	_ = mime.AddExtensionType(".json", "application/json; charset=utf-8")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".html", "text/html; charset=utf-8")
	_ = mime.AddExtensionType(".png", "image/png")
	_ = mime.AddExtensionType(".jpg", "image/jpeg")
	_ = mime.AddExtensionType(".jpeg", "image/jpeg")
	_ = mime.AddExtensionType(".webp", "image/webp")
}

// spaHandler wraps the embedded filesystem and falls back to index.html
// for any path that does not match a real file, enabling client-side routing
// and Supabase auth redirect callbacks.
type spaHandler struct {
	fileServer http.Handler
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// io/fs requires clean, unrooted paths (no leading slash)
	cleanPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if cleanPath == "" || cleanPath == "." {
		cleanPath = "index.html"
	}

	// Verify if the requested file exists and is not a directory
	stat, err := fs.Stat(staticFS, cleanPath)
	if err != nil || stat.IsDir() {
		// File not found or is a directory — fallback to index.html for SPA client-side routing
		r.URL.Path = "/"
		h.fileServer.ServeHTTP(w, r)
		return
	}

	h.fileServer.ServeHTTP(w, r)
}

func main() {
	// Bind to an available loopback port (port 0 lets OS select a free port)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		// Fallback to standard 8080 if dynamic port binding fails
		listener, err = net.Listen("tcp", "127.0.0.1:8080")
		if err != nil {
			fmt.Printf("Error: Unable to start local web server: %v\n", err)
			os.Exit(1)
		}
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	fmt.Println("==================================================")
	fmt.Println("         RentBill Pro - Portable Edition          ")
	fmt.Println("==================================================")
	fmt.Printf(" Server running at: %s\n", url)
	fmt.Println(" Press Ctrl+C in this terminal window to exit.")
	fmt.Println("==================================================")

	// Launch browser automatically in a background goroutine
	go func() {
		time.Sleep(150 * time.Millisecond)
		openBrowser(url)
	}()

	// Handle graceful shutdown on Ctrl+C or kill signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\nShutting down RentBill Pro server...")
		os.Exit(0)
	}()

	// Strip the root prefix so files are served from the FS root
	sub, err := fs.Sub(staticFS, ".")
	if err != nil {
		fmt.Printf("Error: Unable to prepare embedded filesystem: %v\n", err)
		os.Exit(1)
	}

	// Serve with SPA fallback for auth redirects and client-side routing
	server := &http.Server{
		Handler: &spaHandler{fileServer: http.FileServer(http.FS(sub))},
	}

	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		fmt.Printf("Server error: %v\n", err)
	}
}

// openBrowser launches the OS default web browser pointing to url
func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	}
	if err != nil {
		fmt.Printf("Notice: Could not automatically open browser: %v\n", err)
		fmt.Printf("Please open your browser manually and visit: %s\n", url)
	}
}
