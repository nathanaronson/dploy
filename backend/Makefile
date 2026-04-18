.PHONY: help install dev run test lint fmt fix clean reset-db

UV ?= uv
APP ?= app/main.py
HOST ?= 0.0.0.0
PORT ?= 8000

help:
	@echo "Targets:"
	@echo "  install    Install/sync dependencies via uv"
	@echo "  dev        Run FastAPI with hot reload (HOST=$(HOST) PORT=$(PORT))"
	@echo "  run        Run FastAPI in production mode"
	@echo "  test       Run pytest"
	@echo "  lint       Run ruff check"
	@echo "  fmt        Run ruff format"
	@echo "  fix        Run ruff check --fix"
	@echo "  reset-db   Delete the local SQLite DB"
	@echo "  clean      Remove caches and the local DB"

install:
	$(UV) sync

dev:
	$(UV) run fastapi dev $(APP) --host $(HOST) --port $(PORT)

run:
	$(UV) run fastapi run $(APP) --host $(HOST) --port $(PORT)

test:
	$(UV) run pytest

lint:
	$(UV) run ruff check .

fmt:
	$(UV) run ruff format .

fix:
	$(UV) run ruff check . --fix

reset-db:
	rm -f app.db app.db-journal

clean: reset-db
	rm -rf .pytest_cache .ruff_cache .mypy_cache **/__pycache__
