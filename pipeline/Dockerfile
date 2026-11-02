FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pipeline.py .

ENV DBT_PROFILES_DIR=/dbt
CMD ["python", "-u", "pipeline.py"]
