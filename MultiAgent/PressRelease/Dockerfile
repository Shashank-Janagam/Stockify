FROM python:3.11-slim

# Install cron and system build dependencies
RUN apt-get update && apt-get install -y \
    cron \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Set up the cron job configuration
COPY crontab /etc/cron.d/pressrelease-cron
RUN chmod 0644 /etc/cron.d/pressrelease-cron && crontab /etc/cron.d/pressrelease-cron

# Copy and set executable permissions for entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use entrypoint script to boot
ENTRYPOINT ["/entrypoint.sh"]
