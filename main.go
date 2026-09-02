package main

import (
	"embed"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

// Embed static web application resources into the compiled binary.
//go:embed index.html css js i18n
var staticFS embed.FS

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

	// Serve the embedded static filesystem
	server := &http.Server{
		Handler: http.FileServer(http.FS(staticFS)),
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
