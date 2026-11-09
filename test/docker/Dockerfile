# The headless box: a Linux container that runs VS Code on a virtual display, so a test run
# never opens a window on the developer's screen, takes the keyboard or the clipboard
# (docs/decisions/025). Native architecture, so Apple silicon runs linux-arm64 VS Code without
# emulation. The runner, scripts/headless.mjs, passes NODE_VERSION from .tool-versions.
ARG NODE_VERSION=24.22.1
FROM node:${NODE_VERSION}-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TZ=UTC

# Xvfb is the display and openbox the window manager that gives windows focus; dbus and
# gnome-keyring are the secret service VS Code's SecretStorage writes to on a Linux desktop. The
# libraries are what VS Code's Electron asks for; socat forwards the DevTools port, which Electron
# binds to the container's loopback only; rsync copies the checkout into the box.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb xauth openbox x11-utils dbus dbus-x11 gnome-keyring libsecret-1-0 libsecret-tools \
      libgtk-3-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libdbus-1-3 \
      libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxss1 libxtst6 libxkbfile1 \
      libxkbcommon0 libgbm1 libdrm2 libasound2 libcups2 libnotify4 \
      locales fonts-dejavu-core fonts-liberation fonts-noto-core fonts-noto-color-emoji \
      ca-certificates curl git rsync socat \
  && sed -i 's/^# *\(en_US.UTF-8 UTF-8\)/\1/' /etc/locale.gen && locale-gen \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

# Go and gopls for the language extension runner (layer 3). Declared after the packages, so
# another version rebuilds only these layers.
ARG GO_VERSION=1.26.10
ARG GOPLS_VERSION=v0.23.0
ARG TARGETARCH
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz" | tar -C /usr/local -xz \
  && GOBIN=/usr/local/bin GOPATH=/tmp/go GOCACHE=/tmp/go-cache /usr/local/go/bin/go install \
       "golang.org/x/tools/gopls@${GOPLS_VERSION}" \
  && rm -rf /tmp/go /tmp/go-cache
ENV PATH=/usr/local/go/bin:$PATH

# The checkout is mounted read-only and copied in, so its owner is not the container's.
RUN git config --global --add safe.directory '*' \
  && git config --global user.email box@example.com \
  && git config --global user.name 'Headless Box'

WORKDIR /work
ENTRYPOINT ["/src/test/docker/entrypoint.sh"]
