package main

import (
	"fmt"
	"strings"
	"time"
)

// ShopDB retrieval metrics — continuously collected by
// server/utils/offerKp/searchMetrics.js on every matchInquiryLine call
// (storage/metrics/shopdb-search.jsonl), aggregated remotely by
// scripts/report-shopdb-metrics.cjs. This tab shows that report, not a
// one-off golden-set snapshot (see scripts/measure-shopdb-search-quality.cjs
// for that).

type MetricsSnapshot struct {
	Text      string
	Hours     int
	FetchedAt time.Time
	Err       string
}

func fetchMetrics(cfg Config, hours int) MetricsSnapshot {
	if hours <= 0 {
		hours = 24
	}
	snap := MetricsSnapshot{Hours: hours, FetchedAt: time.Now()}
	out, err := sshRun(cfg, fmt.Sprintf(
		`cd %q && node scripts/report-shopdb-metrics.cjs --hours %d 2>&1 || echo '(report-shopdb-metrics.cjs failed or not deployed yet — redeploy to pick it up)'`,
		cfg.RemoteApp, hours,
	))
	if err != nil {
		snap.Err = err.Error()
	}
	snap.Text = out
	return snap
}

func renderMetrics(s MetricsSnapshot, cfg Config) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("\n  ShopDB retrieval metrics · last %dh · %s@%s\n", s.Hours, cfg.User, cfg.Host))
	b.WriteString("  " + strings.Repeat("─", 46) + "\n\n")
	if strings.TrimSpace(s.Text) == "" {
		if s.Err != "" {
			b.WriteString("  ERR " + s.Err + "\n")
		} else {
			b.WriteString("  (no output)\n")
		}
		return b.String()
	}
	for _, line := range strings.Split(strings.TrimRight(s.Text, "\n"), "\n") {
		b.WriteString("  " + line + "\n")
	}
	b.WriteString(fmt.Sprintf("\n  fetched %s\n", s.FetchedAt.Format(time.RFC3339)))
	return b.String()
}
