FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir git+https://github.com/aromeni/hermes-self-healing-suite.git

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# App code is bind-mounted at runtime (./backend:/app).
# hermes CLI is installed from /hermes-cli at container start via entrypoint.sh.
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
