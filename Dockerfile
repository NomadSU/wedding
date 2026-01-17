# Простой статический хостинг на Nginx
FROM nginx:1.27-alpine

# Конфиг Nginx (try_files + index)
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

EXPOSE 80
