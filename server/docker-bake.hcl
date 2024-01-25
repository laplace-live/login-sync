variable "DEFAULT_TAG" {
  default = ["laplace-live/laplace-login-sync-server:local"]
}

# Special target: https://github.com/docker/metadata-action#bake-definition
target "docker-metadata-action" {}

# Default target if none specified
group "default" {
  targets = ["build-local"]
}

target "build" {
  inherits = ["docker-metadata-action"]
}

target "build-local" {
  inherits = ["build"]
  tags = "${DEFAULT_TAG}"
  output = ["type=docker"]
}

target "build-all" {
  inherits = ["build"]
  platforms = [
    "linux/amd64",
    "linux/arm64",
  ]
}
