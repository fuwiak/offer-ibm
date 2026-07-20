package main

import (
	"os"
	"path/filepath"
)

type Config struct {
	Host           string
	User           string
	SSHKey         string
	Container      string
	RemoteRoot     string
	HealthPath     string
	PublicURL      string
	PublicIP       string
	DeployLog      string
	ReadyFile      string
	AppPort        string
	GitHubRepo     string
	GitHubWorkflow string
}

func loadConfig() Config {
	home, _ := os.UserHomeDir()
	key := envOr("OFFERKP_SSH_KEY", envOr("LAINEY_SSH_KEY", ""))
	if key == "" {
		for _, candidate := range []string{
			filepath.Join(home, ".ssh", "lainey_offer_ibm"),
			filepath.Join(home, ".ssh", "lainey"),
			filepath.Join(home, ".ssh", "selectel"),
			filepath.Join(home, ".ssh", "id_ed25519"),
			filepath.Join(home, ".ssh", "id_rsa"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				key = candidate
				break
			}
		}
	}
	return Config{
		Host:           envOr("OFFERKP_HOST", envOr("LAINEY_HOST", "87.228.90.43")),
		User:           envOr("OFFERKP_SSH_USER", envOr("LAINEY_SSH_USER", "root")),
		SSHKey:         key,
		Container:      envOr("OFFERKP_CONTAINER", "offer-kp"),
		RemoteRoot:     envOr("OFFERKP_REMOTE_ROOT", "/opt/offer-kp"),
		HealthPath:     envOr("OFFERKP_HEALTH_PATH", "/ping"),
		PublicURL:      envOr("OFFERKP_PUBLIC_URL", "http://offer-ibm.ru"),
		PublicIP:       envOr("OFFERKP_PUBLIC_IP", "http://87.228.90.43"),
		DeployLog:      envOr("OFFERKP_DEPLOY_LOG", "/opt/offer-kp/build.log"),
		ReadyFile:      envOr("OFFERKP_READY_FILE", "/opt/offer-kp/READY"),
		AppPort:        envOr("OFFERKP_APP_PORT", "3001"),
		GitHubRepo:     envOr("OFFERKP_GITHUB_REPO", "fuwiak/offer-ibm"),
		GitHubWorkflow: envOr("OFFERKP_GITHUB_WORKFLOW", "deploy-selectel.yml"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
