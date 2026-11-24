"""Start the official Langfuse Compose distribution for local CreateForm evaluation."""

import os
import subprocess
from pathlib import Path
from secrets import token_hex
from time import monotonic, sleep
from urllib.error import URLError
from urllib.request import urlopen

STATE = Path(__file__).resolve().parents[1] / ".langfuse-evaluation"
UPSTREAM = (
    "https://raw.githubusercontent.com/langfuse/langfuse/"
    "34aea7dae6c1681a3df5e6a48a3e8ac2d27afef9/docker-compose.yml"
)
URL = "http://localhost:3300"
OVERRIDE = """services:
  langfuse-web:
    ports: !override ["127.0.0.1:3300:3000"]
  minio:
    ports: !override ["127.0.0.1:9390:9000"]
  langfuse-worker:
    ports: !reset []
  postgres:
    ports: !reset []
  redis:
    ports: !reset []
  clickhouse:
    ports: !reset []
"""


def main():
    STATE.mkdir(mode=0o700, exist_ok=True)
    compose, override, env = (
        STATE / name for name in ("compose.yml", "local.yml", "langfuse.env")
    )
    if not compose.exists():
        with urlopen(UPSTREAM, timeout=30) as upstream:
            compose.write_bytes(upstream.read())
    override.write_text(OVERRIDE)
    if not env.exists():
        public_key, secret_key = "pk-lf-" + token_hex(16), "sk-lf-" + token_hex(24)
        postgres_password, minio_password = token_hex(24), token_hex(24)
        entries = {
            "NEXTAUTH_URL": URL,
            "NEXTAUTH_SECRET": token_hex(24),
            "SALT": token_hex(24),
            "ENCRYPTION_KEY": token_hex(32),
            "TELEMETRY_ENABLED": "false",
            "POSTGRES_PASSWORD": postgres_password,
            "DATABASE_URL": f"postgresql://postgres:{postgres_password}@postgres:5432/postgres",
            "CLICKHOUSE_PASSWORD": token_hex(24),
            "REDIS_AUTH": token_hex(24),
            "MINIO_ROOT_PASSWORD": minio_password,
            "LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY": minio_password,
            "LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY": minio_password,
            "LANGFUSE_DISABLE_SIGNUP_ONBOARDING": "true",
            "LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT": "http://localhost:9390",
            "LANGFUSE_INIT_ORG_ID": "dynamic-form-engine",
            "LANGFUSE_INIT_ORG_NAME": "Dynamic Form Engine",
            "LANGFUSE_INIT_PROJECT_ID": "createform-evaluation",
            "LANGFUSE_INIT_PROJECT_NAME": "CreateForm Evaluation",
            "LANGFUSE_INIT_USER_EMAIL": "eval@localhost.test",
            "LANGFUSE_INIT_USER_PASSWORD": token_hex(18),
            "LANGFUSE_INIT_PROJECT_PUBLIC_KEY": public_key,
            "LANGFUSE_INIT_PROJECT_SECRET_KEY": secret_key,
            "LANGFUSE_BASE_URL": URL,
            "LANGFUSE_PUBLIC_KEY": public_key,
            "LANGFUSE_SECRET_KEY": secret_key,
        }
        with os.fdopen(
            os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w"
        ) as file:
            file.writelines(f"{key}={value}\n" for key, value in entries.items())
    subprocess.run(
        [
            "docker",
            "compose",
            "--progress",
            "quiet",
            "--project-name",
            "form-agent-langfuse",
            "--env-file",
            str(env),
            "-f",
            str(compose),
            "-f",
            str(override),
            "up",
            "-d",
            "--wait",
            "--wait-timeout",
            "180",
            "langfuse-web",
            "langfuse-worker",
        ],
        check=True,
    )
    end = monotonic() + 90
    while True:
        try:
            with urlopen(f"{URL}/api/public/health", timeout=3) as response:
                if response.status == 200:
                    break
        except (OSError, URLError):
            if monotonic() >= end:
                raise RuntimeError(
                    f"Langfuse started but its Web health endpoint did not respond at {URL}"
                )
        sleep(2)
    print(f"Langfuse: {URL}/project/createform-evaluation")
    print(f"Local settings: {env}")


if __name__ == "__main__":
    main()
