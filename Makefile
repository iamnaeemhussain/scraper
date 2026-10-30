# LeadBridge — common developer tasks.
# `make help` lists everything.
.DEFAULT_GOAL := help
PY ?= python3
VENV := .venv
BIN := $(VENV)/bin

.PHONY: help install backend-install frontend-install dev api web seed test test-frontend build clean backup

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: backend-install frontend-install  ## Install backend + frontend dependencies

$(VENV):
	$(PY) -m venv $(VENV)

backend-install: $(VENV)  ## Install Python dependencies (core + Scrapling extras)
	$(BIN)/pip install --upgrade pip
	$(BIN)/pip install -r backend/requirements.txt
	$(BIN)/pip install -r backend/requirements-dev.txt

frontend-install:  ## Install frontend dependencies
	cd frontend && npm install

api:  ## Run the API on http://localhost:8000 (auto-reload)
	cd backend && ../$(BIN)/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web:  ## Run the Vite dev server on http://localhost:5173 (proxies /api)
	cd frontend && npm run dev

dev:  ## Reminder: run `make api` and `make web` in two terminals
	@echo "Run 'make api' in one terminal and 'make web' in another, then open http://localhost:5173"

seed:  ## (Re)seed the demo database — destructive
	rm -f backend/data/leadbridge.db backend/data/leadbridge.db-wal backend/data/leadbridge.db-shm
	cd backend && ../$(BIN)/python -c "from app.seed import seed_database; from app.database import Base, engine, SessionLocal; Base.metadata.create_all(engine); db=SessionLocal(); print(seed_database(db, force=True))"

test:  ## Run the backend test suite
	cd backend && ../$(BIN)/python -m pytest -q

test-frontend:  ## Build the frontend and exercise every route in jsdom
	cd frontend && npm run build
	cd frontend && npm run smoke

build:  ## Build the production frontend bundle into frontend/dist
	cd frontend && npm run build

backup:  ## Write a timestamped SQLite backup into ./backups
	@mkdir -p backups
	$(BIN)/python -c "import sqlite3,datetime,os; src='backend/data/leadbridge.db'; dst=f\"backups/leadbridge-{datetime.datetime.now():%Y%m%d-%H%M%S}.db\"; c=sqlite3.connect(src); c.execute(f\"VACUUM INTO '{dst}'\"); c.close(); print('wrote', dst, os.path.getsize(dst), 'bytes')"

clean:  ## Remove caches and build output
	rm -rf frontend/dist .pytest_cache backend/**/__pycache__ backend/.pytest_cache
