package main

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	cfg := loadConfig()
	args := os.Args[1:]
	if len(args) == 0 {
		runTUI(cfg, modeStatus)
		return
	}

	plain := hasPlainFlag(args)
	cmd := args[0]
	rest := stripPlainFlag(args[1:])

	switch cmd {
	case "tui", "ui", "dashboard":
		runTUI(cfg, modeStatus)
	case "status", "st":
		if plain {
			printStatus(cfg)
			return
		}
		runTUI(cfg, modeStatus)
	case "health", "hc", "check":
		if plain {
			printHealth(cfg)
			return
		}
		runTUI(cfg, modeHealth)
	case "logs", "log":
		if plain {
			runLogsPlain(cfg, rest)
			return
		}
		runTUI(cfg, modeLogs)
	case "build", "deploy-log":
		if plain {
			printBuildPlain(cfg, rest)
			return
		}
		runTUI(cfg, modeBuild)
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n\n", cmd)
		printUsage()
		os.Exit(2)
	}
}

func hasPlainFlag(args []string) bool {
	for _, a := range args {
		if a == "--plain" || a == "-p" {
			return true
		}
	}
	return false
}

func stripPlainFlag(args []string) []string {
	out := make([]string, 0, len(args))
	for _, a := range args {
		if a == "--plain" || a == "-p" {
			continue
		}
		out = append(out, a)
	}
	return out
}

func runTUI(cfg Config, start mode) {
	m := newModel(cfg, start)
	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "offerkp-ops: %v\n", err)
		os.Exit(1)
	}
}

func printStatus(cfg Config) {
	snap := fetchStatus(cfg)
	fmt.Println(strings.TrimSpace(renderStatus(snap, cfg)))
	fail := false
	if !snap.Container.Running || snap.Container.Err != "" {
		fail = true
	}
	for _, h := range snap.Health {
		if !h.OK {
			fail = true
			break
		}
	}
	if fail {
		os.Exit(1)
	}
}

func printHealth(cfg Config) {
	results := probeAllHealth(cfg)
	fmt.Println(formatHealth(results))
	for _, r := range results {
		if !r.OK {
			os.Exit(1)
		}
	}
}

func runLogsPlain(cfg Config, args []string) {
	follow := false
	tail := 100
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-f", "--follow":
			follow = true
		case "--tail":
			if i+1 < len(args) {
				fmt.Sscanf(args[i+1], "%d", &tail)
				i++
			}
		}
	}
	if err := fetchLogs(cfg, tail, follow); err != nil {
		fmt.Fprintf(os.Stderr, "logs: %v\n", err)
		os.Exit(1)
	}
}

func printBuildPlain(cfg Config, args []string) {
	tail := 80
	for i := 0; i < len(args); i++ {
		if args[i] == "--tail" && i+1 < len(args) {
			fmt.Sscanf(args[i+1], "%d", &tail)
			i++
		}
	}
	out, err := fetchDeployLog(cfg, tail)
	if err != nil {
		fmt.Fprintf(os.Stderr, "build: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(out)
}

func printUsage() {
	fmt.Print(`offerkp — Selectel Lainey ops dashboard (live build/status)

Usage:
  offerkp                 TUI → Status (auto-refresh)
  offerkp status          TUI → Status
  offerkp health          TUI → Health
  offerkp logs            TUI → Logs (live)
  offerkp build           TUI → Build / deploy log

  offerkp status --plain  text snapshot (post-commit hook)
  offerkp health --plain
  offerkp logs --plain [-f] [--tail N]
  offerkp build --plain

In TUI: Tab / ←→ / 1-4 · f live follow · r refresh · q quit

Env (optional):
  LAINEY_HOST / OFFERKP_HOST          default 87.228.90.43
  LAINEY_SSH_USER / OFFERKP_SSH_USER  default root
  OFFERKP_SSH_KEY                     SSH private key path
  OFFERKP_PUBLIC_URL                  default http://offer-ibm.ru
  OFFERKP_CONTAINER                   default offer-kp

Skip post-commit check: OFFERKP_OPS_SKIP=1 git commit ...
`)
}
