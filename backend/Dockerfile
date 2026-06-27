FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir git+https://github.com/aromeni/hermes-self-healing-suite.git
RUN pip install --no-cache-dir pytest

RUN npm install -g @anthropic-ai/claude-code

# Patch hermes: pass ANTHROPIC_API_KEY through to the claude subprocess
COPY patch_hermes.py /tmp/patch_hermes.py
RUN python3 /tmp/patch_hermes.py

# Include the prompts directory that setup.py omits from the pip install
COPY sre_protocol.md /usr/local/lib/python3.12/site-packages/prompts/sre_protocol.md

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# claude refuses --dangerously-skip-permissions when running as root
RUN useradd -m -u 1000 hermesuser
USER hermesuser

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
