package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type mode int

const (
	modeStatus mode = iota
	modeHealth
	modeLogs
	modeBuild
	modeCICD
	modeHelp
)

var tabOrder = []mode{modeStatus, modeHealth, modeLogs, modeBuild, modeCICD}

type snapshotMsg struct {
	snap StatusSnapshot
}

type logsMsg struct {
	text string
	err  string
}

type buildLogMsg struct {
	text string
	err  string
}

type cicdMsg struct {
	snap CICDSnapshot
}

type tickMsg time.Time

type model struct {
	cfg          Config
	width        int
	height       int
	mode         mode
	flash        string
	loading      bool
	follow       bool
	snap         StatusSnapshot
	cicd         CICDSnapshot
	logs         string
	buildLog     string
	vp           viewport.Model
	ready        bool
	clock        time.Time
	pollInFlight bool
}

func newModel(cfg Config, start mode) model {
	follow := start == modeLogs || start == modeStatus || start == modeHealth || start == modeBuild || start == modeCICD
	return model{
		cfg:     cfg,
		mode:    start,
		flash:   "loading…",
		loading: true,
		follow:  follow,
		vp:      viewport.New(80, 20),
		clock:   time.Now(),
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(m.refreshCmd(), tickCmd())
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

func loadSnapshotCmd(cfg Config) tea.Cmd {
	return func() tea.Msg {
		return snapshotMsg{snap: fetchStatus(cfg)}
	}
}

func loadLogsCmd(cfg Config) tea.Cmd {
	return func() tea.Msg {
		b := fetchLogsBundle(cfg, 200)
		if b.Err != "" {
			return logsMsg{text: b.Text, err: b.Err}
		}
		return logsMsg{text: b.Text}
	}
}

func loadBuildLogCmd(cfg Config) tea.Cmd {
	return func() tea.Msg {
		commits := fetchCommits(cfg, 8)
		out, err := fetchDeployLog(cfg, 120)
		if err != nil {
			return buildLogMsg{err: err.Error(), text: formatLogsView(commits, "ERR "+err.Error())}
		}
		return buildLogMsg{text: formatLogsView(commits, out)}
	}
}

func loadCICDCmd(cfg Config) tea.Cmd {
	return func() tea.Msg {
		return cicdMsg{snap: fetchCICD(cfg)}
	}
}

func (m model) refreshCmd() tea.Cmd {
	switch m.mode {
	case modeLogs:
		return loadLogsCmd(m.cfg)
	case modeBuild:
		return loadBuildLogCmd(m.cfg)
	case modeCICD:
		return loadCICDCmd(m.cfg)
	case modeHelp:
		return nil
	default:
		return loadSnapshotCmd(m.cfg)
	}
}

func (m model) pageTitle() string {
	switch m.mode {
	case modeStatus:
		return "STATUS"
	case modeHealth:
		return "HEALTH"
	case modeLogs:
		return "LOGS"
	case modeBuild:
		return "BUILD"
	case modeCICD:
		return "CI/CD"
	case modeHelp:
		return "HELP"
	default:
		return "OFFERKP"
	}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.layout()
		m.ready = true
		m.refreshViewport(false)
		return m, nil

	case tickMsg:
		m.clock = time.Time(msg)
		cmds := []tea.Cmd{tickCmd()}
		if m.follow && !m.pollInFlight && m.mode != modeHelp {
			sec := m.clock.Second()
			interval := 5
			if m.mode == modeLogs || m.mode == modeBuild {
				interval = 2
			}
			if m.mode == modeCICD {
				interval = 8
			}
			if sec%interval == 0 {
				m.pollInFlight = true
				cmds = append(cmds, m.refreshCmd())
			}
		}
		return m, tea.Batch(cmds...)

	case snapshotMsg:
		m.snap = msg.snap
		m.loading = false
		m.pollInFlight = false
		ok := 0
		for _, h := range msg.snap.Health {
			if h.OK {
				ok++
			}
		}
		state := "DOWN"
		if msg.snap.Container.Running {
			state = "UP"
		}
		m.flash = fmt.Sprintf("%s · health %d/%d · %s", state, ok, len(msg.snap.Health), msg.snap.FetchedAt.Format("15:04:05"))
		m.refreshViewport(false)
		return m, nil

	case logsMsg:
		m.loading = false
		m.pollInFlight = false
		atBottom := m.vp.AtBottom()
		if msg.err != "" {
			m.logs = "ERR " + msg.err
			m.flash = "logs failed"
		} else {
			m.logs = msg.text
			tag := "live"
			if !m.follow {
				tag = "paused"
			}
			m.flash = fmt.Sprintf("logs %s · %s", tag, m.clock.Format("15:04:05"))
		}
		// Stick to bottom only while following and already at the end — never
		// yank the viewport when the user is scrolling with ↑/↓.
		m.refreshViewport(m.follow && atBottom)
		return m, nil

	case buildLogMsg:
		m.loading = false
		m.pollInFlight = false
		atBottom := m.vp.AtBottom()
		if msg.err != "" {
			m.buildLog = "ERR " + msg.err
			m.flash = "build log failed"
		} else {
			m.buildLog = msg.text
			m.flash = fmt.Sprintf("build · %s", m.clock.Format("15:04:05"))
		}
		m.refreshViewport(m.follow && atBottom)
		return m, nil

	case cicdMsg:
		m.cicd = msg.snap
		m.loading = false
		m.pollInFlight = false
		if msg.snap.Err != "" {
			m.flash = "ci/cd failed"
		} else if len(msg.snap.Runs) > 0 {
			r := msg.snap.Runs[0]
			m.flash = fmt.Sprintf("%s · %s · %s", cicdState(r.Status, r.Conclusion), shortSHA(r.HeadSha), msg.snap.FetchedAt.Format("15:04:05"))
		} else {
			m.flash = fmt.Sprintf("ci/cd · %s", msg.snap.FetchedAt.Format("15:04:05"))
		}
		m.refreshViewport(false)
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m *model) layout() {
	m.vp.Width = max(20, m.width)
	m.vp.Height = max(3, m.height-3)
}

func (m *model) refreshViewport(stickBottom bool) {
	offset := m.vp.YOffset
	m.vp.SetContent(m.body())
	if stickBottom {
		m.vp.GotoBottom()
		return
	}
	// Preserve scroll position across content refresh / live poll.
	m.vp.SetYOffset(offset)
}

func (m model) switchTab(next mode) (tea.Model, tea.Cmd) {
	m.mode = next
	m.loading = true
	m.pollInFlight = true
	m.flash = "loading " + m.pageTitle() + "…"
	if next == modeLogs || next == modeStatus || next == modeHealth || next == modeBuild || next == modeCICD {
		m.follow = true
	}
	m.refreshViewport(false)
	return m, m.refreshCmd()
}

func (m model) tabIndex() int {
	for i, t := range tabOrder {
		if t == m.mode {
			return i
		}
	}
	return 0
}

func (m model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit
	case "r":
		m.loading = true
		m.pollInFlight = true
		m.flash = "refresh…"
		return m, m.refreshCmd()
	case "f":
		m.follow = !m.follow
		if m.follow {
			m.flash = "follow ON"
			m.pollInFlight = true
			m.vp.GotoBottom()
			return m, m.refreshCmd()
		}
		m.flash = "follow OFF"
		return m, nil
	case "tab", "right":
		idx := (m.tabIndex() + 1) % len(tabOrder)
		return m.switchTab(tabOrder[idx])
	case "shift+tab", "left":
		idx := m.tabIndex() - 1
		if idx < 0 {
			idx = len(tabOrder) - 1
		}
		return m.switchTab(tabOrder[idx])
	case "1", "s":
		return m.switchTab(modeStatus)
	case "2":
		return m.switchTab(modeHealth)
	case "3":
		return m.switchTab(modeLogs)
	case "4":
		return m.switchTab(modeBuild)
	case "5", "c":
		return m.switchTab(modeCICD)
	case "?", "0":
		m.mode = modeHelp
		m.loading = false
		m.refreshViewport(false)
		return m, nil
	case "up", "k":
		m.vp.LineUp(1)
		// Scrolling away from the live tail pauses follow so polls don't jump.
		if (m.mode == modeLogs || m.mode == modeBuild) && m.follow && !m.vp.AtBottom() {
			m.follow = false
			m.flash = "follow OFF · scroll"
		}
		return m, nil
	case "down", "j":
		m.vp.LineDown(1)
		return m, nil
	case "pgup":
		m.vp.ViewUp()
		if (m.mode == modeLogs || m.mode == modeBuild) && m.follow && !m.vp.AtBottom() {
			m.follow = false
			m.flash = "follow OFF · scroll"
		}
		return m, nil
	case "pgdown", " ":
		m.vp.ViewDown()
		return m, nil
	case "home", "g":
		m.vp.GotoTop()
		if m.mode == modeLogs || m.mode == modeBuild {
			m.follow = false
			m.flash = "follow OFF · scroll"
		}
		return m, nil
	case "end", "G":
		m.vp.GotoBottom()
		return m, nil
	}
	return m, nil
}

func (m model) View() string {
	if !m.ready {
		return "…"
	}
	return lipgloss.JoinVertical(lipgloss.Left, m.header(), m.tabs(), m.vp.View(), m.footer())
}

func (m model) header() string {
	bg := lipgloss.Color("17")
	fg := lipgloss.Color("15")
	if len(m.snap.Health) > 0 {
		allOK := m.snap.Container.Running
		for _, h := range m.snap.Health {
			if !h.OK {
				allOK = false
				break
			}
		}
		if allOK {
			bg = lipgloss.Color("#cc785c")
		} else if m.snap.Container.Running {
			bg = lipgloss.Color("58")
		} else if !m.loading {
			bg = lipgloss.Color("52")
		}
	} else if !m.loading && !m.snap.Container.Running {
		bg = lipgloss.Color("52")
	}

	style := lipgloss.NewStyle().Background(bg).Foreground(fg).Width(max(20, m.width))
	live := ""
	if m.follow {
		live = " LIVE"
	}
	left := fmt.Sprintf(" OFFERKP OPS · %s%s ", m.pageTitle(), live)
	right := trunc(m.flash, max(8, m.width-lipgloss.Width(left)-1))
	pad := max(0, m.width-lipgloss.Width(left)-lipgloss.Width(right))
	return style.Render(left + strings.Repeat(" ", pad) + right)
}

func (m model) tabs() string {
	inactive := lipgloss.NewStyle().Foreground(lipgloss.Color("245")).Padding(0, 1)
	active := lipgloss.NewStyle().Background(lipgloss.Color("#a9583e")).Foreground(lipgloss.Color("15")).Bold(true).Padding(0, 1)
	labels := []struct {
		mode  mode
		label string
	}{
		{modeStatus, "1 Status"},
		{modeHealth, "2 Health"},
		{modeLogs, "3 Logs"},
		{modeBuild, "4 Build"},
		{modeCICD, "5 CI/CD"},
	}
	parts := make([]string, 0, len(labels))
	for _, t := range labels {
		if t.mode == m.mode {
			parts = append(parts, active.Render(t.label))
		} else {
			parts = append(parts, inactive.Render(t.label))
		}
	}
	bar := lipgloss.JoinHorizontal(lipgloss.Top, parts...)
	pad := max(0, m.width-lipgloss.Width(bar))
	return bar + strings.Repeat(" ", pad)
}

func (m model) footer() string {
	style := lipgloss.NewStyle().Foreground(lipgloss.Color("245")).Width(max(20, m.width))
	follow := "f follow"
	if m.follow {
		follow = "f pause"
	}
	return style.Render(fmt.Sprintf(" Tab/←→ switch · %s · r refresh · ↑↓/jk scroll · ? help · q quit ", follow))
}

func (m model) body() string {
	if m.loading && m.logs == "" && m.buildLog == "" && m.mode != modeHelp && m.mode != modeCICD && len(m.snap.Health) == 0 && m.snap.Container.Name == "" {
		return "\n  loading…\n"
	}
	switch m.mode {
	case modeStatus:
		return renderStatus(m.snap, m.cfg)
	case modeHealth:
		if len(m.snap.Health) == 0 {
			return "\n  loading health…\n"
		}
		return "\n" + formatHealth(m.snap.Health) + "\n"
	case modeLogs:
		if m.logs == "" {
			return "\n  loading logs…\n"
		}
		return m.logs + "\n"
	case modeBuild:
		if m.buildLog == "" {
			return "\n  loading build log…\n"
		}
		return m.buildLog + "\n"
	case modeCICD:
		if m.loading && len(m.cicd.Runs) == 0 && m.cicd.Err == "" {
			return "\n  loading CI/CD…\n"
		}
		return renderCICD(m.cicd, m.cfg)
	case modeHelp:
		return helpText(m.cfg)
	default:
		return ""
	}
}

func renderStatus(s StatusSnapshot, cfg Config) string {
	var b strings.Builder
	c := s.Container
	d := s.Deploy

	b.WriteString("\n  Selectel Lainey  ·  live build / deploy status\n")
	b.WriteString("  " + strings.Repeat("─", 46) + "\n\n")
	b.WriteString(fmt.Sprintf("  host:        %s@%s\n", cfg.User, cfg.Host))
	b.WriteString(fmt.Sprintf("  mode:        %s\n", emptyDash(c.Mode)))
	b.WriteString(fmt.Sprintf("  service:     %s\n", c.Name))
	if c.Err != "" {
		b.WriteString(fmt.Sprintf("  state:       ERR %s\n", c.Err))
	} else {
		state := "stopped"
		if c.Running {
			state = "running"
		}
		b.WriteString(fmt.Sprintf("  state:       %s (%s)\n", state, c.Status))
		b.WriteString(fmt.Sprintf("  process:     %s\n", emptyDash(c.Image)))
		b.WriteString(fmt.Sprintf("  started:     %s\n", emptyDash(shortenTime(c.StartedAt))))
		b.WriteString(fmt.Sprintf("  ports:       %s\n", emptyDash(c.Ports)))
	}
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("  ready file:  %s\n", emptyDash(d.Ready)))
	b.WriteString(fmt.Sprintf("  root mtime:  %s\n", emptyDash(shortenTime(d.OutMtime))))
	if d.GitHead != "" || d.GitSubject != "" {
		b.WriteString(fmt.Sprintf("  commit:      %s\n", emptyDash(d.GitHead)))
		if d.GitDate != "" {
			b.WriteString(fmt.Sprintf("  commit date: %s\n", d.GitDate))
		}
		if d.GitSubject != "" {
			b.WriteString(fmt.Sprintf("  commit msg:  %s\n", d.GitSubject))
		}
	} else {
		b.WriteString("  commit:      —\n")
	}
	if d.Err != "" {
		b.WriteString(fmt.Sprintf("  deploy err:  %s\n", d.Err))
	}

	b.WriteString("\n  Network › Healthcheck\n")
	b.WriteString("  " + strings.Repeat("─", 46) + "\n")
	for _, h := range s.Health {
		mark := "✗"
		if h.OK {
			mark = "✓"
		}
		if h.Err != "" {
			b.WriteString(fmt.Sprintf("  %s %-8s  %s\n", mark, h.Name, h.Err))
		} else {
			b.WriteString(fmt.Sprintf("  %s %-8s  %d  %q  %s\n", mark, h.Name, h.StatusCode, trunc(h.Body, 40), h.Latency.Round(time.Millisecond)))
		}
	}
	b.WriteString(fmt.Sprintf("\n  fetched %s\n", s.FetchedAt.Format(time.RFC3339)))
	b.WriteString("\n  → 5 CI/CD for GitHub Actions · 4 Build · 3 Logs\n")
	return b.String()
}

func helpText(cfg Config) string {
	return fmt.Sprintf(`
  offerkp — Selectel Lainey ops dashboard

  Tabs
    1  Status   container + deploy + health
    2  Health   /ping probes
    3  Logs     journalctl / docker logs (live)
    4  Build    /opt/offer-kp/build.log
    5  CI/CD    GitHub Actions → Selectel deploy

  Keys
    Tab / ← →     switch tabs
    1 2 3 4 5     jump
    ↑ ↓ / j k     scroll (pauses live follow)
    PgUp / PgDn   page scroll
    f             live follow on/off
    r             refresh now
    q             quit

  CLI
    offerkp              open dashboard
    offerkp status       Status tab
    offerkp health       Health tab
    offerkp logs         Logs tab
    offerkp build        Build tab
    offerkp cicd         CI/CD tab
    offerkp status --plain
    offerkp cicd --plain

  Host: %s@%s  container=%s
  Public: %s
  CI: %s · %s
`, cfg.User, cfg.Host, cfg.Container, cfg.PublicURL, cfg.GitHubRepo, cfg.GitHubWorkflow)
}
