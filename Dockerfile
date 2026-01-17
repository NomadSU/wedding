# Один контейнер: Nginx (статический сайт) + FastAPI (RSVP + /admin)
#
# Почему так:
# На некоторых хостингах (в т.ч. Dockhost) по умолчанию запускается только ОДИН контейнер
# из корневого Dockerfile, без docker-compose. В этом режиме upstream "api" не существует,
# и /admin начинает отдавать 502.
#
# Решение: поднимаем FastAPI внутри этого же контейнера на 127.0.0.1:8000,
# а Nginx проксирует /api/* и /admin* туда.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Nginx + утилиты
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx ca-certificates bash \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

# --- FastAPI ---
WORKDIR /app
COPY api/ /app/api/
RUN pip install --no-cache-dir -r /app/api/requirements.txt

# Данные (SQLite). По умолчанию API использует /data/rsvp.db
COPY data/ /data/
VOLUME ["/data"]

# --- Nginx ---
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Сайт (только публичные файлы)
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY img/ /usr/share/nginx/html/img/
COPY ws/ /usr/share/nginx/html/ws/
COPY get/ /usr/share/nginx/html/get/
COPY s/ /usr/share/nginx/html/s/
COPY vladimirliliya/ /usr/share/nginx/html/vladimirliliya/
COPY css2 /usr/share/nginx/html/css2
COPY index.html /usr/share/nginx/html/index.html

# Стартовый скрипт (поднимает uvicorn + nginx)
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80
CMD ["/start.sh"]
