package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type HealthResult struct {
	Name       string
	URL        string
	OK         bool
	StatusCode int
	Body       string
	Latency    time.Duration
	Err        string
}

func probeHealth(name, url string) HealthResult {
	start := time.Now()
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return HealthResult{Name: name, URL: url, Err: err.Error()}
	}
	req.Header.Set("User-Agent", "offerkp-ops/1.0")
	resp, err := client.Do(req)
	lat := time.Since(start)
	if err != nil {
		return HealthResult{Name: name, URL: url, Latency: lat, Err: err.Error()}
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
	body := strings.TrimSpace(string(b))
	ok := resp.StatusCode == 200
	bodyLower := strings.ToLower(body)
	// Prefer explicit ping JSON when present.
	if strings.Contains(body, `"online":true`) || strings.Contains(body, `"online": true`) ||
		body == "ok" || body == "OK" {
		ok = resp.StatusCode == 200
	} else if strings.Contains(bodyLower, "<!doctype html>") || strings.Contains(bodyLower, "<html") {
		// SPA shell means the edge is up (nginx/node serving UI) — count as soft OK.
		ok = resp.StatusCode == 200 && (name == "public" || name == "http-ip" || name == "app-port")
	}
	return HealthResult{
		Name:       name,
		URL:        url,
		OK:         ok,
		StatusCode: resp.StatusCode,
		Body:       body,
		Latency:    lat,
	}
}

func probeAllHealth(cfg Config) []HealthResult {
	path := cfg.HealthPath
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	targets := []struct {
		name string
		url  string
	}{
		{"public", strings.TrimRight(cfg.PublicURL, "/") + path},
		{"http-ip", strings.TrimRight(cfg.PublicIP, "/") + path},
		{"app-port", fmt.Sprintf("http://%s:%s%s", cfg.Host, cfg.AppPort, path)},
	}
	out := make([]HealthResult, 0, len(targets))
	for _, t := range targets {
		out = append(out, probeHealth(t.name, t.url))
	}
	return out
}

func formatHealth(results []HealthResult) string {
	var b strings.Builder
	b.WriteString("Network › Healthcheck (Selectel Lainey)\n")
	b.WriteString(strings.Repeat("─", 44) + "\n")
	for _, r := range results {
		state := "FAIL"
		if r.OK {
			state = "PASS"
		}
		b.WriteString(fmt.Sprintf("%-8s %s\n", state, r.Name))
		b.WriteString(fmt.Sprintf("  url:     %s\n", r.URL))
		if r.Err != "" {
			b.WriteString(fmt.Sprintf("  error:   %s\n", r.Err))
		} else {
			b.WriteString(fmt.Sprintf("  status:  %d\n", r.StatusCode))
			b.WriteString(fmt.Sprintf("  body:    %q\n", trunc(r.Body, 80)))
			b.WriteString(fmt.Sprintf("  latency: %s\n", r.Latency.Round(time.Millisecond)))
		}
		b.WriteString("\n")
	}
	return strings.TrimRight(b.String(), "\n")
}
