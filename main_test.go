package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSpaHandlerAndMimeTypes(t *testing.T) {
	sub, err := fs.Sub(staticFS, ".")
	if err != nil {
		t.Fatalf("Failed to prepare FS: %v", err)
	}

	handler := &spaHandler{fileServer: http.FileServer(http.FS(sub))}

	tests := []struct {
		name                string
		path                string
		expectedStatus      int
		expectedContentType string
	}{
		{
			name:                "Root returns index.html (text/html)",
			path:                "/",
			expectedStatus:      http.StatusOK,
			expectedContentType: "text/html",
		},
		{
			name:                "Standalone receipt.html returns text/html",
			path:                "/receipt.html",
			expectedStatus:      http.StatusOK,
			expectedContentType: "text/html",
		},
		{
			name:                "Standalone paid.html payment receipt returns text/html",
			path:                "/paid.html",
			expectedStatus:      http.StatusOK,
			expectedContentType: "text/html",
		},
		{
			name:                "Layout auth component returns text/html",
			path:                "/layout/auth.html",
			expectedStatus:      http.StatusOK,
			expectedContentType: "text/html",
		},
		{
			name:                "main.js returns application/javascript",
			path:                "/js/main.js",
			expectedStatus:      http.StatusOK,
			expectedContentType: "application/javascript",
		},
		{
			name:                "app.css returns text/css",
			path:                "/css/app.css",
			expectedStatus:      http.StatusOK,
			expectedContentType: "text/css",
		},
		{
			name:                "SPA fallback for unknown path",
			path:                "/dashboard/rentals",
			expectedStatus:      http.StatusOK,
			expectedContentType: "text/html",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.path, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tc.expectedStatus {
				t.Errorf("Expected status %d, got %d", tc.expectedStatus, w.Code)
			}

			contentType := w.Header().Get("Content-Type")
			if !strings.Contains(contentType, tc.expectedContentType) {
				t.Errorf("Expected Content-Type containing %q, got %q", tc.expectedContentType, contentType)
			}
		})
	}
}
