FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/orchestrator ./apps/orchestrator
COPY pyproject.toml ./pyproject.toml

EXPOSE 8000

CMD ["uvicorn", "apps.orchestrator.main:app", "--host", "0.0.0.0", "--port", "8000"]
