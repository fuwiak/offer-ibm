package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

func sshArgs(cfg Config, remoteCmd string) []string {
	args := []string{
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=8",
		"-o", "StrictHostKeyChecking=accept-new",
	}
	if cfg.SSHKey != "" {
		if _, err := os.Stat(cfg.SSHKey); err == nil {
			args = append(args, "-i", cfg.SSHKey)
		}
	}
	args = append(args, fmt.Sprintf("%s@%s", cfg.User, cfg.Host), remoteCmd)
	return args
}

func sshRun(cfg Config, remoteCmd string) (string, error) {
	cmd := exec.Command("ssh", sshArgs(cfg, remoteCmd)...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	out := strings.TrimSpace(stdout.String())
	if err != nil {
		msg := cleanSSHErr(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		if out != "" {
			return out, fmt.Errorf("%s", msg)
		}
		return "", fmt.Errorf("%s", msg)
	}
	return out, nil
}

func cleanSSHErr(raw string) string {
	var keep []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.Contains(line, "post-quantum key exchange") {
			continue
		}
		if strings.HasPrefix(line, "** ") {
			continue
		}
		keep = append(keep, line)
	}
	return strings.Join(keep, "\n")
}

func sshStream(cfg Config, remoteCmd string) error {
	cmd := exec.Command("ssh", sshArgs(cfg, remoteCmd)...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

type ContainerStatus struct {
	Name      string
	Running   bool
	Status    string
	Image     string
	Created   string
	StartedAt string
	Ports     string
	Raw       string
	Err       string
	Mode      string // docker | systemd
}

type DeployStatus struct {
	Ready      string
	OutMtime   string
	GitHead    string
	GitDate    string
	GitSubject string
	DeployLog  string
	Err        string
}

type StatusSnapshot struct {
	FetchedAt time.Time
	Container ContainerStatus
	Deploy    DeployStatus
	Health    []HealthResult
}

func fetchContainerStatus(cfg Config) ContainerStatus {
	// Prefer systemd unit (Selectel Lainey production), fall back to docker.
	script := fmt.Sprintf(`
set +e
UNIT=%q
C=%q
PORT=%q

if systemctl cat "$UNIT" >/dev/null 2>&1; then
  echo "MODE=systemd"
  echo "NAME=$UNIT"
  ACTIVE=$(systemctl is-active "$UNIT" 2>/dev/null || echo unknown)
  SUB=$(systemctl show -p SubState --value "$UNIT" 2>/dev/null || true)
  MAIN=$(systemctl show -p MainPID --value "$UNIT" 2>/dev/null || true)
  SINCE=$(systemctl show -p ActiveEnterTimestamp --value "$UNIT" 2>/dev/null || true)
  echo "STATUS=$ACTIVE/$SUB"
  if [ "$ACTIVE" = "active" ]; then echo "RUNNING=true"; else echo "RUNNING=false"; fi
  echo "IMAGE=pid:$MAIN"
  echo "STARTED=$SINCE"
  echo "PORTS=:$PORT"
  exit 0
fi

if docker inspect "$C" >/dev/null 2>&1; then
  echo "MODE=docker"
  echo "NAME=$(docker inspect -f '{{.Name}}' "$C" | sed 's#^/##')"
  echo "STATUS=$(docker inspect -f '{{.State.Status}}' "$C")"
  echo "RUNNING=$(docker inspect -f '{{.State.Running}}' "$C")"
  echo "IMAGE=$(docker inspect -f '{{.Config.Image}}' "$C")"
  echo "CREATED=$(docker inspect -f '{{.Created}}' "$C")"
  echo "STARTED=$(docker inspect -f '{{.State.StartedAt}}' "$C")"
  echo "PORTS=$(docker inspect -f '{{range $p, $c := .NetworkSettings.Ports}}{{$p}} {{end}}' "$C")"
  exit 0
fi

echo "MODE=none"
echo "MISSING"
`, cfg.Container+".service", cfg.Container, cfg.AppPort)

	out, err := sshRun(cfg, script)
	cs := ContainerStatus{Name: cfg.Container, Raw: out}
	if err != nil {
		cs.Err = err.Error()
		return cs
	}
	if strings.Contains(out, "MISSING") && !strings.Contains(out, "MODE=systemd") && !strings.Contains(out, "MODE=docker") {
		cs.Err = "service/container not found"
		return cs
	}
	for _, line := range strings.Split(out, "\n") {
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch k {
		case "MODE":
			cs.Mode = v
		case "NAME":
			cs.Name = v
		case "STATUS":
			cs.Status = v
		case "RUNNING":
			cs.Running = v == "true"
		case "IMAGE":
			cs.Image = v
		case "CREATED":
			cs.Created = v
		case "STARTED":
			cs.StartedAt = v
		case "PORTS":
			cs.Ports = strings.TrimSpace(v)
		}
	}
	return cs
}

func fetchDeployStatus(cfg Config) DeployStatus {
	script := fmt.Sprintf(`
READY=%q
ROOT=%q
LOG=%q
SRC=%q/src
echo "READY=$(cat "$READY" 2>/dev/null || true)"
echo "OUT_MTIME=$(stat -c '%%y' "$ROOT/app" 2>/dev/null || stat -c '%%y' "$ROOT" 2>/dev/null || true)"
if [ -d "$SRC/.git" ]; then
  echo "GIT_HASH=$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || true)"
  echo "GIT_DATE=$(git -C "$SRC" log -1 --pretty=%%ci 2>/dev/null || true)"
  echo "GIT_SUBJECT=$(git -C "$SRC" log -1 --pretty=%%s 2>/dev/null || true)"
elif [ -f "$READY" ]; then
  IFS='|' read -r h d s < "$READY" || true
  echo "GIT_HASH=$h"
  echo "GIT_DATE=$d"
  echo "GIT_SUBJECT=$s"
fi
if [ -f "$LOG" ]; then
  echo "LOG_TAIL<<EOF"
  tail -n 40 "$LOG" 2>/dev/null || true
  echo "EOF"
fi
`, cfg.ReadyFile, cfg.RemoteRoot, cfg.DeployLog, cfg.RemoteRoot)

	out, err := sshRun(cfg, script)
	ds := DeployStatus{}
	if err != nil {
		ds.Err = err.Error()
		return ds
	}
	lines := strings.Split(out, "\n")
	inLog := false
	var logBuf []string
	for _, line := range lines {
		if line == "LOG_TAIL<<EOF" {
			inLog = true
			continue
		}
		if inLog {
			if line == "EOF" {
				inLog = false
				continue
			}
			logBuf = append(logBuf, line)
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		switch k {
		case "READY":
			ds.Ready = v
		case "OUT_MTIME":
			ds.OutMtime = v
		case "GIT_HASH":
			ds.GitHead = v
		case "GIT_DATE":
			ds.GitDate = formatCommitDate(v)
		case "GIT_SUBJECT":
			ds.GitSubject = v
		}
	}
	ds.DeployLog = strings.Join(logBuf, "\n")
	return ds
}

func fetchStatus(cfg Config) StatusSnapshot {
	return StatusSnapshot{
		FetchedAt: time.Now(),
		Container: fetchContainerStatus(cfg),
		Deploy:    fetchDeployStatus(cfg),
		Health:    probeAllHealth(cfg),
	}
}

func fetchLogs(cfg Config, tail int, follow bool) error {
	if follow {
		commits := fetchCommits(cfg, 8)
		fmt.Print(formatLogsView(commits, "(following service logs…)\n"))
		// Prefer journalctl for systemd; docker logs as fallback.
		return sshStream(cfg, fmt.Sprintf(
			`if systemctl cat %q >/dev/null 2>&1; then journalctl -u %q -f -n %d --no-pager; else docker logs -f --timestamps --tail %d %q; fi`,
			cfg.Container+".service", cfg.Container+".service", tail, tail, cfg.Container,
		))
	}
	b := fetchLogsBundle(cfg, tail)
	if b.Err != "" {
		fmt.Print(b.Text)
		return fmt.Errorf("%s", b.Err)
	}
	fmt.Print(b.Text)
	return nil
}

func fetchDeployLog(cfg Config, tail int) (string, error) {
	return sshRun(cfg, fmt.Sprintf(
		`tail -n %d %q 2>&1 || echo '(no deploy/build log yet)'`,
		tail, cfg.DeployLog,
	))
}
