FROM python:3.11-slim

WORKDIR /app

# Install build dependencies needed by some packages (e.g. numpy, pandas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5050

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5050"]
