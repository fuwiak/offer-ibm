package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type CICDJob struct {
	Name       string
	Status     string
	Conclusion string
	StartedAt  string
	Completed  string
	URL        string
}

type CICDRun struct {
	ID           int64
	Title        string
	Status       string
	Conclusion   string
	Branch       string
	Event        string
	CreatedAt    string
	UpdatedAt    string
	URL          string
	HeadSha      string
	WorkflowName string
	Jobs         []CICDJob
}

type CICDSnapshot struct {
	Repo      string
	Workflow  string
	Runs      []CICDRun
	FetchedAt time.Time
	Err       string
}

func fetchCICD(cfg Config) CICDSnapshot {
	snap := CICDSnapshot{
		Repo:      cfg.GitHubRepo,
		Workflow:  cfg.GitHubWorkflow,
		FetchedAt: time.Now(),
	}

	if _, err := exec.LookPath("gh"); err != nil {
		snap.Err = "gh CLI not found — install GitHub CLI and run: gh auth login"
		return snap
	}

	args := []string{
		"run", "list",
		"--repo", cfg.GitHubRepo,
		"--workflow", cfg.GitHubWorkflow,
		"--limit", "8",
		"--json",
		"databaseId,displayTitle,status,conclusion,headBranch,event,createdAt,updatedAt,url,headSha,workflowName",
	}
	out, err := exec.Command("gh", args...).CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		snap.Err = "gh run list: " + msg
		return snap
	}

	var raw []struct {
		DatabaseID   int64  `json:"databaseId"`
		DisplayTitle string `json:"displayTitle"`
		Status       string `json:"status"`
		Conclusion   string `json:"conclusion"`
		HeadBranch   string `json:"headBranch"`
		Event        string `json:"event"`
		CreatedAt    string `json:"createdAt"`
		UpdatedAt    string `json:"updatedAt"`
		URL          string `json:"url"`
		HeadSha      string `json:"headSha"`
		WorkflowName string `json:"workflowName"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		snap.Err = "parse gh json: " + err.Error()
		return snap
	}

	runs := make([]CICDRun, 0, len(raw))
	for i, r := range raw {
		run := CICDRun{
			ID:           r.DatabaseID,
			Title:        r.DisplayTitle,
			Status:       r.Status,
			Conclusion:   r.Conclusion,
			Branch:       r.HeadBranch,
			Event:        r.Event,
			CreatedAt:    r.CreatedAt,
			UpdatedAt:    r.UpdatedAt,
			URL:          r.URL,
			HeadSha:      r.HeadSha,
			WorkflowName: r.WorkflowName,
		}
		// Enrich latest (or in-progress) run with jobs.
		if i == 0 || r.Status == "in_progress" || r.Status == "queued" || r.Status == "pending" {
			run.Jobs = fetchCICDJobs(cfg, r.DatabaseID)
		}
		runs = append(runs, run)
	}
	snap.Runs = runs
	return snap
}

func fetchCICDJobs(cfg Config, runID int64) []CICDJob {
	out, err := exec.Command(
		"gh", "run", "view", fmt.Sprintf("%d", runID),
		"--repo", cfg.GitHubRepo,
		"--json", "jobs",
	).CombinedOutput()
	if err != nil {
		return nil
	}
	var payload struct {
		Jobs []struct {
			Name        string `json:"name"`
			Status      string `json:"status"`
			Conclusion  string `json:"conclusion"`
			StartedAt   string `json:"startedAt"`
			CompletedAt string `json:"completedAt"`
			URL         string `json:"url"`
		} `json:"jobs"`
	}
	if err := json.Unmarshal(out, &payload); err != nil {
		return nil
	}
	jobs := make([]CICDJob, 0, len(payload.Jobs))
	for _, j := range payload.Jobs {
		jobs = append(jobs, CICDJob{
			Name:       j.Name,
			Status:     j.Status,
			Conclusion: j.Conclusion,
			StartedAt:  j.StartedAt,
			Completed:  j.CompletedAt,
			URL:        j.URL,
		})
	}
	return jobs
}

func cicdMark(status, conclusion string) string {
	s := strings.ToLower(status)
	c := strings.ToLower(conclusion)
	switch {
	case s == "in_progress" || s == "queued" || s == "pending" || s == "waiting":
		return "●"
	case c == "success":
		return "✓"
	case c == "failure", c == "timed_out", c == "startup_failure":
		return "✗"
	case c == "cancelled", c == "canceled":
		return "⊘"
	case c == "skipped":
		return "–"
	default:
		if s == "completed" && c == "" {
			return "·"
		}
		return "?"
	}
}

func cicdState(status, conclusion string) string {
	s := strings.ToLower(status)
	c := strings.ToLower(conclusion)
	if s != "completed" && s != "" {
		return s
	}
	if c != "" {
		return c
	}
	return s
}

func shortenISO(iso string) string {
	if iso == "" {
		return "—"
	}
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return iso
	}
	if t.IsZero() || t.Year() < 2000 {
		return "—"
	}
	return t.Local().Format("15:04:05 02-01")
}

func shortSHA(sha string) string {
	if len(sha) >= 7 {
		return sha[:7]
	}
	return sha
}

func renderCICD(s CICDSnapshot, cfg Config) string {
	var b strings.Builder
	b.WriteString("\n  GitHub Actions  ·  Selectel CI/CD\n")
	b.WriteString("  " + strings.Repeat("─", 46) + "\n\n")
	b.WriteString(fmt.Sprintf("  repo:      %s\n", emptyDash(s.Repo)))
	b.WriteString(fmt.Sprintf("  workflow:  %s\n", emptyDash(s.Workflow)))
	b.WriteString(fmt.Sprintf("  host:      %s@%s\n", cfg.User, cfg.Host))

	if s.Err != "" {
		b.WriteString(fmt.Sprintf("\n  ERR  %s\n", s.Err))
		b.WriteString("\n  tip: gh auth login && gh run list\n")
		return b.String()
	}
	if len(s.Runs) == 0 {
		b.WriteString("\n  no workflow runs yet\n")
		return b.String()
	}

	latest := s.Runs[0]
	b.WriteString("\n  Latest run\n")
	b.WriteString("  " + strings.Repeat("─", 46) + "\n")
	b.WriteString(fmt.Sprintf(
		"  %s %-10s  %s\n",
		cicdMark(latest.Status, latest.Conclusion),
		cicdState(latest.Status, latest.Conclusion),
		trunc(latest.Title, 42),
	))
	b.WriteString(fmt.Sprintf("  commit:    %s\n", emptyDash(shortSHA(latest.HeadSha))))
	b.WriteString(fmt.Sprintf("  branch:    %s · %s\n", emptyDash(latest.Branch), emptyDash(latest.Event)))
	b.WriteString(fmt.Sprintf("  started:   %s\n", shortenISO(latest.CreatedAt)))
	b.WriteString(fmt.Sprintf("  updated:   %s\n", shortenISO(latest.UpdatedAt)))
	if latest.URL != "" {
		b.WriteString(fmt.Sprintf("  url:       %s\n", latest.URL))
	}

	if len(latest.Jobs) > 0 {
		b.WriteString("\n  Jobs\n")
		b.WriteString("  " + strings.Repeat("─", 46) + "\n")
		for _, j := range latest.Jobs {
			b.WriteString(fmt.Sprintf(
				"  %s %-10s  %s\n",
				cicdMark(j.Status, j.Conclusion),
				cicdState(j.Status, j.Conclusion),
				trunc(j.Name, 40),
			))
			started := shortenISO(j.StartedAt)
			ended := shortenISO(j.Completed)
			if started != "—" {
				if ended == "—" {
					b.WriteString(fmt.Sprintf("             %s → …\n", started))
				} else {
					b.WriteString(fmt.Sprintf("             %s → %s\n", started, ended))
				}
			}
		}
	}

	b.WriteString("\n  Recent runs\n")
	b.WriteString("  " + strings.Repeat("─", 46) + "\n")
	for i, r := range s.Runs {
		if i == 0 {
			continue
		}
		b.WriteString(fmt.Sprintf(
			"  %s %-10s  %s  %s\n",
			cicdMark(r.Status, r.Conclusion),
			cicdState(r.Status, r.Conclusion),
			shortSHA(r.HeadSha),
			trunc(r.Title, 34),
		))
		b.WriteString(fmt.Sprintf("             %s · %s\n", shortenISO(r.CreatedAt), emptyDash(r.Event)))
	}

	b.WriteString(fmt.Sprintf("\n  fetched %s\n", s.FetchedAt.Format(time.RFC3339)))
	b.WriteString("\n  → push to main triggers Deploy Selectel Lainey\n")
	return b.String()
}
