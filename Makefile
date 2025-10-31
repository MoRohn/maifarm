PYTHON ?= python3
VENV ?= .venv
VENV_PYTHON := $(VENV)/bin/python
DEV_REQUIREMENTS ?= requirements-dev.txt
POETRY ?= poetry

ifneq (,$(wildcard $(VENV_PYTHON)))
PYTHON_BIN := $(VENV_PYTHON)
else
PYTHON_BIN := $(PYTHON)
endif

PIP := $(PYTHON_BIN) -m pip
RUFF := $(PYTHON_BIN) -m ruff
MYPY := $(PYTHON_BIN) -m mypy
PYTEST := $(PYTHON_BIN) -m pytest
UVICORN := $(PYTHON_BIN) -m uvicorn
UVICORN_APP := $(shell $(PYTHON_BIN) - <<'PY'
import importlib.util
target = "maifarm.apps.orchestrator.main:app"
if importlib.util.find_spec("maifarm.apps.orchestrator.main") is None:
    target = "apps.orchestrator.main:app"
print(target, end="")
PY
)

.PHONY: install install-poetry ensure-dev-tools lint format typecheck test dev build docker-build docker-run clean ci ci-docker

install:
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/python -m pip install --upgrade pip
	$(VENV)/bin/python -m pip install -r requirements.txt
	$(VENV)/bin/python -m pip install -r $(DEV_REQUIREMENTS)

install-poetry:
	$(POETRY) install

ensure-dev-tools:
	@missing="$$($(PYTHON_BIN) - <<'PY'
import importlib.util
packages = ("ruff", "mypy")
missing = [pkg for pkg in packages if importlib.util.find_spec(pkg) is None]
print(" ".join(missing))
PY
)"; \
	if [ -n "$$missing" ]; then \
		echo "Installing $${missing} from $(DEV_REQUIREMENTS)"; \
		$(PIP) install -r $(DEV_REQUIREMENTS); \
	fi

lint: ensure-dev-tools
	$(RUFF) check apps/orchestrator

format:
	$(PYTHON_BIN) -m black apps/orchestrator

typecheck: ensure-dev-tools
	$(MYPY) --strict apps/orchestrator

test:
	$(PYTEST) apps/orchestrator/tests

dev:
	$(UVICORN) $(UVICORN_APP) --host 0.0.0.0 --port 8000 --reload

build:
	@if command -v docker >/dev/null 2>&1 && { [ -S /var/run/docker.sock ] || [ -S $$HOME/.docker/run/docker.sock ]; }; then \\
		docker build -t maifarm-orchestrator .; \\
	else \\
		echo "Docker socket unavailable; skipping container build."; \\
	fi

docker-build:
	docker build -t maifarm-orchestrator .

docker-run:
	docker compose up

clean:
	rm -rf $(VENV)

ci:
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) test

ci-docker:
	$(MAKE) build
