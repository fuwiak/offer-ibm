package main

import (
	"fmt"
	"strings"
	"time"
)

type CommitInfo struct {
	Hash    string
	Date    string
	Subject string
}

type LogsBundle struct {
	Commits []CommitInfo
	Raw     string
	Text    string
	Err     string
}

func fetchCommits(cfg Config, n int) []CommitInfo {
	if n <= 0 {
		n = 8
	}
	script := fmt.Sprintf(`
SRC=%q/src
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" log -n %d --format='%%h|%%ci|%%s' 2>/dev/null || true
elif [ -f %q ]; then
  # READY: hash|date|subject
  awk -F'|' '{print $1"|"$2"|"$3}' %q 2>/dev/null || true
fi
`, cfg.RemoteRoot, n, cfg.ReadyFile, cfg.ReadyFile)

	out, err := sshRun(cfg, script)
	if err != nil || strings.TrimSpace(out) == "" {
		return nil
	}
	var commits []CommitInfo
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		if len(parts) < 3 {
			continue
		}
		commits = append(commits, CommitInfo{
			Hash:    parts[0],
			Date:    formatCommitDate(parts[1]),
			Subject: parts[2],
		})
	}
	return commits
}

func formatCommitDate(s string) string {
	s = strings.TrimSpace(s)
	layouts := []string{
		"2006-01-02 15:04:05 -0700",
		"2006-01-02 15:04:05 +0000",
		time.RFC3339,
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Local().Format("2006-01-02 15:04")
		}
	}
	if len(s) >= 16 {
		return s[:16]
	}
	return s
}

func fetchLogsBundle(cfg Config, tail int) LogsBundle {
	commits := fetchCommits(cfg, 8)
	out, err := sshRun(cfg, fmt.Sprintf(
		`if systemctl cat %q >/dev/null 2>&1; then journalctl -u %q -n %d --no-pager -o short-iso 2>&1; else docker logs --timestamps --tail %d %q 2>&1; fi`,
		cfg.Container+".service", cfg.Container+".service", tail, tail, cfg.Container,
	))
	b := LogsBundle{Commits: commits, Raw: out}
	if err != nil {
		b.Err = err.Error()
		b.Text = formatLogsView(commits, "ERR "+err.Error())
		return b
	}
	b.Text = formatLogsView(commits, formatDockerLogs(out))
	return b
}

func formatLogsView(commits []CommitInfo, body string) string {
	var b strings.Builder
	b.WriteString("── commits")
	if len(commits) == 0 {
		b.WriteString(" (none on server) ──\n")
	} else {
		b.WriteString(" ──\n")
		for _, c := range commits {
			b.WriteString(fmt.Sprintf("%s  %s  %s\n", c.Hash, c.Date, c.Subject))
		}
	}
	b.WriteString("\n── container logs ──\n")
	b.WriteString(strings.TrimRight(body, "\n"))
	b.WriteString("\n")
	return b.String()
}

func formatDockerLogs(raw string) string {
	lines := strings.Split(raw, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}
		out = append(out, formatDockerLogLine(line))
	}
	return strings.Join(out, "\n")
}

func formatDockerLogLine(line string) string {
	// docker --timestamps: 2024-01-02T15:04:05.123456789Z message
	if len(line) < 20 {
		return line
	}
	parts := strings.SplitN(line, " ", 2)
	if len(parts) < 2 {
		return line
	}
	ts := parts[0]
	msg := parts[1]
	if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
		return t.Local().Format("15:04:05") + "  " + msg
	}
	if t, err := time.Parse(time.RFC3339, ts); err == nil {
		return t.Local().Format("15:04:05") + "  " + msg
	}
	return line
}

func shortenTime(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999 -0700",
		"2006-01-02 15:04:05 -0700",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Local().Format("2006-01-02 15:04:05")
		}
	}
	if i := strings.Index(s, "."); i > 0 && i < 20 {
		return s[:i]
	}
	return s
}

func emptyDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func trunc(s string, n int) string {
	if n <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n-1]) + "…"
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
